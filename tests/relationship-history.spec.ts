import { test, expect, type Page } from '@playwright/test';
import { actor, origin, person, collection, connect } from './helpers/mock';

const target = 'https://friend.example/users/bob';
async function fixture(page: Page, initiallyLong = true) {
  let long = initiallyLong;
  let following = [target];
  let posts = 0;
  let followingReads = 0;
  const original = { type: 'Follow', id: `${origin}/activities/follow`, actor, object: target };
  const outbox: unknown[] = [original];
  const inbox = [
    {
      type: 'Create',
      id: `${target}/create`,
      actor: target,
      object: {
        type: 'Note',
        id: `${target}/note`,
        attributedTo: target,
        content: '<p>함께 읽는 글</p>',
      },
    },
  ];
  await page.route(origin + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      });
    if (req.method() === 'POST') {
      posts++;
      const body = req.postDataJSON();
      expect(body.type).toBe('Undo');
      expect(body.object.id).toBe(original.id);
      expect(body.object.actor).toBe(actor);
      following = [];
      outbox.push({ ...body, id: `${origin}/activities/undo` });
      return route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    let json: unknown;
    if (req.url() === actor) json = { ...person(actor, 'alice'), following: actor + '/following' };
    else if (url.pathname === new URL(actor + '/following').pathname) {
      followingReads++;
      const n = Number(url.searchParams.get('page') ?? 1);
      json = {
        type: 'OrderedCollection',
        totalItems: following.length,
        orderedItems: long && n <= 100 ? [] : following,
        ...(long && n <= 100 ? { next: `${actor}/following?page=${n + 1}` } : {}),
      };
    } else {
      const items = req.url() === actor + '/inbox' ? inbox : outbox;
      json = { ...collection(items), totalItems: items.length };
    }
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return {
    posts: () => posts,
    reads: () => followingReads,
    long: (value: boolean) => {
      long = value;
    },
  };
}
async function open(page: Page) {
  await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '사람 관리', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('long membership stays unavailable until explicit continuation completes every collection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await fixture(page);
  await connect(page);
  const dialog = await open(page);
  const proceed = dialog.getByRole('button', { name: '기록 이어 읽기', exact: true });
  await expect(proceed).toBeVisible();
  await expect(proceed).toBeInViewport();
  await expect(dialog.locator('.relationship-read-continuation')).toContainText(
    '팔로우 목록 100페이지',
  );
  await expect(dialog.getByRole('button', { name: '팔로우 취소', exact: true })).toHaveCount(0);
  expect(server.reads()).toBe(100);
  await dialog.getByLabel('팔로우할 계정 주소').fill(target);
  await dialog.getByRole('button', { name: '입력 주소 보기', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0);
  expect(server.posts()).toBe(0);
  await proceed.click();
  await expect(dialog.getByRole('button', { name: '팔로우 취소', exact: true })).toBeVisible();
  expect(server.reads()).toBe(101);
  expect(server.posts()).toBe(0);
});

test('canceling preparation sends nothing; canceling later hydration preserves the accepted Undo', async ({
  page,
}) => {
  const server = await fixture(page, false);
  await connect(page);
  const dialog = await open(page);
  const undo = dialog.getByRole('button', { name: '팔로우 취소', exact: true });
  await expect(undo).toBeVisible();
  server.long(true);
  await undo.click();
  await expect(
    dialog
      .locator('.relationship-read-continuation')
      .getByText('팔로우 취소 요청은 아직 보내지 않았어요.', { exact: false }),
  ).toBeVisible();
  await expect(dialog.locator('.relationship-read-continuation')).toContainText(
    `취소할 계정: ${target}`,
  );
  expect(server.posts()).toBe(0);
  await dialog.getByRole('button', { name: '읽기 중단', exact: true }).click();
  await expect(dialog.locator('.relationship-read-continuation')).toHaveCount(0);
  await expect(dialog.getByText('읽기를 중단했어요.', { exact: false }).first()).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(undo).toHaveCount(0);
  expect(server.posts()).toBe(0);
  server.long(false);
  await dialog.getByRole('button', { name: '상태 새로고침', exact: true }).first().click();
  await expect(undo).toBeVisible();
  server.long(true);
  await undo.click();
  await dialog.getByRole('button', { name: '기록 이어 읽기', exact: true }).click();
  await expect.poll(server.posts).toBe(1);
  await expect(dialog.getByRole('button', { name: '읽기 중단', exact: true })).toBeVisible();
  await expect(
    dialog.getByText('팔로우 취소 요청은 아직 보내지 않았어요.', { exact: false }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: '읽기 중단', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(
    dialog.getByText('취소 요청 접수됨 · 상태 반영 대기', { exact: false }),
  ).toBeVisible();
  expect(server.posts()).toBe(1);
});

test('closing people cancels its paused read and reopening starts a fresh traversal', async ({
  page,
}) => {
  const server = await fixture(page);
  await connect(page);
  const dialog = await open(page);
  await expect(dialog.getByRole('button', { name: '기록 이어 읽기', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(server.reads()).toBe(100);
  await open(page);
  await expect(dialog.getByRole('button', { name: '기록 이어 읽기', exact: true })).toBeVisible();
  expect(server.reads()).toBe(200);
  expect(server.posts()).toBe(0);
});

for (const exit of ['이 사람의 글만 보기', '이 작성자의 글 숨기기']) {
  test(`leaving withdrawal preparation through ${exit} sends nothing`, async ({ page }) => {
    const server = await fixture(page, false);
    await connect(page);
    await page
      .locator('.note-card')
      .first()
      .getByRole('button', { name: /정보 보기/ })
      .click();
    const sheet = page.locator('dialog.actor-sheet');
    const undo = sheet.getByRole('button', { name: '팔로우 취소', exact: true });
    await expect(undo).toBeVisible();
    server.long(true);
    await undo.click();
    await expect(sheet.getByRole('button', { name: '기록 이어 읽기', exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: exit, exact: true }).click();
    await expect(sheet).not.toBeVisible();
    expect(server.posts()).toBe(0);
    expect(server.reads()).toBe(101);
  });
}
