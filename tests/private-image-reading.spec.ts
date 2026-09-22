import { test, expect, type Page } from '@playwright/test';
import { actor, collection, createNote, origin, person } from './helpers/mock';
const remote = 'https://images.example.test/pixel';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX8kAAAAASUVORK5CYII=',
  'base64',
);
async function setup(page: Page, rejectFirst = false) {
  let reads = 0,
    direct = 0;
  await page.addInitScript(() => {
    const stats = { created: 0, released: 0 };
    Object.assign(window, { imageResources: stats });
    const create = URL.createObjectURL.bind(URL),
      release = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      stats.created++;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      stats.released++;
      release(url);
    };
  });
  await page.route(remote, (route) => {
    direct++;
    return route.abort();
  });
  const note = createNote('private-image', {
    content: '<p>비공개 이미지 수신 테스트</p>',
    to: [actor],
    attachment: { type: 'Image', url: remote, mediaType: 'image/png', name: '햇빛 아래 작은 점' },
  });
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    if (request.url() === `${origin}/proxy`) {
      reads++;
      expect(request.method()).toBe('POST');
      expect(new URLSearchParams(request.postData()!).get('id')).toBe(remote);
      expect(request.headers().authorization).toBe('Bearer private-image-test');
      expect(request.headers().accept).toBe('image/png');
      if (rejectFirst && reads === 1) return route.fulfill({ status: 403 });
      return route.fulfill({
        contentType: 'image/png',
        body: png,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    return route.fulfill({
      json:
        request.url() === actor
          ? { ...person(actor, 'alice'), endpoints: { proxyUrl: `${origin}/proxy` } }
          : collection(request.url().endsWith('/inbox') ? [note] : []),
    });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByLabel('액세스 토큰').fill('private-image-test');
  await page.getByText('이미지 게시 설정', { exact: true }).click();
  await page.getByLabel('ONI 이미지 게시 사용', { exact: true }).check();
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.getByText('비공개 이미지 수신 테스트', { exact: true })).toBeVisible();
  return { counts: () => ({ reads, direct }) };
}
const resources = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { imageResources: { created: number; released: number } })
        .imageResources,
  );
for (const width of [390, 1440])
  test(`private image explicit loading and resource cleanup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const server = await setup(page);
    const card = page
      .locator('.note-card')
      .filter({ hasText: '비공개 이미지 수신 테스트' })
      .first();
    expect(server.counts()).toEqual({ reads: 0, direct: 0 });
    await card.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
    const image = card.locator('img.attachment-image');
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    await expect(image).toHaveAttribute('alt', '햇빛 아래 작은 점');
    await card.getByRole('button', { name: '이미지 숨기기', exact: true }).click();
    await expect(image).toHaveCount(0);
    expect(await resources(page)).toEqual({ created: 1, released: 1 });
    await card.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
    await expect(image).toBeVisible();
    expect(server.counts()).toEqual({ reads: 2, direct: 0 });
    if (width === 390)
      await page.locator('.page-header').getByRole('button', { name: /alice/ }).click();
    await page.getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
    expect(await resources(page)).toEqual({ created: 2, released: 2 });
  });
test('private image denial preserves alt and retries only on explicit request', async ({
  page,
}) => {
  const server = await setup(page, true);
  await page.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
  await expect(page.getByText('이미지를 불러오지 못했어요.', { exact: false })).toBeVisible();
  await expect(page.locator('.attachment-alt')).toHaveText('햇빛 아래 작은 점');
  expect(server.counts()).toEqual({ reads: 1, direct: 0 });
  expect(await resources(page)).toEqual({ created: 0, released: 0 });
  await page.getByRole('button', { name: '이미지 다시 불러오기', exact: true }).click();
  await expect(page.locator('img.attachment-image')).toHaveAttribute('src', /^blob:/);
  expect(server.counts()).toEqual({ reads: 2, direct: 0 });
});
