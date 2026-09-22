import { test, expect, type Page } from '@playwright/test';
import { actor, origin, person, collection, connect, PUBLIC } from './helpers/mock';

const target = 'https://friend.example/users/bob';
async function fixture(
  page: Page,
  options: { delay?: Promise<void>; uncertain?: boolean; failRead?: boolean; many?: boolean } = {},
) {
  let following: string[] = options.many
    ? Array.from({ length: 3 }, (_, i) => `https://group.example/users/member${i}`)
    : [];
  const outbox: Record<string, unknown>[] = options.many
    ? Array.from({ length: 8 }, (_, i) => ({
        type: 'Follow',
        id: `${origin}/activities/follow-${i}`,
        actor,
        object: `https://group.example/users/member${i}`,
      }))
    : [];
  const inbox: Record<string, unknown>[] = [];
  let posts = 0;
  let readFailed = false;
  let actorFailed = false;
  const requests: string[] = [];
  await page.route('https://friend.example/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.route(origin + '/**', async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      });
    if (request.method() === 'POST') {
      posts++;
      const activity = request.postDataJSON();
      await options.delay;
      if (options.uncertain) return route.abort('failed');
      if (activity.type === 'Follow')
        outbox.push({ ...activity, id: origin + '/activities/follow' });
      else if (activity.type === 'Undo') {
        expect(activity.object.id).toBe(origin + '/activities/follow');
        expect(activity.object.actor).toBe(actor);
        outbox.push({ ...activity, id: origin + '/activities/undo' });
        following = [];
      } else throw new Error('unexpected write type');
      readFailed = !!options.failRead;
      return route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url === actor && actorFailed)
      return route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url === actor + '/following' && readFailed)
      return route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } });
    const items =
      url === actor + '/following' ? following : url === actor + '/inbox' ? inbox : outbox;
    return route.fulfill({
      json:
        url === actor
          ? { ...person(actor, 'alice'), following: actor + '/following' }
          : { ...collection(items), totalItems: items.length },
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  return {
    posts: () => posts,
    failActor: (failed: boolean) => {
      actorFailed = failed;
    },
    remoteReads: requests,
    recover: () => {
      readFailed = false;
    },
    accept: () => {
      following = [target];
      inbox.push({
        id: target + '/accept',
        type: 'Accept',
        actor: target,
        object: origin + '/activities/follow',
      });
    },
    deliver: () =>
      inbox.push({
        id: target + '/create',
        type: 'Create',
        actor: target,
        object: {
          id: target + '/note',
          type: 'Note',
          attributedTo: target,
          content: '<p>함께 읽는 새 이야기</p>',
          to: [PUBLIC],
        },
      }),
  };
}
async function openPeople(page: Page) {
  await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '사람 관리', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function inspect(page: Page) {
  const dialog = await openPeople(page);
  await dialog.getByLabel('팔로우할 계정 주소').fill(target);
  await dialog.getByRole('button', { name: '입력 주소 보기', exact: true }).click();
  return dialog;
}

test('address inspection, pending, accepted, received post and exact Undo are distinct', async ({
  page,
}) => {
  const server = await fixture(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /\[STRICT_|\[REACTIVE_/.test(message.text()))
      errors.push(message.text());
  });
  await connect(page);
  const dialog = await inspect(page);
  expect(server.posts()).toBe(0);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('승인 대기', { exact: true }).first()).toBeVisible();
  expect(server.posts()).toBe(1);
  expect(server.remoteReads).toEqual([]);
  await expect(dialog.locator('.relationship-control')).toHaveCount(1);
  server.accept();
  await dialog.getByRole('button', { name: '상태 새로고침', exact: true }).first().click();
  await expect(dialog.getByText('팔로우 중', { exact: true })).toBeVisible();
  server.deliver();
  await dialog.getByRole('button', { name: '타임라인에서 새 글 확인', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '타임라인', exact: true })).toBeVisible();
  await expect(page.locator('.note-card').filter({ hasText: '함께 읽는 새 이야기' })).toBeVisible();
  await openPeople(page);
  await dialog.getByRole('button', { name: '팔로우 취소', exact: true }).click();
  await expect(dialog.getByText('팔로우하지 않음', { exact: true })).toBeVisible();
  expect(server.posts()).toBe(2);
  await dialog.getByRole('button', { name: '사람 관리 닫기' }).click();
  await page.getByRole('button', { name: '타임라인 새로고침', exact: true }).click();
  await expect(page.locator('.feed-status')).toContainText('표시하지 않은 활동 3개');
  await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
  await expect(page.locator('.feed-status-dropped')).toContainText('팔로우 같은 관계 활동');
  await expect(page.locator('.feed-status-refused')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile dialog retains the address and blocks duplicate submission after reopening', async ({
  page,
}) => {
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await fixture(page, { delay });
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  const dialog = await inspect(page);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('팔로우 전송 중…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '사람 관리', exact: true }).first()).toBeFocused();
  await openPeople(page);
  await expect(dialog.getByLabel('팔로우할 계정 주소')).toHaveValue(target);
  await expect(dialog.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0);
  expect(server.posts()).toBe(1);
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  release();
  await expect(dialog.getByText('승인 대기', { exact: true }).first()).toBeVisible();
});

test('a confirmed Follow survives failed reconciliation and is never sent again', async ({
  page,
}) => {
  const server = await fixture(page, { failRead: true });
  await connect(page);
  const dialog = await inspect(page);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('팔로우 요청 접수됨 · 상태 반영 대기').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0);
  expect(server.posts()).toBe(1);
  server.recover();
  await dialog.getByRole('button', { name: '상태 새로고침', exact: true }).first().click();
  await expect(dialog.getByText('승인 대기', { exact: true }).first()).toBeVisible();
  expect(server.posts()).toBe(1);
});

test('an unknown Follow outcome remains locked after a complete negative read', async ({
  page,
}) => {
  const server = await fixture(page, { uncertain: true });
  await connect(page);
  const dialog = await inspect(page);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('팔로우 전송 결과 불명').first()).toBeVisible();
  await dialog.getByRole('button', { name: '상태 새로고침', exact: true }).first().click();
  await expect(dialog.getByText('팔로우 전송 결과 불명').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0);
  expect(server.posts()).toBe(1);
});

test('author relationship actions keep keyboard focus inside their modal and restore the opener', async ({
  page,
}) => {
  const server = await fixture(page);
  server.deliver();
  await connect(page);
  const author = page.locator('.note-card .author').first();
  await author.click();
  const sheet = page.locator('.actor-sheet');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(
    await sheet.evaluate(
      (el) => el.contains(document.activeElement) || document.activeElement === document.body,
    ),
  ).toBe(true);
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab');
    expect(
      await sheet.evaluate(
        (el) => el.contains(document.activeElement) || document.activeElement === document.body,
      ),
    ).toBe(true);
  }
  await page.locator('.people-open').evaluate((el: HTMLButtonElement) => el.focus());
  expect(
    await sheet.evaluate(
      (el) => el.contains(document.activeElement) || document.activeElement === document.body,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(author).toBeFocused();
});

test('an empty reader explicitly discovers a handle without credentials before a separate Follow', async ({
  page,
}) => {
  const server = await fixture(page);
  const queries: string[] = [];
  await page.context().addCookies([
    {
      name: 'remote-session',
      value: 'should-not-be-sent',
      domain: 'friend.example',
      path: '/',
      secure: true,
    },
  ]);
  await page.route('https://friend.example/.well-known/webfinger?*', async (route) => {
    const request = route.request();
    queries.push(request.url());
    const headers = await request.allHeaders();
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(new URL(request.url()).searchParams.get('resource')).toBe('acct:bob@friend.example');
    return route.fulfill({
      contentType: 'application/jrd+json',
      body: JSON.stringify({
        subject: 'acct:bob@friend.example',
        links: [{ rel: 'self', type: 'application/activity+json', href: target }],
      }),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await connect(page);
  await page.getByRole('button', { name: '팔로우할 사람 찾기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '사람 관리', exact: true });
  await dialog.getByLabel('팔로우할 계정 주소').fill('@bob@friend.example');
  expect(queries).toEqual([]);
  await dialog.getByRole('button', { name: '계정 찾기', exact: true }).click();
  await expect(dialog.locator('.people-candidate')).toContainText('@bob@friend.example');
  await expect(dialog.locator('.people-candidate')).toContainText(target);
  expect(queries).toHaveLength(1);
  expect(server.posts()).toBe(0);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('승인 대기', { exact: true })).toBeVisible();
  expect(server.posts()).toBe(1);
  expect(server.remoteReads).toEqual([]);
});

test('editing a discovered handle removes its action and failed lookup retains the manual URL path', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await fixture(page);
  await page.route('https://friend.example/.well-known/webfinger?*', (route) => {
    const resource = new URL(route.request().url()).searchParams.get('resource');
    return resource === 'acct:bob@friend.example'
      ? route.fulfill({
          contentType: 'application/jrd+json',
          body: JSON.stringify({
            subject: resource,
            links: [{ rel: 'self', type: 'application/activity+json', href: target }],
          }),
          headers: { 'Access-Control-Allow-Origin': '*' },
        })
      : route.abort();
  });
  await connect(page);
  const dialog = await openPeople(page);
  const input = dialog.getByLabel('팔로우할 계정 주소');
  await input.fill('@bob@friend.example');
  await dialog.getByRole('button', { name: '계정 찾기', exact: true }).click();
  await expect(dialog.locator('.people-candidate')).toBeVisible();
  await input.fill('@unavailable@friend.example');
  await expect(dialog.locator('.people-candidate')).toHaveCount(0);
  await dialog.getByRole('button', { name: '계정 찾기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('계정 주소를 조회하지 못했어요.');
  await expect(input).toHaveValue('@unavailable@friend.example');
  await input.fill(target);
  await dialog.getByRole('button', { name: '입력 주소 보기', exact: true }).click();
  await expect(dialog.locator('.people-candidate')).toContainText('주소 형식만 확인했어요.');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(server.posts()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a group list has counted state filters and local search while close and refresh remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await fixture(page, { many: true });
  await connect(page);
  const dialog = await openPeople(page);
  const list = dialog.getByRole('list', { name: '팔로우와 요청 목록' });
  await expect(list.locator('li')).toHaveCount(8);
  const filterBoxes = await dialog.locator('.people-filters button').evaluateAll((elements) =>
    elements.map((element) => ({
      x: element.getBoundingClientRect().x,
      y: element.getBoundingClientRect().y,
    })),
  );
  expect(filterBoxes[0].y).toBe(filterBoxes[1].y);
  expect(filterBoxes[2].y).toBeGreaterThan(filterBoxes[0].y);
  expect(filterBoxes[2].x).toBe(filterBoxes[0].x);
  expect(filterBoxes[3].x).toBe(filterBoxes[1].x);
  await expect(dialog.getByLabel('팔로우할 계정 주소')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '팔로우 중 3', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '승인 대기 5', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(5);
  await dialog.getByLabel('목록에서 찾기').fill('member7');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list.locator('li')).toContainText('https://group.example/users/member7');
  expect((await list.innerText()).match(/https:\/\/group.example\/users\/member7/g)).toHaveLength(
    1,
  );
  await dialog.getByLabel('목록에서 찾기').fill('nobody');
  await expect(dialog.getByText('조건에 맞는 계정이 없어요.')).toBeVisible();
  await dialog.getByRole('button', { name: '검색과 필터 지우기', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(8);
  await dialog.locator('.people-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  for (const control of [
    dialog.getByRole('button', { name: '사람 관리 닫기' }),
    dialog.locator('.people-footer').getByRole('button', { name: '상태 새로고침', exact: true }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  expect(server.posts()).toBe(0);
  expect(server.remoteReads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: '사람 관리 닫기' }).click();
  await expect(page.getByRole('button', { name: '사람 관리', exact: true }).first()).toBeFocused();
});

test('a failed Follow preparation explains no request was sent and permits a manual retry', async ({
  page,
}) => {
  const server = await fixture(page);
  await connect(page);
  const dialog = await inspect(page);
  server.failActor(true);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText(/팔로우 요청은 보내지 않았어요/)).toBeVisible();
  expect(server.posts()).toBe(0);
  await expect(dialog.getByRole('button', { name: '팔로우', exact: true })).toBeEnabled();
  server.failActor(false);
  await dialog.getByRole('button', { name: '팔로우', exact: true }).click();
  await expect(dialog.getByText('승인 대기', { exact: true }).first()).toBeVisible();
  expect(server.posts()).toBe(1);
  await expect(dialog.getByText(/팔로우 요청은 보내지 않았어요/)).toHaveCount(0);
});
