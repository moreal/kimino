import { expect, test } from '@playwright/test';
import {
  actor,
  collection,
  connect,
  createNote,
  mockServer,
  origin,
  person,
  PUBLIC,
} from './helpers/mock';

test('phone search and warning fields use readable input text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServer(page, []);
  await connect(page);
  await page.locator('.search-label').click();
  const search = page.getByLabel('불러온 글 검색');
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.getByLabel('새 글', { exact: true }).fill('작성 중');
  await page.getByRole('button', { name: '경고 문구 추가', exact: true }).click();
  const warning = page.getByRole('textbox', { name: '경고 문구', exact: true });
  await expect(warning).toBeFocused();
  expect(
    await warning.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
});

test('unsupported images offer compact guidance instead of unavailable controls', async ({
  page,
}) => {
  await mockServer(page, []);
  await connect(page);
  await page.getByLabel('새 글', { exact: true }).fill('텍스트로 쓰는 글');
  const composer = page.locator('.main-composer');
  await expect(composer.getByRole('button', { name: '이미지 추가', exact: true })).toHaveCount(0);
  await expect(composer.getByText('0/4장', { exact: true })).toHaveCount(0);
  await composer.getByText('이미지 첨부 안내', { exact: true }).click();
  await expect(composer.getByText(/이미지를 게시하려면 연결 화면에서/)).toBeVisible();
  await expect(page.getByLabel('새 글', { exact: true })).toHaveValue('텍스트로 쓰는 글');
});

test('the phone composer identifies the publishing account when expanded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServer(page, [], [], { username: 'alice' });
  await connect(page);
  await expect(page.locator('.main-composer .compose-account')).not.toBeVisible();
  await page.getByLabel('새 글', { exact: true }).fill('내 계정으로 쓰는 글');
  await expect(page.locator('.main-composer .compose-account')).toHaveText('alice 계정으로 작성');
  await expect(page.locator('.main-composer .compose-account')).toBeVisible();
});

test('connection guidance explains how to obtain credentials without leaving the form', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('계정 주소와 토큰은 어디서 찾나요?', { exact: true }).click();
  await expect(page.locator('.connection-guidance')).toContainText('서버의 계정 설정');
  await expect(page.locator('.connection-guidance')).toContainText('Mastodon');
  await expect(page.getByLabel('Actor URL')).toBeVisible();
});

test('the floating top control stays out of a focused composer on a short phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await mockServer(
    page,
    Array.from({ length: 12 }, (_, index) =>
      createNote(index, {
        content: `<p>이야기 ${index}</p>`,
        to: [PUBLIC],
      }),
    ),
  );
  await connect(page);
  const last = page.locator('.note-card').last();
  await last.locator('.note-actions button').first().click();
  await expect(page.getByLabel('답글 내용')).toBeFocused();
  await expect(page.locator('.to-top')).toHaveCount(1);
  await expect(page.locator('.to-top')).not.toBeVisible();
  await page.getByLabel('답글 내용').press('Escape');
  await expect(page.locator('.to-top')).toBeVisible();
});

test('a rejected connection retains inputs for correction and clears them after connecting', async ({
  page,
}) => {
  let rejected = true;
  await page.route(`${origin}/**`, (route) =>
    rejected
      ? route.fulfill({ status: 401 })
      : route.fulfill({
          json: route.request().url() === actor ? person(actor, 'alice') : collection([]),
        }),
  );
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByLabel('액세스 토큰').fill('incorrect-test-token');
  await page.getByText('이미지 게시 설정', { exact: true }).click();
  await page.getByLabel('ONI 이미지 게시 사용', { exact: true }).check();
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결하지 못했어요');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Actor URL')).toHaveValue(actor);
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('incorrect-test-token');
  await expect(page.getByLabel('ONI 이미지 게시 사용', { exact: true })).toBeChecked();
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'incorrect-test-token',
  );
  rejected = false;
  await page.getByLabel('액세스 토큰').fill('corrected-test-token');
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.locator('.main-composer')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('');
});
