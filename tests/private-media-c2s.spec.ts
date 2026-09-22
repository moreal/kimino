import { test, expect } from '@playwright/test';
import { followToken } from './helpers/follow-c2s';
const directory = process.env.KIMINO_PRIVATE_MEDIA_FIXTURE_DIR;
const port = process.env.KIMINO_FOLLOW_PORT;
test.skip(
  !directory || port !== '18449',
  'Requires the retained isolated private-media fixture and known synthetic content',
);
test.use({
  ignoreHTTPSErrors: true,
  actionTimeout: 15000,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
  launchOptions: {
    args: ['--host-resolver-rules=MAP alice.test 127.0.0.1,MAP bob.test 127.0.0.1'],
  },
});
test('existing real followers image loads through the own authenticated ONI proxy and hides', async ({
  page,
}) => {
  const actor = `https://alice.test:${port}/`;
  const token = await followToken(actor, directory!);
  let directImage = 0,
    proxyReads = 0,
    leakedBearer = false;
  page.on('request', (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (
      url.hostname === 'bob.test' &&
      (request.resourceType() === 'image' || headers.accept === 'image/png')
    )
      directImage++;
    if (url.origin !== new URL(actor).origin && headers.authorization?.includes(token))
      leakedBearer = true;
    if (
      url.origin === new URL(actor).origin &&
      request.method() === 'POST' &&
      headers.accept === 'image/png'
    )
      proxyReads++;
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByLabel('액세스 토큰').evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, token);
  await page.getByText('이미지 게시 설정', { exact: true }).click();
  await page.getByLabel('ONI 이미지 게시 사용', { exact: true }).check();
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  const card = page
    .locator('.note-card')
    .filter({ hasText: 'Synthetic local media capability placeholder.' })
    .first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.locator('.attachment-alt')).toHaveText('Synthetic pixel');
  expect(proxyReads).toBe(0);
  await card.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
  const image = card.locator('img.attachment-image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1);
  expect(proxyReads).toBe(1);
  expect(directImage).toBe(0);
  expect(leakedBearer).toBe(false);
  await card.getByRole('button', { name: '이미지 숨기기', exact: true }).click();
  await expect(image).toHaveCount(0);
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
});

test('a real followers-only image reply survives an injected Note refusal and reaches a follower', async ({
  browser,
  page,
}) => {
  test.setTimeout(90000);
  const bob = `https://bob.test:${port}/`,
    alice = `https://alice.test:${port}/`;
  const otherContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: 'http://127.0.0.1:5173',
  });
  const other = await otherContext.newPage();
  const text = `Local restricted image reply ${Date.now()}`;
  const alt = 'A synthetic one-pixel image for the local follower';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8kAAAAASUVORK5CYII=',
    'base64',
  );
  const connect = async (target: typeof page, actor: string) => {
    const token = await followToken(actor, directory!);
    await target.goto('/');
    await target.getByLabel('Actor URL').fill(actor);
    await target.getByLabel('액세스 토큰').evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, token);
    await target.getByText('이미지 게시 설정', { exact: true }).click();
    await target.getByLabel('ONI 이미지 게시 사용', { exact: true }).check();
    await target.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(
      target.getByRole('button', { name: '사람 관리', exact: true }).first(),
    ).toBeEnabled({ timeout: 30000 });
  };
  let imagePosts = 0,
    notePosts = 0,
    privateAddressing = true;
  try {
    await connect(page, bob);
    await connect(other, alice);
    // The only injected failure is the first Note request, before it reaches ONI.
    // Image Create/hydration, final Note and all reception use the actual server.
    await page.route(`${bob}outbox`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      if (body.type === 'Create' && ['Image', 'Note'].includes(body.object?.type)) {
        const exact = (value: unknown) =>
          Array.isArray(value) && value.length === 1 && value[0] === `${bob}followers`;
        privateAddressing &&=
          exact(body.to) &&
          exact(body.object.to) &&
          body.cc?.length === 0 &&
          body.object.cc?.length === 0;
        if (body.object.type === 'Image') imagePosts++;
        else {
          notePosts++;
          if (notePosts === 1) return route.fulfill({ status: 503 });
        }
      }
      return route.continue();
    });
    const parent = page
      .locator('.note-card')
      .filter({ hasText: 'Synthetic local media capability placeholder.' })
      .first();
    await parent.getByRole('button', { name: /답글 달기/ }).click();
    const composer = page.locator('.inline-reply');
    await expect(composer.getByRole('radio', { name: '팔로워만', exact: true })).toBeChecked();
    await composer
      .locator('input[type=file]')
      .setInputFiles({ name: 'local-pixel.png', mimeType: 'image/png', buffer: png });
    await composer.getByLabel('이미지 1 대체 텍스트').fill(alt);
    await composer.getByLabel('답글 내용').fill(text);
    await composer.getByRole('button', { name: '답글 게시하기', exact: true }).click();
    await expect(composer.locator('.page-error')).toBeVisible();
    await expect(composer.getByLabel('답글 내용')).toHaveValue(text);
    await expect(composer.locator('.image-picker-status')).toContainText('업로드됨');
    expect(imagePosts).toBe(1);
    await composer.getByRole('button', { name: '답글 게시하기', exact: true }).click();
    await expect(composer).toHaveCount(0);
    expect(imagePosts).toBe(1);
    expect(notePosts).toBe(2);
    expect(privateAddressing).toBe(true);
    const received = other.locator('.note-card').filter({ hasText: text }).first();
    for (let attempt = 0; attempt < 10 && !(await received.isVisible()); attempt++) {
      await other.getByRole('button', { name: '타임라인 새로고침', exact: true }).click();
      await expect(
        other.getByRole('button', { name: '타임라인 새로고침', exact: true }),
      ).toBeEnabled();
    }
    await expect(received).toBeVisible();
    await expect(received.locator('.attachment-alt')).toHaveText(alt);
    await received.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
    const image = received.locator('img.attachment-image');
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    await received.getByRole('button', { name: '이미지 숨기기', exact: true }).click();
    await expect(image).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
