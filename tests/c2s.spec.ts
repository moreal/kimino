import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// This suite deliberately fails if the real fixture was not provisioned.
// `npm run test:e2e:ui` runs the isolated UI tests without Docker.
test.use({ ignoreHTTPSErrors: true });
const readCredentials = () =>
  JSON.parse(readFileSync('.local/c2s-credentials.json', 'utf8')) as {
    actorUrl: string;
    token: string;
  };
async function connect(page: Page, credentials: { actorUrl: string; token: string }) {
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(credentials.actorUrl);
  await page.getByLabel('액세스 토큰').fill(credentials.token);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.locator('.note-card').first()).toBeVisible();
}
test('real ONI: connect, read, publish, reply, and reconnect to persisted posts', async ({
  page,
}) => {
  const credentials = readCredentials();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /[A-Z_]{6,}/.test(message.text()))
      errors.push(message.text());
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(credentials.actorUrl);
  await page.getByLabel('액세스 토큰').fill(credentials.token);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 해제' })).toBeVisible();
  await expect(page.locator('.note-card').first()).toBeVisible();
  const message = `브라우저에서 남기는 이야기 ${Date.now()}`;
  await page.getByLabel('새 글').fill(message);
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시되었습니다.');
  const post = page.locator('.note-card').filter({ hasText: message });
  await expect(post).toBeVisible();
  await expect(page.getByLabel('새 글')).toHaveValue('');
  // The timestamp is the permalink; older builds also had a separate "원문 ↗" link.
  const parentUrl = await post.locator('a:has(time)').first().getAttribute('href');
  expect(parentUrl).toMatch(/^https:\/\/localhost:8443\//);
  await post.getByRole('button', { name: /답글 달기/ }).click();
  await expect(page.getByLabel('답글 내용')).toBeFocused();
  const reply = `그리고 이어지는 답글 ${Date.now()}`;
  await page.getByLabel('답글 내용').fill(reply);
  await page.getByRole('button', { name: '답글 게시하기', exact: true }).click();
  const replyCard = page.locator('.note-card').filter({ hasText: reply });
  await expect(replyCard).toBeVisible();
  // The loaded parent opens in-app (thread view); the reply context still names the parent.
  await expect(replyCard.getByText(/↳ 답글/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('');
  await page.getByLabel('액세스 토큰').fill(credentials.token);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.locator('.note-card').filter({ hasText: message })).toBeVisible();
  await expect(page.locator('.note-card').filter({ hasText: reply })).toBeVisible();
  await page.screenshot({ path: 'test-results/timeline-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '타임라인', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/timeline-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real ONI: like persists across reload and a rejected Undo is reported', async ({ page }) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  // ONI cannot undo likes, so react to a fresh post rather than a possibly already liked one.
  const message = `좋아요를 받을 이야기 ${Date.now()}`;
  await page.getByLabel('새 글').fill(message);
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시되었습니다.');
  const card = () => page.locator('article.note-card').filter({ hasText: message });
  const like = () => card().getByRole('button', { name: /^좋아요/ });
  await expect(like()).toHaveAttribute('aria-pressed', 'false');
  await like().click();
  await expect(like()).toHaveAttribute('aria-pressed', 'true');
  await expect(card().getByRole('button', { name: /^공유/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await connect(page, credentials);
  await expect(like()).toHaveAttribute('aria-pressed', 'true');
  await like().click();
  await expect(page.getByRole('alert')).toContainText('취소 요청을 거절');
  // The rejected Undo changes nothing on the server or in the loaded state.
  await expect(like()).toHaveAttribute('aria-pressed', 'true');
});
