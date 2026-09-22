import { test, expect, type Page } from '@playwright/test';
import { actor, collection, origin, person } from './helpers/mock';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8kAAAAASUVORK5CYII=',
  'base64',
);
const file = { name: 'pixel.png', mimeType: 'image/png', buffer: png };

async function mediaServer(
  page: Page,
  options: {
    failNote?: boolean;
    unresolved?: boolean;
    uncertain?: boolean;
    delay?: Promise<void>;
    parent?: boolean;
    privateMedia?: boolean;
  } = {},
) {
  let images = 0,
    notes = 0,
    binary = 0;
  let unresolved = !!options.unresolved;
  const activities: Record<string, unknown>[] = options.parent
    ? [
        {
          id: `${origin}/activities/parent`,
          type: 'Create',
          actor,
          object: {
            id: `${origin}/notes/parent`,
            type: 'Note',
            attributedTo: actor,
            content: '<p>이미지 답글을 기다리는 글</p>',
            to: ['https://www.w3.org/ns/activitystreams#Public'],
          },
        },
      ]
    : [];
  const image = {
    id: `${origin}/images/1`,
    type: 'Image',
    attributedTo: actor,
    mediaType: 'image/png',
    name: '',
    to: [] as string[],
    cc: [] as string[],
  };
  const location = `${origin}/activities/image-1`;
  let postedNote: Record<string, unknown> | undefined;
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request(),
      url = request.url();
    if (request.method() === 'POST') {
      const activity = request.postDataJSON();
      if (activity.object.type === 'Image') {
        images++;
        if (options.delay) await options.delay;
        if (options.uncertain) return route.abort('failed');
        image.name = activity.object.name;
        image.to = activity.object.to;
        image.cc = activity.object.cc;
        activities.push({ id: location, type: 'Create', actor, object: { ...image } });
        return route.fulfill({
          status: 201,
          headers: { Location: location, 'Access-Control-Expose-Headers': 'Location' },
        });
      }
      notes++;
      if (options.failNote && notes === 1) return route.fulfill({ status: 503 });
      postedNote = { ...activity.object, id: `${origin}/notes/image-note` };
      const created = { ...activity, id: `${origin}/activities/note-1`, object: postedNote };
      activities.push(created);
      return route.fulfill({
        status: 201,
        headers: {
          Location: `${origin}/activities/note-1`,
          'Access-Control-Expose-Headers': 'Location',
        },
      });
    }
    if (url === actor)
      return route.fulfill({
        json: {
          ...person(actor, 'alice'),
          followers: `${actor}/followers`,
          ...(options.privateMedia
            ? { generator: { type: 'Service', id: 'urn:kimino:oni:private-media:1' } }
            : {}),
        },
      });
    if (url === location) {
      if (unresolved) return route.fulfill({ status: 503 });
      return route.fulfill({ json: { id: location, type: 'Create', actor, object: image } });
    }
    if (url === image.id) {
      if ((request.headers().accept ?? '').includes('image/')) {
        binary++;
        return route.fulfill({ contentType: 'image/png', body: png });
      }
      return route.fulfill({ json: image });
    }
    if (url === `${origin}/activities/note-1`) return route.fulfill({ json: activities.at(-1) });
    return route.fulfill({ json: collection(url.endsWith('/inbox') ? [] : activities) });
  });
  return {
    counts: () => ({ images, notes, binary }),
    note: () => postedNote,
    image: () => image,
    resolve: () => {
      unresolved = false;
    },
  };
}
async function connectImages(page: Page, remember = false) {
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByLabel('액세스 토큰').fill('media-test-token');
  await page.getByText('이미지 게시 설정', { exact: true }).click();
  await page.getByLabel('ONI 이미지 게시 사용', { exact: true }).check();
  if (remember) await page.getByLabel(/새로고침해도 이 탭에서 유지/).check();
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByLabel('새 글', { exact: true }).focus();
}
async function selectImage(page: Page) {
  await page.locator('.main-composer input[type=file]').setInputFiles(file);
  await expect(page.getByLabel('이미지 1 대체 텍스트')).toBeVisible();
}

test('local image selection preserves alt drafts without requests, and confirmed uploads survive a Note failure', async ({
  page,
}) => {
  const server = await mediaServer(page, { failNote: true });
  await connectImages(page);
  await selectImage(page);
  await page.getByLabel('이미지 1 대체 텍스트').fill('햇빛 아래 작은 점');
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await expect(page.getByLabel('이미지 1 대체 텍스트')).toHaveValue('햇빛 아래 작은 점');
  expect(server.counts()).toEqual({ images: 0, notes: 0, binary: 0 });
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'data:image',
  );
  await page.getByLabel('새 글', { exact: true }).fill('이미지와 함께 쓰는 글');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.image-picker-status')).toContainText('업로드됨');
  await expect(page.getByLabel('새 글', { exact: true })).toHaveValue('이미지와 함께 쓰는 글');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.note-card')).toContainText('이미지와 함께 쓰는 글');
  expect(server.counts()).toEqual({ images: 1, notes: 2, binary: 0 });
  expect(server.note()?.attachment).toEqual([
    {
      type: 'Image',
      id: `${origin}/images/1`,
      url: `${origin}/images/1`,
      mediaType: 'image/png',
      name: '햇빛 아래 작은 점',
    },
  ]);
  await expect(page.locator('.image-picker-preview')).toHaveCount(0);
});

test('confirmed unresolved upload recovers by reading its Location, never repeating the upload', async ({
  page,
}) => {
  const server = await mediaServer(page, { unresolved: true });
  await connectImages(page);
  await selectImage(page);
  await page.getByLabel('새 글', { exact: true }).fill('주소 확인 후 게시');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '업로드 확인', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  expect(server.counts().images).toBe(1);
  expect(server.counts().notes).toBe(0);
  server.resolve();
  await page.getByRole('button', { name: '업로드 확인', exact: true }).click();
  await expect(page.locator('.image-picker-status')).toContainText('업로드됨');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.note-card')).toContainText('주소 확인 후 게시');
  expect(server.counts()).toEqual({ images: 1, notes: 1, binary: 0 });
});

test('unknown upload outcome is quarantined and private scope sends no upload', async ({
  page,
}) => {
  const server = await mediaServer(page, { uncertain: true });
  await connectImages(page);
  await selectImage(page);
  await page.getByLabel('새 글', { exact: true }).fill('확인되지 않은 이미지');
  await page.getByRole('radio', { name: '팔로워만', exact: true }).check();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.composer .page-error')).toContainText('공개');
  expect(server.counts().images).toBe(0);
  await page.getByRole('radio', { name: '공개', exact: true }).check();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.image-picker-status')).toContainText('결과를 알 수 없어요');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  expect(server.counts()).toEqual({ images: 1, notes: 0, binary: 0 });
});

test('remembering the server option never persists local image bytes', async ({ page }) => {
  await mediaServer(page);
  await connectImages(page, true);
  await selectImage(page);
  const record = await page.evaluate(() => sessionStorage.getItem('kimino.session'));
  expect(JSON.parse(record!).mediaMode).toBe('oni');
  expect(record).not.toContain('data:image');
  await page.reload();
  await page.getByLabel('새 글', { exact: true }).focus();
  await expect(page.getByRole('button', { name: '이미지 추가', exact: true })).toBeEnabled();
  await expect(page.locator('.image-picker-preview')).toHaveCount(0);
});

test('a remounted reply cannot resend while its image upload is still pending', async ({
  page,
}) => {
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await mediaServer(page, { parent: true, delay });
  await connectImages(page);
  const parent = page.locator(`.note-card[data-note="${origin}/notes/parent"]`);
  await parent.getByRole('button', { name: /에게 답글 달기/ }).click();
  await page.locator('.inline-reply input[type=file]').setInputFiles(file);
  await expect(page.locator('.inline-reply .image-picker-preview')).toHaveCount(1);
  await page.getByLabel('답글 내용').fill('기다리는 이미지 답글');
  await page.getByRole('button', { name: '답글 게시하기', exact: true }).click();
  await expect(page.locator('.inline-reply .image-picker-status')).toContainText('업로드 중');
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await parent.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(page.getByRole('button', { name: '답글 게시하기', exact: true })).toBeDisabled();
  await expect(page.getByLabel('답글 내용')).toBeDisabled();
  release();
  await expect(page.locator('.note-card', { hasText: '기다리는 이미지 답글' })).toBeVisible();
  expect(server.counts()).toEqual({ images: 1, notes: 1, binary: 0 });
  await parent.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(page.getByLabel('답글 내용')).toHaveValue('');
  await expect(page.locator('.inline-reply .image-picker-preview')).toHaveCount(0);
});

test('leaving a reply while its local file is read discards late completion without uploading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) {
      this.addEventListener(
        'loadend',
        () => {
          (window as unknown as { imageReadFinished: boolean }).imageReadFinished = true;
        },
        { once: true },
      );
      (window as unknown as { releaseImageRead: () => void }).releaseImageRead = () =>
        original.call(this, file);
    };
  });
  const server = await mediaServer(page, { parent: true });
  await connectImages(page);
  const parent = page.locator(`.note-card[data-note="${origin}/notes/parent"]`);
  await parent.getByRole('button', { name: /에게 답글 달기/ }).click();
  await page.locator('.inline-reply input[type=file]').setInputFiles(file);
  await expect(page.locator('.inline-reply')).toContainText('이미지를 읽는 중');
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.locator('.inline-reply')).toHaveCount(0);
  await expect(page.locator('.app-error')).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { releaseImageRead: () => void }).releaseImageRead(),
  );
  await page.waitForFunction(
    () => (window as unknown as { imageReadFinished: boolean }).imageReadFinished,
  );
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await parent.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(page.locator('.inline-reply .image-picker-preview')).toHaveCount(0);
  expect(server.counts().images).toBe(0);
});

test('an uploaded Image is counted as unrendered while its Note is shown without a rejection warning', async ({
  page,
}) => {
  const server = await mediaServer(page);
  await connectImages(page);
  await selectImage(page);
  await page.getByLabel('이미지 1 대체 텍스트').fill('초록색 점');
  await page.getByLabel('새 글', { exact: true }).fill('사진과 함께 읽는 이야기');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.note-card')).toContainText('사진과 함께 읽는 이야기');
  await expect(page.locator('.feed-status')).toContainText('표시하지 않은 활동 1개');
  await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
  await expect(page.locator('.feed-status-dropped')).toContainText(
    '타임라인에 표시하지 않는 활동 1개',
  );
  await expect(page.locator('.feed-status-refused')).toHaveCount(0);
  await expect(page.locator('img.attachment-image')).toHaveCount(0);
  expect(server.counts()).toEqual({ images: 1, notes: 1, binary: 0 });
  await page.getByRole('button', { name: '타임라인 새로고침', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.feed-status-refused')).toHaveCount(0);
  expect(server.counts().binary).toBe(0);
});

for (const width of [390, 1440])
  test(`restricted image upload retains scope and receipt after Note refusal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const server = await mediaServer(page, { privateMedia: true, failNote: true });
    await connectImages(page);
    await page.getByRole('radio', { name: '팔로워만', exact: true }).check();
    await selectImage(page);
    await page.getByLabel('이미지 1 대체 텍스트').fill('친구에게 보여 줄 작은 점');
    await expect(page.locator('.image-picker-disclosure')).toContainText('글의 수신 범위');
    await expect(page.locator('.image-picker-disclosure')).not.toContainText('공개된 채');
    await page.getByLabel('새 글', { exact: true }).fill('팔로워에게만 보내는 사진');
    if (process.env.KIMINO_CAPTURE_PRIVATE_MEDIA)
      await page.screenshot({ path: `/tmp/kimino-private-compose-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(page.locator('.main-composer .page-error')).toBeVisible();
    expect(server.counts().images).toBe(1);
    expect(server.image().to).toEqual([`${actor}/followers`]);
    expect(server.image().cc).toEqual([]);
    await expect(page.getByLabel('새 글', { exact: true })).toHaveValue('팔로워에게만 보내는 사진');
    await page.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(page.getByLabel('새 글', { exact: true })).toHaveValue('');
    expect(server.counts().images).toBe(1);
    expect(server.note()?.to).toEqual(server.image().to);
    expect(server.note()?.cc).toEqual(server.image().cc);
  });
