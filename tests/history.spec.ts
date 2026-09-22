import { test, expect } from '@playwright/test';
import { actor, connect, createNote, mockServer } from './helpers/mock';

test('a large initial history waits for explicit continuation and reaches the empty terminal page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServer(page, []);
  let reads = 0;
  await page.route(`${actor}/outbox**`, (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('page') ?? 1);
    reads++;
    return route.fulfill({
      json: {
        type: 'OrderedCollection',
        totalItems: 100,
        orderedItems: index <= 100 ? [createNote(index, { content: `<p>기록 ${index}</p>` })] : [],
        ...(index <= 100 ? { next: `${actor}/outbox?page=${index + 1}` } : {}),
      },
    });
  });
  await connect(page);
  const proceed = page.getByRole('button', { name: '이어서 읽기', exact: true });
  await expect(proceed).toBeVisible();
  await expect(proceed).toBeFocused();
  await expect(page.locator('.read-continuation')).toContainText('100페이지, 활동 100개');
  await expect(page.locator('.note-card')).toHaveCount(0);
  expect(reads).toBe(100);
  await proceed.press('Enter');
  await expect(page.locator('.note-card').first()).toBeVisible();
  await expect(proceed).toHaveCount(0);
  expect(reads).toBe(101);
});

test('canceling a paused connection clears its read without a server error or further requests', async ({
  page,
}) => {
  await mockServer(page, []);
  let reads = 0;
  await page.route(`${actor}/outbox**`, (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('page') ?? 1);
    reads++;
    return route.fulfill({
      json: {
        type: 'OrderedCollection',
        orderedItems: [],
        next: `${actor}/outbox?page=${index + 1}`,
      },
    });
  });
  await connect(page);
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeEnabled();
  await expect(page.locator('.read-continuation')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(100);
});

test('a paused refresh preserves the previous timeline and draft focus', async ({ page }) => {
  await mockServer(page, [createNote('old', { content: '<p>기존에 읽은 글</p>' })]);
  await connect(page);
  await expect(page.getByText('기존에 읽은 글', { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route(`${actor}/outbox**`, async (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('page') ?? 1);
    reads++;
    if (index === 1) await gate;
    await route.fulfill({
      json: {
        type: 'OrderedCollection',
        orderedItems: [],
        next: `${actor}/outbox?page=${index + 1}`,
      },
    });
  });
  await page.getByRole('button', { name: '타임라인 새로고침', exact: true }).click();
  const draft = page.getByLabel('새 글', { exact: true });
  await draft.fill('새로고침 중에도 쓰던 이야기');
  release();
  await expect(page.getByRole('button', { name: '이어서 읽기', exact: true })).toBeVisible();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue('새로고침 중에도 쓰던 이야기');
  await expect(page.getByText('기존에 읽은 글', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await expect(page.locator('.read-continuation')).toHaveCount(0);
  await expect(page.getByText('기존에 읽은 글', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(100);
});

test('canceling paused hydration retains confirmation of the single accepted post', async ({
  page,
}) => {
  await mockServer(page, [createNote('before', { content: '<p>이전에 읽은 글</p>' })]);
  await connect(page);
  await expect(page.getByText('이전에 읽은 글', { exact: true })).toBeVisible();
  let posts = 0;
  let firstRead = true;
  const posted = createNote('accepted', { content: '<p>서버가 받은 새 글</p>' });
  await page.route(`${actor}/outbox**`, (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({
        status: 201,
        headers: { Location: `${actor}/accepted`, 'Access-Control-Expose-Headers': 'Location' },
        json: posted,
      });
    }
    if (firstRead) {
      firstRead = false;
      return route.fulfill({ status: 503 });
    }
    const index = Number(new URL(route.request().url()).searchParams.get('page') ?? 1);
    return route.fulfill({
      json: {
        type: 'OrderedCollection',
        orderedItems: [],
        next: `${actor}/outbox?page=${index + 1}`,
      },
    });
  });
  await page.route(`${actor}/accepted`, (route) => route.fulfill({ json: posted }));
  await page.getByLabel('새 글', { exact: true }).fill('서버가 받은 새 글');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '이어서 읽기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  await expect(page.getByText('이전에 읽은 글', { exact: true })).toBeVisible();
  await expect(page.getByLabel('새 글', { exact: true })).toHaveValue('');
  expect(posts).toBe(1);
});
