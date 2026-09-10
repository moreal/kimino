import { test, expect } from '@playwright/test';
import {
  actor,
  boxesOf,
  connect as connectAs,
  createNote,
  mockServer,
  origin,
} from './helpers/mock';
const note = {
  id: `${origin}/notes/1`,
  type: 'Note',
  attributedTo: actor,
  content:
    '<p>Hello <strong>world</strong><script>window.pwned=true</script><img src="https://tracker.example/pixel"><a href="javascript:alert(1)">unsafe</a></p>',
  published: '2026-09-08T00:00:00Z',
};

test('connects, sanitizes content, preserves failed draft, and disconnects', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, body: 'error' });
      return;
    }
    const json =
      url === actor
        ? {
            id: actor,
            type: 'Person',
            preferredUsername: 'alice',
            inbox: `${actor}/inbox`,
            outbox: `${actor}/outbox`,
          }
        : {
            type: 'OrderedCollection',
            orderedItems: url.endsWith('/inbox')
              ? []
              : [{ id: `${origin}/activities/1`, type: 'Create', actor, object: note }],
          };
    await route.fulfill({ json, contentType: 'application/activity+json' });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByLabel('액세스 토큰').fill('test-secret');
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.getByText('Hello world')).toBeVisible();
  await expect(page.locator('.note-content img, .note-content script')).toHaveCount(0);
  await expect(page.locator('.note-content a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-secret');
  await page.getByLabel('새 글').fill('keep this draft');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('500');
  await expect(page.getByLabel('새 글')).toHaveValue('keep this draft');
  await page.getByRole('button', { name: '연결 해제' }).click();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('a post reuses the actor read at connect, and disconnect while it is out hydrates nothing', async ({
  page,
}) => {
  // The actor document is read once per connection and reused by every write, so a post
  // waits on nothing but its own POST. Cancelling while that POST is out must leave no
  // trace: no hydration, no error, and the token gone from the form.
  let actorReads = 0;
  let posts = 0;
  let releasePost!: () => void;
  const postGate = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  await page.route(`${origin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await postGate;
      try {
        await route.fulfill({ status: 500 });
      } catch {
        /* Aborted session. */
      }
      return;
    }
    if (route.request().url() === actor) {
      actorReads++;
      await route.fulfill({
        json: { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` },
      });
    } else await route.fulfill({ json: { type: 'OrderedCollection', orderedItems: [] } });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByLabel('새 글').fill('cancel me before publishing');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  expect(actorReads).toBe(1);
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  releasePost();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(actorReads).toBe(1);
});

test('successful post followed by failed refresh clears draft and reports accepted write', async ({
  page,
}) => {
  let published = false;
  let posts = 0;
  await page.route(`${origin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      published = true;
      posts++;
      await route.fulfill({
        status: 201,
        headers: {
          Location: `${origin}/activities/new`,
          'Access-Control-Expose-Headers': 'Location',
        },
      });
      return;
    }
    if (published) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json:
        route.request().url() === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : { type: 'OrderedCollection', orderedItems: [] },
    });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByLabel('새 글').fill('already saved');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page.getByRole('alert')).toContainText('게시되었지만');
  await expect(page.getByLabel('새 글')).toHaveValue('');
  expect(posts).toBe(1);
});

test('conversation follows updates and deletes rather than keeping a stale note', async ({
  page,
}) => {
  let version = 'before';
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    await route.fulfill({
      json:
        url === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : {
              type: 'OrderedCollection',
              orderedItems:
                url.endsWith('/inbox') || version === 'deleted'
                  ? []
                  : [
                      {
                        id: `${origin}/activities/1`,
                        type: 'Create',
                        actor,
                        object: { ...note, content: version },
                      },
                    ],
            },
    });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByRole('button', { name: '대화 열기', exact: true }).click();
  version = 'after';
  await page.getByRole('button', { name: '타임라인 새로고침' }).click();
  await expect(page.locator('.thread-focus')).toContainText('after');
  version = 'deleted';
  await page.getByRole('button', { name: '타임라인 새로고침' }).click();
  await expect(page.locator('.thread-focus')).toHaveCount(0);
  await expect(
    page.getByText('선택한 글은 현재 타임라인에 없어요.', { exact: false }),
  ).toBeVisible();
});

test('inline reply retains context and draft across conversation navigation', async ({ page }) => {
  await mockServer(page, [{ id: `${origin}/activities/1`, type: 'Create', actor, object: note }]);
  await connectAs(page, { token: '' });
  await page.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(page.locator('.inline-reply .compose-parent')).toContainText('Hello world');
  await page.getByLabel('답글 내용').fill('이 초안은 유지되어야 합니다.');
  await page.getByRole('button', { name: '대화 열기', exact: true }).click();
  await expect(page.getByLabel('답글 내용')).toHaveValue('이 초안은 유지되어야 합니다.');
  await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
  await expect(page.getByLabel('답글 내용')).toHaveValue('이 초안은 유지되어야 합니다.');
});

test('publication failure stays visible after navigating away from composer', async ({ page }) => {
  let rejectPost!: () => void;
  const gate = new Promise<void>((resolve) => {
    rejectPost = resolve;
  });
  let posting = false;
  await page.route(`${origin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      posting = true;
      await gate;
      await route.fulfill({ status: 500 });
      return;
    }
    await route.fulfill({
      json:
        route.request().url() === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : {
              type: 'OrderedCollection',
              orderedItems: route.request().url().endsWith('/inbox')
                ? []
                : [{ id: `${origin}/activities/1`, type: 'Create', actor, object: note }],
            },
    });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByLabel('새 글').fill('다른 화면에서도 실패를 알아야 해요');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect.poll(() => posting).toBe(true);
  await page.getByRole('button', { name: '대화 열기', exact: true }).click();
  rejectPost();
  await expect(page.getByRole('alert')).toContainText('500');
  await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
  await expect(page.getByLabel('새 글')).toHaveValue('다른 화면에서도 실패를 알아야 해요');
});

const connect = (page: import('@playwright/test').Page, remember = false) =>
  connectAs(page, { remember });
/**
 * In a card under the fold step (a phone, the thread panel, the reading column of an
 * 1100-1280 window) my own card keeps 수정 and 삭제 one tap behind 관리; a wider column
 * shows them inline and no 관리, so this is a no-op there.
 */
async function openManage(card: import('@playwright/test').Locator) {
  await card.locator('.text-button').first().waitFor();
  const manage = card.locator('.manage-toggle').first();
  if ((await manage.isVisible()) && (await manage.getAttribute('aria-expanded')) === 'false')
    await manage.click();
}
const firstPostTop = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0);
    return Math.round(document.querySelector('.note-card')!.getBoundingClientRect().top);
  });

test('first post starts high on mobile and desktop in preview mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await expect(page.locator('.note-card').first()).toBeVisible();
  const mobile = await firstPostTop(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktop = await firstPostTop(page);
  test.info().annotations.push({
    type: 'first-post-top',
    description: `mobile ${mobile}px, desktop ${desktop}px`,
  });
  console.log(`first-post-top: mobile ${mobile}px, desktop ${desktop}px`);
  expect(mobile).toBeLessThan(160);
  expect(desktop).toBeLessThan(120);
});

test('page alerts clear on navigation and save feedback is a transient toast', async ({ page }) => {
  await page.route(`${origin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, body: 'error' });
      return;
    }
    const url = route.request().url();
    await route.fulfill({
      json:
        url === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : {
              type: 'OrderedCollection',
              orderedItems: url.endsWith('/inbox')
                ? []
                : [createNote(1, { content: '<p>one</p>' })],
            },
    });
  });
  await connect(page);
  await page.getByLabel('새 글').fill('will fail');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('500');
  const box = (await alert.boundingBox())!;
  // In flow (not sticky/fixed): the alert scrolls away with the page instead of pinning above the fold.
  await expect(page.locator('.page-error')).toHaveCSS('position', /^(static|relative)$/);
  expect(box.y).toBeGreaterThan(0);
  await page.getByRole('button', { name: '내가 쓴 글', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const toast = page.getByRole('status');
  await expect(toast).toContainText('저장했어요');
  // A fixed pill at the bottom edge: it moves nothing and lets taps through (round 14).
  // Out of the column's flow (fixed on one column, at the foot of the right column on the
  // desktop layout) and never in the way of a tap.
  expect(['fixed', 'sticky']).toContain(
    await page.locator('.toast-region').evaluate((el) => getComputedStyle(el).position),
  );
  await expect(page.locator('.toast-region')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.toast')).toHaveCSS('pointer-events', 'none');
  await expect(toast).toHaveText('', { timeout: 6000 });
  await page.getByRole('button', { name: '저장됨', exact: true }).click();
  await expect(toast).toContainText('해제');
  await page.getByRole('button', { name: '알림 닫기' }).click();
  await expect(toast).toHaveText('');
  // The same notice twice in a row still shows a fresh toast.
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast).toContainText('저장했어요');
});

test('one word per concept: 답글 writes, 원글 보기 marks a reply, 대화 counts, 받은 답글 lists', async ({
  page,
}) => {
  const bob = `${origin}/users/bob`;
  await mockServer(
    page,
    [createNote(1, { content: '<p>original</p>' })],
    [
      createNote(2, {
        content: '<p>a reply</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
      }),
      createNote(3, {
        content: '<p>mention only</p>',
        attributedTo: bob,
        tag: [{ type: 'Mention', href: actor }],
      }),
    ],
  );
  await connect(page);
  const original = page.locator('.note-card', { hasText: 'original' });
  await expect(original.getByRole('button', { name: '대화 1', exact: true })).toBeVisible();
  const reply = page.locator('.note-card', { hasText: 'a reply' });
  // The parent is loaded, so the cue quotes whose note this answers, and its first words.
  await expect(reply.locator('.reply-context')).toHaveText('alice: original · 원글 보기');
  await expect(reply.getByRole('button', { name: '대화 열기', exact: true })).toBeVisible();
  await expect(reply.getByRole('button', { name: /에게 답글 달기/ })).toBeVisible();
  await expect(page.locator('.context-column')).not.toContainText('답글 수');
  await expect(page.locator('.sidebar')).not.toContainText('나에게 온 답글');
  await page.getByRole('button', { name: '받은 답글', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('받은 답글');
  await page
    .locator('.note-card', { hasText: 'mention only' })
    .getByRole('button', { name: '대화 열기', exact: true })
    .click();
  await expect(page.locator('.conversation')).toContainText('언급한');
  await expect(page.locator('.conversation')).not.toContainText('아직 불러온 답글이 없습니다');
});

test('opt-in session persistence restores the account and last view in this tab only', async ({
  page,
}) => {
  await mockServer(page, [createNote(1, { content: '<p>persisted</p>' })]);
  await connect(page);
  await expect(page.getByText('persisted')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('test-secret');
  await connect(page, true);
  await expect(page.getByText('persisted')).toBeVisible();
  await page.getByRole('button', { name: '내가 쓴 글', exact: true }).click();
  await page.reload();
  await expect(page.getByText('persisted')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('내가 쓴 글');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-secret');
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('test-secret');
  await page.reload();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
});

test('a reply to a direct note is direct only and is addressed to the people in it', async ({
  page,
}) => {
  const bob = `${origin}/users/bob`;
  const bodies: Record<string, unknown>[] = [];
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        headers: {
          Location: `${origin}/activities/new`,
          'Access-Control-Expose-Headers': 'Location',
        },
      });
      return;
    }
    await route.fulfill({
      json:
        url === actor
          ? {
              id: actor,
              type: 'Person',
              inbox: `${actor}/inbox`,
              outbox: `${actor}/outbox`,
              followers: `${actor}/followers`,
            }
          : {
              type: 'OrderedCollection',
              orderedItems: url.endsWith('/inbox')
                ? [
                    createNote(7, {
                      content: '<p>only for you</p>',
                      attributedTo: bob,
                      to: [actor],
                      tag: [{ type: 'Mention', href: actor }],
                    }),
                  ]
                : [],
            },
    });
  });
  await connect(page);
  const card = page.locator('.note-card', { hasText: 'only for you' });
  await expect(card.locator('.visibility-badge')).toHaveAttribute('title', '다이렉트');
  await card.getByRole('button', { name: /답글 달기/ }).click();
  const reply = page.locator('.inline-reply');
  await expect(reply.getByRole('radio', { name: '다이렉트' })).toBeChecked();
  for (const name of ['공개', '조용히 공개(미등록)', '팔로워만'])
    await expect(reply.getByRole('radio', { name, exact: true })).toBeDisabled();
  await expect(reply.locator('.visibility-limit')).toHaveText(
    '원글이 다이렉트라서 답글도 다이렉트로만 보내요.',
  );
  await page.getByLabel('답글 내용').fill('back to you');
  await page.getByRole('button', { name: '답글 게시하기' }).click();
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  expect(bodies).toHaveLength(1);
  const object = bodies[0].object as Record<string, unknown>;
  expect(object.to).toEqual([bob]);
  expect(object.cc).toEqual([]);
  expect(JSON.stringify(bodies[0])).not.toContain('followers');
  expect(JSON.stringify(bodies[0])).not.toContain('#Public');
});

test('the warning field carries a visible label in the main and reply composers', async ({
  page,
}) => {
  await mockServer(page, [createNote(1, { content: '<p>one</p>' })]);
  await connect(page);
  const main = page.locator('.main-composer');
  await main.getByLabel('새 글').click();
  await main.getByRole('button', { name: '경고 문구 추가', exact: true }).click();
  await expect(main.locator('.compose-warning-label')).toBeVisible();
  await expect(main.locator('.compose-warning-label')).toHaveText('경고 문구');
  await expect(main.getByLabel('경고 문구')).toBeVisible();
  await main.getByRole('button', { name: '경고 문구 제거', exact: true }).click();
  await expect(main.getByLabel('경고 문구')).toHaveCount(0);
  await page.getByRole('button', { name: /답글 달기/ }).click();
  const reply = page.locator('.inline-reply');
  await reply.getByRole('button', { name: '경고 문구 추가', exact: true }).click();
  await expect(reply.locator('.compose-warning-label')).toHaveText('경고 문구');
  await expect(reply.getByLabel('경고 문구')).toBeVisible();
});

test('on a phone a failed reply is explained right under its composer, in Korean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, body: 'error' });
      return;
    }
    await route.fulfill({
      json:
        url === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : {
              type: 'OrderedCollection',
              orderedItems: url.endsWith('/inbox')
                ? []
                : Array.from({ length: 6 }, (_, i) =>
                    createNote(i + 1, {
                      content: `<p>post number ${i + 1} ${'long text '.repeat(20)}</p>`,
                      published: `2026-09-0${i + 1}T00:00:00Z`,
                    }),
                  ),
            },
    });
  });
  await connect(page);
  const last = page.locator('.note-card', { hasText: 'post number 1 ' });
  await last.scrollIntoViewIfNeeded();
  await last.getByRole('button', { name: /답글 달기/ }).click();
  await page.getByLabel('답글 내용').fill('will fail');
  await page.getByRole('button', { name: '답글 게시하기' }).click();
  const alert = page.locator('.inline-reply [role="alert"]');
  await expect(alert).toContainText('게시하지 못했어요');
  await expect(alert).toContainText('서버가 요청을 거부했어요 (500). 잠시 후 다시 시도해 주세요.');
  // The developer detail is folded away; the words on screen are Korean only.
  await expect(alert.locator('p')).not.toContainText('ActivityPub request failed');
  await expect(alert.locator('pre')).toBeHidden();
  await expect(alert.locator('summary')).toHaveText('자세히');
  await alert.locator('summary').click();
  await expect(alert.locator('pre')).toContainText('500');
  // Exactly one alert, and it is inside the viewport the writer is looking at.
  await expect(page.getByRole('alert')).toHaveCount(1);
  const box = (await alert.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + Math.min(box.height, 120)).toBeLessThanOrEqual(844);
  await expect(page.getByLabel('답글 내용')).toHaveValue('will fail');
});

test('the remember checkbox is a single tappable row on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const row = page.locator('.checkbox-label');
  const input = row.locator('input');
  const text = row.locator('span');
  const [rowBox, inputBox, textBox] = await Promise.all([
    row.boundingBox(),
    input.boundingBox(),
    text.boundingBox(),
  ]);
  expect(rowBox!.height).toBeGreaterThanOrEqual(44);
  expect(inputBox!.width).toBeLessThanOrEqual(24);
  expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(textBox!.x);
  // Same row: the box's vertical span overlaps the first line of text.
  expect(inputBox!.y).toBeLessThan(textBox!.y + 24);
  expect(inputBox!.y + inputBox!.height).toBeGreaterThan(textBox!.y);
  await text.click();
  await expect(input).toBeChecked();
});

test('preview mode survives a reload without storing anything but a marker and a view', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await expect(page.locator('.demo-pill')).toBeVisible();
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await page.reload();
  await expect(page.locator('.demo-pill')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('저장한 글');
  const stored = await page.evaluate(() => sessionStorage.getItem('kimino.session'));
  expect(JSON.parse(stored!)).toEqual({ actorUrl: 'demo', token: '', view: 'saved' });
  await page.getByRole('button', { name: '둘러보기 종료', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '먼저 둘러보기' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('kimino.session'))).toBeNull();
});

test('Escape closes an empty reply composer and keeps a typed draft with a badge and a notice', async ({
  page,
}) => {
  await mockServer(page, [createNote(1, { content: '<p>one</p>' })]);
  await connect(page);
  const replyButton = page.getByRole('button', { name: /에게 답글 달기/ });
  await replyButton.click();
  const textarea = page.getByLabel('답글 내용');
  await expect(textarea).toBeFocused();
  // 취소 follows the textarea and the submit button in reading order.
  const cancelAfterSubmit = await page.evaluate(() => {
    const submit = document.querySelector('.inline-reply button[type="submit"]')!;
    const cancel = document.querySelector('.inline-reply .compose-cancel')!;
    return !!(submit.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(cancelAfterSubmit).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.inline-reply')).toHaveCount(0);
  await expect(replyButton).toBeFocused();
  await expect(page.locator('.draft-badge')).toHaveCount(0);
  await replyButton.click();
  await textarea.fill('아직 보내지 않은 답글');
  await page.keyboard.press('Escape');
  await expect(page.locator('.inline-reply')).toHaveCount(0);
  await expect(replyButton.locator('.draft-badge')).toHaveText('초안 있음');
  await expect(page.getByRole('status')).toContainText('초안');
  await replyButton.click();
  await expect(textarea).toHaveValue('아직 보내지 않은 답글');
});

test('preview saves survive a reload in this tab and the notice says the tab is the limit', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await page
    .locator('.note-card')
    .filter({ hasText: '책방' })
    .getByRole('button', { name: '저장', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('이 탭을 닫으면 초기화돼요');
  await page.reload();
  await expect(page.locator('.demo-pill')).toBeVisible();
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.note-card')).toContainText('책방');
  const stored = JSON.parse(
    (await page.evaluate(() => sessionStorage.getItem('kimino.session')))!,
  ) as { saved?: string[] };
  expect(stored.saved).toEqual(['https://demo.invalid/notes/2']);
  await page.getByRole('button', { name: '저장됨', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('저장한 글');
  await expect(page.locator('.note-card')).toHaveCount(0);
  const cleared = JSON.parse(
    (await page.evaluate(() => sessionStorage.getItem('kimino.session')))!,
  ) as { saved?: string[] };
  expect(cleared.saved).toBeUndefined();
});

test('a conversation shows loaded ancestors above the focused note and nests replies by depth', async ({
  page,
}) => {
  const bob = `${origin}/users/bob`;
  const at = (n: number) => `2026-09-0${n}T00:00:00Z`;
  const reply = (id: number, parent: number | string, content: string, when: number) =>
    createNote(id, {
      content: `<p>${content}</p>`,
      attributedTo: bob,
      inReplyTo: typeof parent === 'string' ? parent : `${origin}/notes/${parent}`,
      published: at(when),
    });
  await mockServer(
    page,
    [
      createNote(1, {
        content: '<p>root post</p>',
        published: at(1),
        inReplyTo: `${origin}/notes/lost`,
      }),
    ],
    [
      reply(2, 1, 'middle reply', 2),
      reply(3, 2, 'focus reply', 3),
      reply(4, 3, 'first answer', 4),
      reply(5, 4, 'second level', 5),
      reply(6, 5, 'third level', 6),
      reply(7, 6, 'fourth level', 7),
      reply(8, 7, 'fifth level', 8),
      reply(9, 3, 'later answer', 9),
    ],
  );
  await page.setViewportSize({ width: 1000, height: 900 });
  await connect(page);
  await page
    .locator('.note-card', { hasText: 'focus reply' })
    .getByRole('button', { name: /^대화/ })
    .click();
  const conversation = page.locator('.main-column .conversation');
  await expect(conversation.locator('.thread-ancestor .note-card')).toHaveText([
    /root post/,
    /middle reply/,
  ]);
  await expect(conversation.locator('.missing-parent')).toContainText(
    '원글을 아직 불러오지 않았어요',
  );
  await expect(conversation.locator('.thread-focus .note-card--focused')).toContainText(
    'focus reply',
  );
  // Ancestors sit above the focused note, replies below it.
  const order = await conversation.evaluate((section) =>
    Array.from(section.querySelectorAll('.thread-ancestor, .thread-focus, .thread-reply')).map(
      (el) =>
        ['thread-ancestor', 'thread-focus', 'thread-reply'].find((name) =>
          el.classList.contains(name),
        ),
    ),
  );
  expect(order).toEqual([
    'thread-ancestor',
    'thread-ancestor',
    'thread-focus',
    ...Array(6).fill('thread-reply'),
  ]);
  const depths = await conversation
    .locator('.thread-reply')
    .evaluateAll((items) =>
      items.map(
        (el) =>
          `${el.getAttribute('data-depth')}:${el.textContent?.match(/(first answer|second level|third level|fourth level|fifth level|later answer)/)?.[1]}`,
      ),
    );
  expect(depths).toEqual([
    '0:first answer',
    '1:second level',
    '2:third level',
    '3:fourth level',
    '3:fifth level',
    '0:later answer',
  ]);
  const flat = conversation.locator('.thread-reply--flat');
  await expect(flat).toHaveCount(1);
  // bob answering bob: a continuation, in the same word the card cue uses (round 17).
  await expect(flat.locator('.reply-cue')).toHaveText('이어서');
  // The cue's arrow is drawn from the shared icon set, not typed as a glyph.
  await expect(flat.locator('.reply-cue .icon--sm')).toHaveCount(1);
  await expect(flat.locator('.reply-cue')).toBeVisible();
  // Deeper replies keep their own actions and composer.
  await flat.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(flat.getByLabel('답글 내용')).toBeFocused();
});

test('on a phone the landing shows the connect and preview buttons without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '먼저 둘러보기' })).toBeInViewport();
  await expect(page.getByLabel('Actor URL')).toBeInViewport();
  const formTop = (await page.locator('.connection-form').boundingBox())!.y;
  const noteTop = (await page.locator('.compatibility-note').boundingBox())!.y;
  expect(formTop).toBeLessThan(noteTop);
  await expect(
    page.getByText('Mastodon 계정으로 로그인할 수 없어요', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
});

test('the first card is a few Tabs away via the skip link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await expect(page.locator('.note-card').first()).toBeVisible();
  // A fresh document: the first Tab from the top of the page lands on the skip link.
  await page.reload();
  await expect(page.locator('.note-card').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#timeline');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('.note-card').first()).toBeFocused();
  // Exactly one card is a tab stop; the rest are reached with j/k.
  await expect(page.locator('.note-card[tabindex="0"]')).toHaveCount(1);
});

test.describe('round 6b', () => {
  const bob = `${origin}/users/bob`;
  const carol = `${origin}/users/carol`;

  test('a reply to a note of unknown scope is direct only and reaches its author and mentions', async ({
    page,
  }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST') {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox')
                  ? [
                      createNote(9, {
                        content: '<p>scope unclear</p>',
                        attributedTo: bob,
                        // The author's followers collection is not known here: not public,
                        // not provably direct, so the audience is unknown.
                        to: [`${bob}/followers`],
                        cc: [actor],
                        tag: [
                          { type: 'Mention', href: actor },
                          { type: 'Mention', href: carol },
                        ],
                      }),
                    ]
                  : [],
              },
      });
    });
    await connect(page);
    const card = page.locator('.note-card', { hasText: 'scope unclear' });
    await expect(card.locator('.visibility-badge')).toHaveAttribute('title', '제한된 공개');
    await card.getByRole('button', { name: /답글 달기/ }).click();
    const reply = page.locator('.inline-reply');
    await expect(reply.getByRole('radio', { name: '다이렉트' })).toBeChecked();
    for (const name of ['공개', '조용히 공개(미등록)', '팔로워만'])
      await expect(reply.getByRole('radio', { name, exact: true })).toBeDisabled();
    await expect(reply.locator('.visibility-limit')).toContainText('다이렉트');
    await expect(reply.locator('.visibility-limit')).not.toContainText('넓힐 수');
    await page.getByLabel('답글 내용').fill('kept private');
    await page.getByRole('button', { name: '답글 게시하기' }).click();
    await expect(page.getByRole('status')).toHaveText('게시됐어요.');
    expect(bodies).toHaveLength(1);
    const object = bodies[0].object as Record<string, unknown>;
    expect(object.to).toEqual([bob, carol]);
    expect(object.cc).toEqual([]);
    expect(JSON.stringify(bodies[0])).not.toContain('followers');
    expect(JSON.stringify(bodies[0])).not.toContain('#Public');
  });

  test('대화 N counts every loaded reply below a note and says so', async ({ page }) => {
    const at = (n: number) => `2026-09-0${n}T00:00:00Z`;
    const reply = (id: number, parent: number, when: number) =>
      createNote(id, {
        content: `<p>reply ${id}</p>`,
        attributedTo: bob,
        inReplyTo: `${origin}/notes/${parent}`,
        published: at(when),
      });
    await mockServer(
      page,
      [createNote(1, { content: '<p>root post</p>', published: at(1) })],
      [reply(2, 1, 2), reply(3, 2, 3), reply(4, 3, 4), reply(5, 4, 5), reply(6, 3, 6)],
    );
    await connect(page);
    const root = page.locator('.note-card', { hasText: 'root post' });
    const thread = root.getByRole('button', { name: '대화 5', exact: true });
    await expect(thread).toBeVisible();
    await expect(thread).toHaveAttribute('title', /불러온 답글 기준/);
    await expect(
      page.locator('.note-card', { hasText: 'reply 3' }).getByRole('button', { name: '대화 3' }),
    ).toBeVisible();
    await expect(
      page.locator('.note-card', { hasText: 'reply 6' }).getByRole('button', { name: '대화' }),
    ).toHaveText('대화');
  });

  test('the thread column keeps every action word inside the panel at 1440 and at 1200', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const aside = page.locator('.context-column');
    await aside.getByRole('button', { name: /대화 열기/ }).click();
    const row = aside.locator('.thread-panel .thread-ancestor .note-actions');
    // Visible ones: since round 16 the panel folds 수정 and 삭제 behind 관리 like a phone does.
    const buttons = row.locator('button:visible');
    // The ancestor here is the reader's own note: five reading actions, then 관리.
    await expect(buttons).toHaveCount(6);
    await expect(buttons.last()).toHaveAccessibleName('내 글 관리: 수정, 삭제');
    // The panel is narrower than the timeline and clips what leaves it, so the row wraps
    // (round 12) instead of parking controls behind an edge nobody can scroll to.
    const contained = async () =>
      row.evaluate((el) => {
        const panel = el.closest('.thread-panel')!.getBoundingClientRect();
        return Array.from(el.querySelectorAll('button'))
          .filter((button) => button.getClientRects().length > 0)
          .every((button) => {
            const box = button.getBoundingClientRect();
            return box.left >= panel.left - 1 && box.right <= panel.right + 1 && box.width > 0;
          });
      });
    expect(await contained()).toBe(true);
    expect(await row.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    // Labels stay visible on the wide layout.
    await expect(buttons.first().locator('.action-label')).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 900 });
    expect(await contained()).toBe(true);
    // Narrower desktop: the column shrinks the words, it never hides them.
    await expect(buttons.first().locator('.action-label')).toBeVisible();
    await expect(buttons.first().locator('.action-label')).toBeInViewport();
    // 저장 keeps its name and title whichever copy of it the width draws (round 18 folds it
    // into the 관리 row on a card under 350px, as the panel's is at 1200).
    await openManage(row);
    await expect(row.locator('.save-button:visible')).toHaveAccessibleName(/저장/);
    await expect(row.locator('.save-button:visible')).toHaveAttribute('title', /저장/);
  });

  test('촘촘하게 fits ten short notes in a 900px desktop viewport and is remembered', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockServer(
      page,
      Array.from({ length: 12 }, (_, i) =>
        createNote(i + 1, {
          content: `<p>short note ${i + 1}</p>`,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          published: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        }),
      ),
    );
    await connect(page);
    const toggle = page.getByRole('switch', { name: '촘촘하게' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    const cards = page.locator('.timeline .note-card');
    const heights = () =>
      cards.evaluateAll((items) => items.map((el) => el.getBoundingClientRect().height));
    const comfortable = await heights();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'compact');
    const compact = await heights();
    const tenCards = compact.slice(0, 10).reduce((sum, h) => sum + h, 0);
    test.info().annotations.push({
      type: 'compact-card-height',
      description: `avg ${(tenCards / 10).toFixed(1)}px (comfortable ${(comfortable.slice(0, 10).reduce((s, h) => s + h, 0) / 10).toFixed(1)}px)`,
    });
    expect(tenCards).toBeLessThanOrEqual(900);
    expect(compact[0]).toBeLessThan(comfortable[0]);
    const save = cards.first().getByRole('button', { name: '저장', exact: true });
    expect((await save.boundingBox())!.height).toBeLessThanOrEqual(32);
    expect(await page.evaluate(() => localStorage.getItem('kimino.density'))).toBe('compact');
    await page.reload();
    await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
    await connect(page);
    await expect(page.getByRole('switch', { name: '촘촘하게' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Phones never show the toggle and keep comfortable sizes.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('switch', { name: '촘촘하게' })).toBeHidden();
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('j/k walk the conversation cards and Escape returns to the timeline card it came from', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const aside = page.locator('.context-column');
    await aside.getByRole('button', { name: /대화 열기/ }).click();
    await expect(page.locator('#conversation-heading')).toBeFocused();
    const threadCards = aside.locator('.conversation .note-card');
    await page.keyboard.press('j');
    await expect(threadCards.nth(0)).toBeFocused();
    await expect(threadCards.nth(0)).toContainText('커피 한 잔');
    await page.keyboard.press('j');
    await expect(threadCards.nth(1)).toBeFocused();
    await expect(threadCards.nth(1)).toContainText('저도요.');
    // The timeline's own ring did not move.
    await expect(page.locator('.timeline .note-card:focus')).toHaveCount(0);
    await page.keyboard.press('k');
    await expect(threadCards.nth(0)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(aside.locator('.conversation')).toHaveCount(0);
    const origin = page.locator('.timeline .note-card', { hasText: '저도요.' });
    await expect(origin).toBeFocused();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toContainText(
      '대화 열에서는',
    );
  });

  test('on a phone the Actor URL field says who can connect before the full note', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const helper = page.locator('.field-help--inline');
    await expect(helper).toBeVisible();
    await expect(helper).toContainText('Mastodon');
    await expect(helper).toBeInViewport();
    const helperBox = (await helper.boundingBox())!;
    const inputBox = (await page.getByLabel('Actor URL').boundingBox())!;
    // Round 7: the answer comes after the ask, so the line sits under the field.
    expect(helperBox.y).toBeGreaterThan(inputBox.y);
    expect(helperBox.height).toBeLessThanOrEqual(44);
    await expect(page.locator('.compatibility-note')).toContainText('Mastodon');
  });

  test('tapping an author opens an honest in-app sheet with a client-side filter', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await page
      .locator('.note-card', { hasText: '저도요.' })
      .getByRole('button', { name: 'sol 정보 보기', exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: 'sol' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: '닫기' })).toBeFocused();
    // The heading and the line under it are the card's own two labels, in the same words.
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('sol');
    await expect(sheet.locator('.actor-handle')).toHaveText('@sol@demo.invalid');
    await expect(sheet).toContainText('demo.invalid');
    await expect(sheet).toContainText('이 세션에서 불러온 글 1개');
    await expect(sheet).not.toContainText('팔로워');
    await expect(sheet).not.toContainText('팔로우');
    const link = sheet.getByRole('link', { name: /서버에서 프로필 보기/ });
    await expect(link).toHaveAttribute('href', 'https://demo.invalid/people/sol');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await sheet.getByRole('button', { name: '이 사람의 글만 보기' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.timeline .note-card')).toHaveCount(1);
    await expect(page.locator('.filter-chip')).toContainText('sol의 글만 (불러온 글 기준)');
    await page.getByRole('button', { name: '필터 해제' }).click();
    await expect(page.locator('.timeline .note-card')).toHaveCount(4);
    // Escape closes the sheet and focus returns to the name that opened it.
    const opener = page
      .locator('.note-card', { hasText: '책방' })
      .getByRole('button', { name: 'june 정보 보기', exact: true });
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('round 7: one visual system', () => {
  /** True when the control's own label is laid out as a single unbroken line. */
  const fitsOneLine = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((el) => {
      const label = [...el.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim().length > 0,
      );
      if (!label) return false;
      const range = document.createRange();
      range.selectNodeContents(label);
      return range.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth + 1;
    });

  test('at 390 the reply composer keeps 답글 게시하기 and 취소 on one line each', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockServer(page, [createNote(1, { content: '<p>one</p>' })]);
    await connect(page);
    await page.getByRole('button', { name: /에게 답글 달기/ }).click();
    const submit = page.getByRole('button', { name: '답글 게시하기' });
    const cancel = page.locator('.inline-reply .compose-cancel');
    await expect(submit).toBeVisible();
    expect(await fitsOneLine(submit)).toBe(true);
    expect(await fitsOneLine(cancel)).toBe(true);
    // Neither control is pushed out of the column.
    for (const control of [submit, cancel]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    // The visibility picker is an even 2x2 below 420px: two rows, equal cells.
    const cells = await page.locator('.inline-reply .visibility-option').evaluateAll((items) =>
      items.map((el) => {
        const box = el.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.top)];
      }),
    );
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(([width]) => width)).size).toBe(1);
    expect(new Set(cells.map(([, top]) => top)).size).toBe(2);
    await page.screenshot({ path: 'test-results/round7-composer-390.png', fullPage: true });
  });

  test('the toast moves nothing: the first card stays put at 390 and 1440 while it shows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const card = page.locator('.note-card').filter({ hasText: '책방' });
    const first = page.locator('.note-card').first();
    const toast = page.locator('.toast');
    await card.getByRole('button', { name: /^저장/ }).click();
    await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    // A phone has no close control (round 17): the strip clears by itself.
    await expect(toast).toHaveCount(0, { timeout: 6000 });
    for (const size of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      // Document positions: the click below may scroll, and that is not a layout shift.
      const place = () =>
        first.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top + window.scrollY, height: rect.height };
        });
      const before = await place();
      await card.getByRole('button', { name: /^저장/ }).click();
      await expect(toast).toBeVisible();
      // Measure where it comes to rest, not where its entrance starts.
      await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      // Round 14: no layout shift - a second tap at the top lands on the same control.
      expect(await place(), `${size.width}px first card`).toEqual(before);
      const box = (await toast.boundingBox())!;
      // At the bottom edge: a strip above the phone tab bar, a pill on the desktop column.
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.y).toBeGreaterThan(size.height / 2);
      expect(box.width).toBeLessThanOrEqual(size.width <= 650 ? size.width : 480);
      console.log(
        `toast box at ${size.width}: x ${box.x} y ${box.y} w ${box.width} h ${box.height}`,
      );
      if (size.width > 650) await page.getByRole('button', { name: '알림 닫기' }).click();
      await expect(toast).toHaveCount(0, { timeout: 6000 });
    }
    // Four seconds, unchanged.
    await card.getByRole('button', { name: /^저장/ }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });
  });

  test('at 1440 the landing is one centred column whose fields are not truncated', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const form = (await page.locator('.connection-form').boundingBox())!;
    expect(form.width).toBeGreaterThan(380);
    expect(form.width).toBeLessThanOrEqual(560);
    // Centred: the same gap on both sides of the column.
    const column = (await page.locator('.main-column').boundingBox())!;
    expect(Math.abs(column.x - (1440 - column.x - column.width))).toBeLessThanOrEqual(2);
    expect(column.width).toBeLessThanOrEqual(560);
    // The tagline reads on one line.
    const tagline = page.locator('.connection-panel h1');
    const taglineLines = await tagline.evaluate((el) => {
      const line = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / line);
    });
    expect(taglineLines).toBe(1);
    // Placeholders fit their fields: no truncated example URL, no truncated token hint.
    for (const label of ['Actor URL', '액세스 토큰']) {
      const fits = await page.getByLabel(label).evaluate((el: HTMLInputElement) => {
        const before = el.value;
        el.value = el.placeholder;
        const ok = el.scrollWidth <= el.clientWidth + 1;
        el.value = before;
        return ok;
      });
      expect(fits, label).toBe(true);
    }
    // The compatibility note follows the form in the same column.
    const note = (await page.locator('.compatibility-note').boundingBox())!;
    expect(note.y).toBeGreaterThan(form.y + form.height - 1);
    expect(note.x).toBeGreaterThanOrEqual(column.x - 1);
    await page.screenshot({ path: 'test-results/round7-landing-1440.png', fullPage: true });
  });

  test('Escape closes the reply composer from the content-warning field too', async ({ page }) => {
    await mockServer(page, [createNote(1, { content: '<p>one</p>' })]);
    await connect(page);
    const replyButton = page.getByRole('button', { name: /에게 답글 달기/ });
    await replyButton.click();
    await page.getByLabel('답글 내용').fill('경고 문구와 함께 보낼 답글');
    await page.locator('.inline-reply').getByRole('button', { name: '경고 문구 추가' }).click();
    // Adding a warning puts the caret where the warning is written.
    const warningField = page.locator('.inline-reply .compose-warning input');
    await expect(warningField).toBeFocused();
    await warningField.fill('스포일러');
    await page.keyboard.press('Escape');
    await expect(page.locator('.inline-reply')).toHaveCount(0);
    await expect(replyButton).toBeFocused();
    await expect(replyButton.locator('.draft-badge')).toHaveText('초안 있음');
    await replyButton.click();
    await expect(page.getByLabel('답글 내용')).toHaveValue('경고 문구와 함께 보낼 답글');
    // The same key works from a visibility radio.
    await page.locator('.inline-reply .visibility-option input:not([disabled])').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.inline-reply')).toHaveCount(0);
  });
});

test.describe('round 8: the counter, the words on the buttons and the toast', () => {
  /** The rectangles of two elements overlap. */
  const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  test('the character count follows real keystrokes and refuses a draft over the limit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockServer(page, []);
    await connect(page);
    const composer = page.locator('.main-composer');
    const count = composer.locator('.character-count');
    const publish = page.getByRole('button', { name: '게시하기', exact: true });
    await composer.getByLabel('새 글').click();
    await expect(count).toHaveText('0 / 5,000');
    // Typed, not filled: the counter has to follow the input event itself.
    await page.keyboard.type('안녕하세요');
    await expect(count).toHaveText('5 / 5,000');
    await page.keyboard.type(' 반갑습니다');
    await expect(count).toHaveText('11 / 5,000');
    await expect(publish).toBeEnabled();
    await page.keyboard.press('Backspace');
    await expect(count).toHaveText('10 / 5,000');
    // Over the ceiling: the count says so and the publish button is unavailable.
    await composer.getByLabel('새 글').fill('가'.repeat(5001));
    await expect(count).toContainText('5,001 / 5,000');
    await expect(count).toContainText('너무 길어요');
    await expect(publish).toBeDisabled();
    // The refusal is announced once; the running number never speaks on its own.
    await expect(count).not.toHaveAttribute('aria-live', /.*/);
    await expect(composer.locator('[aria-live="polite"]')).toContainText('5,000자를 넘어서');
    await composer.getByLabel('새 글').fill('가'.repeat(5000));
    await expect(count).toHaveText('5,000 / 5,000');
    await expect(publish).toBeEnabled();
  });

  test('at 390 every action keeps its word, its 44px target and a shape of its own', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const row = page.locator('.note-card').first().locator('.note-actions');
    const labels = row.locator('.action-label');
    // The reader's own note: the five actions every note carries, then 관리, behind which
    // 수정 and 삭제 wait on a phone (round 15) - with a second 저장 for the narrowest cards
    // (round 18), drawn only there.
    await expect(labels).toHaveCount(9);
    await expect(labels).toHaveText([
      '답글',
      '공유',
      '좋아요',
      '저장',
      '대화',
      '관리',
      '저장',
      '수정',
      '삭제',
    ]);
    for (let index = 0; index < 5; index++) {
      const label = labels.nth(index);
      await expect(label).toBeVisible();
      await expect(label).toBeInViewport();
      const box = (await label.boundingBox())!;
      expect(box.width, `label ${index}`).toBeGreaterThan(0);
      const button = (await row.locator('button').nth(index).boundingBox())!;
      expect(button.height, `target ${index}`).toBeGreaterThanOrEqual(44);
      expect(button.x + button.width).toBeLessThanOrEqual(390);
    }
    // Managing my own note comes after those five, one tap behind 관리 - the words are
    // never dropped, and the destructive one is the furthest from a stray thumb.
    await row.getByRole('button', { name: /관리/ }).click();
    for (const [name, selector] of [
      ['수정', '.edit-button'],
      ['삭제', '.delete-button'],
    ]) {
      const button = row.locator(selector);
      await expect(button.locator('.action-label')).toBeVisible();
      expect((await button.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    // The words shrink to the smallest type step rather than disappearing.
    expect(await labels.first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
    // Reply and conversation are two different drawings, not one bubble twice.
    const shapes = await row
      .locator('button:visible svg path')
      .evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  test('at 390 the author and the 원글 보기 cue are 44px targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const reply = page.locator('.note-card').filter({ hasText: '저도요.' });
    const author = (await reply.locator('.author').boundingBox())!;
    expect(author.height).toBeGreaterThanOrEqual(44);
    const cue = (await reply.locator('.reply-context--button').boundingBox())!;
    expect(cue.height).toBeGreaterThanOrEqual(44);
  });

  test('a reaction in effect differs by more than its hue', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    // The sample account has already liked this note; the one above it is untouched.
    const liked = page.locator('.note-card').filter({ hasText: '저도요.' }).locator('.like-button');
    const plain = page
      .locator('.note-card', { has: page.locator('.note-content', { hasText: '커피 한 잔' }) })
      .locator('.like-button');
    await expect(liked).toHaveAttribute('aria-pressed', 'true');
    await expect(plain).toHaveAttribute('aria-pressed', 'false');
    // The word itself changes: readable in greyscale, and read out by a screen reader.
    await expect(liked.locator('.action-label')).toHaveText('좋아함');
    await expect(plain.locator('.action-label')).toHaveText('좋아요');
    await expect(liked).toHaveAccessibleName('좋아함 1');
    // The heart fills in and the control takes an outline the unpressed one does not have.
    expect(await liked.locator('svg').getAttribute('fill')).toBe('currentColor');
    expect(await plain.locator('svg').getAttribute('fill')).toBe('none');
    const outline = (element: import('@playwright/test').Locator) =>
      element.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(await outline(liked)).not.toBe(await outline(plain));
    expect(await outline(liked)).not.toBe('none');
  });

  test('the toast never lands on the first card or an open composer at 390 or 823x514', async ({
    page,
  }) => {
    await mockServer(page, [createNote(1, { content: '<p>one</p>' })]);
    await connect(page);
    const card = page.locator('.timeline .note-card').first();
    for (const size of [
      { width: 390, height: 844 },
      { width: 823, height: 514 },
    ]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      const before = (await card.boundingBox())!;
      await card.getByRole('button', { name: /^저장/ }).click();
      const toast = page.locator('.toast');
      await expect(toast).toBeVisible();
      await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect((await card.boundingBox())!.y, `${size.width}px shift`).toBe(before.y);
      const box = (await toast.boundingBox())!;
      console.log(
        `toast box at ${size.width}x${size.height}: x ${box.x} y ${box.y} w ${box.width} h ${box.height}`,
      );
      // At scroll 0 the pill never lies on the first card or the main composer.
      for (const other of ['.timeline .note-card', '.main-composer .composer']) {
        const target = (await page.locator(other).first().boundingBox())!;
        expect(intersects(box, target), `${size.width}px ${other}`).toBe(false);
      }
      // Taps pass through the region at every width; on a mid-width window only its own
      // close control takes the pointer, and a phone has no close control at all (round 17).
      expect(
        await page.evaluate(() => {
          const region = document.querySelector('.toast-region')!.getBoundingClientRect();
          const hit = document.elementFromPoint(region.left + 2, region.top + region.height / 2);
          return hit?.closest('.toast-region') === null;
        }),
      ).toBe(true);
      if (size.width > 650) await page.getByRole('button', { name: '알림 닫기' }).click();
      else await expect(page.getByRole('button', { name: '알림 닫기' })).toHaveCount(0);
      await expect(toast).toHaveCount(0, { timeout: 6000 });
    }
    // Still clears by itself, and still only announced politely.
    await card.getByRole('button', { name: /^저장/ }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });
  });
});

test.describe('round 9: reaction scope, warned replies, dropped activities and long feeds', () => {
  const followers = `${actor}/followers`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  /** The mock server of this round: an actor with followers, plus captured POST bodies. */
  async function server(
    page: import('@playwright/test').Page,
    outbox: unknown[],
    bodies: Record<string, unknown>[] = [],
  ) {
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST') {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers,
              }
            : {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? [] : outbox,
              },
      });
    });
    return bodies;
  }

  test('a share says what it will do and is never addressed wider than the note', async ({
    page,
  }) => {
    const bodies = await server(page, [
      createNote(1, { content: '<p>followers only</p>', to: [followers] }),
      createNote(2, { content: '<p>public one</p>', to: [PUBLIC] }),
    ]);
    await connect(page);
    const closed = page.locator('.note-card', { hasText: 'followers only' });
    const open = page.locator('.note-card', { hasText: 'public one' });
    // The card says what sharing will do before the control that does it is used.
    await expect(closed.locator('.share-scope')).toBeVisible();
    await expect(closed.locator('.share-scope')).toHaveText(
      '팔로워만 공개 글이라 팔로워에게만 공유돼요.',
    );
    // A public note reaches the same people either way, so nothing is said about it.
    await expect(open.locator('.share-scope')).toHaveCount(0);
    await closed.getByRole('button', { name: /^공유/ }).click();
    await expect(page.getByRole('status')).toHaveText('공유했어요.');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: 'Announce', object: `${origin}/notes/1` });
    expect(bodies[0].to).toEqual([followers]);
    expect(bodies[0].cc).toEqual([]);
    expect(JSON.stringify(bodies[0])).not.toContain('#Public');
    await open.getByRole('button', { name: /^좋아요/ }).click();
    await expect(page.getByRole('status')).toHaveText('좋아요를 남겼어요.');
    expect(bodies[1].to).toEqual([PUBLIC]);
  });

  test('the reply composer respects the parent warning and carries it forward', async ({
    page,
  }) => {
    const bodies = await server(page, [
      createNote(3, { content: '<p>결말은 이렇습니다.</p>', summary: 'R8 경고', to: [PUBLIC] }),
    ]);
    await connect(page);
    const card = page.locator('.note-card', { hasText: 'R8 경고' });
    await card.getByRole('button', { name: /답글 달기/ }).click();
    const preview = page.locator('.inline-reply .compose-parent');
    // The composer quotes the parent, so it must keep the same gate the card puts up.
    await expect(preview.locator('.content-warning-label')).toHaveText('주의: R8 경고');
    await expect(preview).not.toContainText('결말은 이렇습니다');
    const reveal = preview.getByRole('button', { name: '내용 보기', exact: true });
    await expect(reveal).toHaveAttribute('aria-expanded', 'false');
    await reveal.click();
    await expect(preview).toContainText('결말은 이렇습니다');
    await preview.getByRole('button', { name: '접기', exact: true }).click();
    await expect(preview).not.toContainText('결말은 이렇습니다');
    // The reply starts with the parent's warning, unchanged and with nothing added in front.
    const warning = page.locator('.inline-reply').getByLabel('경고 문구');
    await expect(warning).toHaveValue('R8 경고');
    await page.getByLabel('답글 내용').fill('경고를 이어받은 답글');
    await page.getByRole('button', { name: '답글 게시하기' }).click();
    await expect(page.getByRole('status')).toHaveText('게시됐어요.');
    const first = bodies[0].object as Record<string, unknown>;
    expect(first.summary).toBe('R8 경고');
    expect(String(first.summary)).not.toMatch(/^re:/i);
    // It is a default, not a rule: the writer can take it off again.
    await card.getByRole('button', { name: /답글 달기/ }).click();
    await page.locator('.inline-reply').getByRole('button', { name: '경고 문구 제거' }).click();
    await expect(page.locator('.inline-reply').getByLabel('경고 문구')).toHaveCount(0);
    await page.getByLabel('답글 내용').fill('경고 없이 보내는 답글');
    await page.getByRole('button', { name: '답글 게시하기' }).click();
    await expect.poll(() => bodies.length).toBe(2);
    expect((bodies[1].object as Record<string, unknown>).summary).toBeUndefined();
  });

  test('at 390 the timeline prints how many activities it could not show', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await server(page, [
      createNote(1, { content: '<p>one</p>', to: [PUBLIC] }),
      // Two collection entries this client does not understand: neither is rendered.
      { name: 'unsupported activity' },
      { name: 'another one' },
    ]);
    await connect(page);
    await expect(page.locator('.note-card')).toHaveCount(1);
    // The count is on the page at a phone width, not in a tooltip; the reason is one tap away.
    const status = page.locator('.feed-status');
    await status.scrollIntoViewIfNeeded();
    await expect(status).toBeVisible();
    await expect(status).toContainText('표시하지 않은 활동 2개');
    await expect(status).toContainText('마지막 확인');
    await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
    const dropped = page.locator('.feed-status-dropped');
    await expect(dropped).toBeVisible();
    await expect(dropped).toHaveText('미지원 활동 2개는 표시하지 못했어요');
    expect(await dropped.evaluate((el) => el.getBoundingClientRect().width > 0)).toBe(true);
  });

  test('a long feed pages, comes back to the top and keeps its place across a thread', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    const at = (index: number) =>
      new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
    const outbox = Array.from({ length: 122 }, (_, index) =>
      createNote(index + 1, {
        content: `<p>note ${index + 1}</p>`,
        to: [PUBLIC],
        published: at(index),
      }),
    );
    await server(page, outbox);
    await connect(page);
    await expect(page.locator('.note-card')).toHaveCount(50);
    // Nothing was dropped here, so the list says nothing about dropped activities.
    await expect(page.locator('.feed-status-dropped')).toHaveCount(0);
    await expect(page.locator('.feed-status')).toContainText('불러온 글 122개 중 50개 표시');
    const more = page.getByRole('button', { name: /더 보기/ });
    await expect(more).toContainText('남은 글 72개');
    await more.click();
    await expect(page.locator('.note-card')).toHaveCount(100);
    await expect(more).toContainText('남은 글 22개');
    // Search still runs over every loaded note, not only the ones on screen.
    await page.getByLabel('불러온 글 검색').fill('note 121');
    await expect(page.locator('.note-card')).toHaveCount(1);
    await page.getByLabel('불러온 글 검색').fill('');
    await expect(page.locator('.note-card')).toHaveCount(50);
    await more.click();
    await expect(page.locator('.note-card')).toHaveCount(100);
    // A card on the second page: open its conversation, come back, land where we left.
    const card = page.locator('.note-card', { hasText: 'note 40' });
    await card.scrollIntoViewIfNeeded();
    const offset = await page.evaluate(() => window.scrollY);
    expect(offset).toBeGreaterThan(1600);
    await expect(page.locator('.to-top')).toBeVisible();
    await card.getByRole('button', { name: '대화 열기', exact: true }).click();
    await expect(page.getByRole('region', { name: '대화 내용' })).toBeVisible();
    await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
    await expect(page.locator('.note-card')).toHaveCount(100);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(offset);
    // Back to the top: the viewport and the focus both go there, without motion when
    // the reader asked for none.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.to-top').click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('#timeline')).toBeFocused();
    await expect(page.locator('.to-top')).toHaveCount(0);
  });
});

test.describe('round 10: withdrawing, deleting and editing my own note', () => {
  const followers = `${actor}/followers`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const EDITED = '2026-09-09T00:00:00Z';

  /**
   * A mock that answers writes the way the real fixture does: a Delete is 410 Gone with a
   * Location, a deleted note leaves a Tombstone inside its Create, a deleted reaction leaves
   * the outbox entirely, and an Update patches the stored object and stamps `updated`.
   */
  async function server(page: import('@playwright/test').Page, outbox: Record<string, unknown>[]) {
    const bodies: Record<string, unknown>[] = [];
    const objectOf = (activity: Record<string, unknown>) =>
      activity.object as Record<string, unknown> | undefined;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        bodies.push(body);
        const target =
          typeof body.object === 'string'
            ? body.object
            : ((body.object as { id?: string } | null)?.id ?? '');
        if (body.type === 'Delete') {
          const index = outbox.findIndex((activity) => activity.id === target);
          // Deleting a reaction removes its row; deleting a note leaves a Tombstone behind.
          if (index >= 0) outbox.splice(index, 1);
          else
            for (const activity of outbox)
              if (objectOf(activity)?.id === target)
                activity.object = {
                  id: target,
                  type: 'Tombstone',
                  formerType: 'Note',
                  deleted: EDITED,
                };
          await route.fulfill({
            status: 410,
            headers: {
              Location: `${origin}/activities/gone`,
              'Access-Control-Expose-Headers': 'Location',
            },
          });
          return;
        }
        if (body.type === 'Update') {
          const patch = body.object as Record<string, unknown>;
          for (const activity of outbox) {
            const object = objectOf(activity);
            if (object?.id === patch.id)
              activity.object = {
                ...object,
                content: patch.content,
                summary: patch.summary || undefined,
                updated: EDITED,
              };
          }
        }
        if (body.type === 'Like' || body.type === 'Announce')
          outbox.push({
            id: `${origin}/activities/reaction-${outbox.length}`,
            type: body.type,
            actor,
            object: target,
            to: body.to,
          });
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      const url = request.url();
      // Reaction objects are stored as IRIs, so the note itself has to be readable.
      const stored = outbox.map(objectOf).find((object) => object?.id === url);
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers,
              }
            : (stored ?? {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? [] : outbox,
              }),
      });
    });
    return bodies;
  }

  test('withdrawing a like deletes the reaction activity instead of sending an Undo', async ({
    page,
  }) => {
    const outbox: Record<string, unknown>[] = [
      createNote(1, { content: '<p>좋아한 글</p>', to: [PUBLIC] }),
      {
        id: `${origin}/activities/like1`,
        type: 'Like',
        actor,
        object: `${origin}/notes/1`,
        to: [PUBLIC],
      },
    ];
    const bodies = await server(page, outbox);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '좋아한 글' });
    const like = card.getByRole('button', { name: /^좋아/ });
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await like.click();
    await expect(page.getByRole('status')).toHaveText('좋아요를 취소했어요.');
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: 'Delete', object: `${origin}/activities/like1` });
    // Undo is never sent: this server family answers it with 400 and takes nothing back.
    expect(JSON.stringify(bodies[0])).not.toContain('Undo');
    expect(outbox.some((activity) => activity.type === 'Like')).toBe(false);
    // The unreacted state survives a reload, because the row is gone from the outbox.
    await page.reload();
    await connect(page);
    await expect(card.getByRole('button', { name: /^좋아/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('a reaction whose activity IRI was never loaded is refused, not guessed at', async ({
    page,
  }) => {
    const bodies = await server(page, [
      createNote(2, { content: '<p>주소 없는 좋아요</p>', to: [PUBLIC] }),
      // No `id`: the client cannot tell the server which activity to delete.
      { type: 'Like', actor, object: `${origin}/notes/2`, to: [PUBLIC] },
    ]);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '주소 없는' });
    const like = card.getByRole('button', { name: /^좋아/ });
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await like.click();
    await expect(card.locator('.note-feedback')).toContainText('활동 주소가 없어서');
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(bodies).toEqual([]);
  });

  test('deleting my own note needs a confirmation, and the tombstone keeps it gone', async ({
    page,
  }) => {
    const outbox: Record<string, unknown>[] = [
      createNote(1, { content: '<p>지울 글</p>', to: [PUBLIC], published: '2026-09-08T00:00:00Z' }),
      createNote(2, { content: '<p>남을 글</p>', to: [PUBLIC], published: '2026-09-07T00:00:00Z' }),
    ];
    const bodies = await server(page, outbox);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '지울 글' });
    await openManage(card);
    const remove = card.getByRole('button', { name: '내 글 삭제하기' });
    await expect(remove).toHaveAttribute('aria-expanded', 'false');
    await remove.click();
    const confirmation = page.getByRole('group', { name: '이 글을 삭제할까요?' });
    await expect(confirmation).toContainText('내 서버에서 글이 지워지고');
    await expect(confirmation).toContainText('되돌리기도 없어요');
    await expect(remove).toHaveAttribute('aria-expanded', 'true');
    // The confirmation reads on a phone without pushing the page sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(confirmation).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    // Focus lands on 삭제 취소, so the key a reader presses next cannot delete anything.
    const cancel = page.getByRole('button', { name: '삭제 취소' });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Enter');
    expect(bodies).toEqual([]);
    await expect(confirmation).toHaveCount(0);
    await expect(remove).toBeFocused();
    // Escape backs out of it too, and comes back to the control that opened it.
    await remove.click();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(bodies).toEqual([]);
    // Only the explicit confirmation deletes.
    await remove.click();
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('내 서버에서 글을 지웠어요');
    await expect(card).toHaveCount(0);
    await expect(page.locator('article.note-card')).toHaveCount(1);
    // 410 Gone is the success status for a Delete: nothing is reported as a failure.
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: 'Delete', object: `${origin}/notes/1` });
    // The Create is still in the outbox with a Tombstone in it; the note stays gone.
    await page.reload();
    await connect(page);
    await expect(page.locator('article.note-card')).toHaveCount(1);
    await expect(page.getByText('지울 글')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.feed-status-dropped')).toHaveCount(0);
  });

  test('deleting the open conversation closes it with a reason', async ({ page }) => {
    await server(page, [
      createNote(1, {
        content: '<p>대화의 글</p>',
        to: [PUBLIC],
        published: '2026-09-08T00:00:00Z',
      }),
    ]);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '대화의 글' });
    await card.getByRole('button', { name: '대화 열기', exact: true }).click();
    await expect(page.getByRole('region', { name: '대화 내용' })).toBeVisible();
    await openManage(page.locator('.conversation .note-card--focused'));
    await page.locator('.conversation').getByRole('button', { name: '내 글 삭제하기' }).click();
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('삭제한 글의 대화를 닫았어요');
    await expect(page.getByRole('region', { name: '대화 내용' })).toHaveCount(0);
    await expect(page.locator('.missing-parent')).toHaveCount(0);
  });

  test('a note edited on the server says so with the time of the edit', async ({ page }) => {
    const updated = new Date(Date.now() - 5.5 * 60_000).toISOString();
    await mockServer(page, [
      createNote(1, {
        content: '<p>이미 고친 글</p>',
        to: [PUBLIC],
        published: '2026-09-01T00:00:00Z',
        updated,
      }),
    ]);
    await connect(page);
    await expect(page.locator('.note-edited')).toHaveText(/수정됨 · 5분 전/);
  });

  test('editing my own note reopens the composer and posts an Update with the object embedded', async ({
    page,
  }) => {
    const bodies = await server(page, [
      createNote(1, {
        content: '<p>처음 글<br>둘째 줄</p>',
        summary: '옛 경고',
        to: [followers],
        published: '2026-09-08T00:00:00Z',
      }),
    ]);
    await connect(page);
    const card = page.locator('article.note-card').first();
    await openManage(card);
    await card.getByRole('button', { name: '내 글 수정하기' }).click();
    const form = page.locator('.inline-edit');
    const body = form.getByLabel('글 수정');
    await expect(body).toBeFocused();
    await expect(body).toHaveValue('처음 글\n둘째 줄');
    await expect(form.getByLabel('경고 문구')).toHaveValue('옛 경고');
    // The scope is reported, never offered: an edit rewrites words, not the audience.
    await expect(form.getByRole('radio')).toHaveCount(0);
    // One line: the scope word, that it stays, and what the edit does change (round 18).
    await expect(form.locator('.compose-scope--fixed')).toHaveText(
      '팔로워만 공개 그대로 · 본문과 경고 문구만 바꿔요',
    );
    await expect(form.locator('.composer-footer .visibility')).toHaveCount(0);
    await expect(body).not.toHaveAttribute('placeholder', /./);
    await body.fill('고친 글');
    await form.getByLabel('경고 문구').fill('새 경고');
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      type: 'Update',
      actor,
      object: {
        id: `${origin}/notes/1`,
        type: 'Note',
        attributedTo: actor,
        content: '고친 글',
        mediaType: 'text/html',
        summary: '새 경고',
      },
    });
    // No addressing in the patch: the note keeps the audience it was published to.
    expect(bodies[0].to).toBeUndefined();
    expect((bodies[0].object as Record<string, unknown>).to).toBeUndefined();
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(card.locator('.content-warning-label')).toHaveText('주의: 새 경고');
    await card.getByRole('button', { name: '내용 보기', exact: true }).click();
    await expect(card.locator('.note-content')).toContainText('고친 글');
    await expect(card.locator('.note-edited')).toContainText('수정됨');
  });
});

test.describe('round 11: stale cards, a reopened edit, a withdrawal and the phone row', () => {
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

  /**
   * A mock in the shape of the real fixture, with two switches the tests need: reads can be
   * made to fail after the next write (so a confirmed write is followed by a failed reload),
   * and one object can be made to answer 410 Gone with a Tombstone the way a note deleted
   * from another tab does.
   */
  async function server(page: import('@playwright/test').Page, outbox: Record<string, unknown>[]) {
    const bodies: Record<string, unknown>[] = [];
    const state = { readsFail: false, gone: new Set<string>() };
    const objectOf = (activity: Record<string, unknown>) =>
      activity.object as Record<string, unknown> | undefined;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = request.url();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        bodies.push(body);
        const target =
          typeof body.object === 'string'
            ? body.object
            : ((body.object as { id?: string } | null)?.id ?? '');
        if (body.type === 'Delete') {
          const index = outbox.findIndex((activity) => activity.id === target);
          if (index >= 0) outbox.splice(index, 1);
          else state.gone.add(target);
          await route.fulfill({
            status: 410,
            headers: {
              Location: `${origin}/activities/gone`,
              'Access-Control-Expose-Headers': 'Location',
            },
          });
          return;
        }
        if (body.type === 'Update') {
          const patch = body.object as Record<string, unknown>;
          for (const activity of outbox) {
            const object = objectOf(activity);
            if (object?.id === patch.id)
              activity.object = {
                ...object,
                content: patch.content,
                summary: patch.summary || undefined,
              };
          }
        }
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      // A note deleted elsewhere answers 410 with a Tombstone, exactly as ONI does.
      if (state.gone.has(url)) {
        await route.fulfill({
          status: 410,
          json: { id: url, type: 'Tombstone', formerType: 'Note' },
          contentType: 'application/activity+json',
        });
        return;
      }
      if (state.readsFail && url !== actor) {
        await route.fulfill({ status: 503 });
        return;
      }
      const stored = outbox.map(objectOf).find((object) => object?.id === url);
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : (stored ?? {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? [] : outbox,
              }),
      });
    });
    return { bodies, state };
  }

  test('the edit form reopens with the stored words after a saved edit', async ({ page }) => {
    const { bodies } = await server(page, [
      createNote(1, { content: '<p>처음 글</p>', to: [PUBLIC] }),
    ]);
    await connect(page);
    const card = page.locator('article.note-card').first();
    const openEdit = async () => {
      await openManage(card);
      await card.getByRole('button', { name: '내 글 수정하기' }).click();
      return page.locator('.inline-edit');
    };
    let form = await openEdit();
    await expect(form.getByLabel('글 수정')).toHaveValue('처음 글');
    await form.getByLabel('글 수정').fill('한 번 고친 글');
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    // Second time round: the form must carry what the server now stores, not an empty box.
    form = await openEdit();
    const body = form.getByLabel('글 수정');
    await expect(body).toHaveValue('한 번 고친 글');
    await expect(form.getByRole('button', { name: '수정하기', exact: true })).toBeEnabled();
    await body.fill('두 번 고친 글');
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
    await expect(card.locator('.note-content')).toContainText('두 번 고친 글');
    expect(bodies.filter((b) => b.type === 'Update')).toHaveLength(2);
    expect((bodies[1].object as Record<string, unknown>).content).toBe('두 번 고친 글');
  });

  test('a withdrawn share reports the withdrawal and flips its own control when the reload fails', async ({
    page,
  }) => {
    const { bodies, state } = await server(page, [
      createNote(1, { content: '<p>공유했던 글</p>', to: [PUBLIC] }),
      {
        id: `${origin}/activities/share1`,
        type: 'Announce',
        actor,
        object: `${origin}/notes/1`,
        to: [PUBLIC],
      },
    ]);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '공유했던 글' });
    const share = card.getByRole('button', { name: /^공유/ });
    await expect(share).toHaveAttribute('aria-pressed', 'true');
    state.readsFail = true;
    await share.click();
    await expect(page.getByRole('status')).toHaveText('');
    // The write went through, so the control shows the state that was written.
    await expect(share).toHaveAttribute('aria-pressed', 'false');
    await expect(share).toHaveText(/공유$/);
    // The reload failure is reported in the words of a withdrawal, not of a publication.
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('공유는 취소되었지만');
    await expect(alert).not.toContainText('게시');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: 'Delete', object: `${origin}/activities/share1` });
  });

  test('editing a note another tab deleted refuses, explains, and drops the card', async ({
    page,
  }) => {
    const { bodies, state } = await server(page, [
      createNote(1, {
        content: '<p>사라질 글</p>',
        to: [PUBLIC],
        published: '2026-09-08T00:00:00Z',
      }),
      createNote(2, { content: '<p>남을 글</p>', to: [PUBLIC], published: '2026-09-07T00:00:00Z' }),
    ]);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '사라질 글' });
    await openManage(card);
    await card.getByRole('button', { name: '내 글 수정하기' }).click();
    const form = page.locator('.inline-edit');
    await form.getByLabel('글 수정').fill('되살리려던 글');
    // Meanwhile the note is deleted elsewhere; this card is now stale.
    state.gone.add(`${origin}/notes/1`);
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    // Nothing was sent: an Update would have put the note back up on the server.
    expect(bodies).toEqual([]);
    await expect(page.getByRole('alert')).toContainText('서버에 더 이상 없어요');
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await expect(page.locator('article.note-card')).toHaveCount(1);
    // Nothing is announced as done: the edit was refused, not applied.
    await expect(page.getByRole('status')).toHaveText('');
  });

  test('deleting a note that is already gone says so instead of claiming a fresh deletion', async ({
    page,
  }) => {
    const { bodies, state } = await server(page, [
      createNote(1, { content: '<p>이미 지워진 글</p>', to: [PUBLIC] }),
    ]);
    await connect(page);
    const card = page.locator('article.note-card').filter({ hasText: '이미 지워진 글' });
    await openManage(card);
    await card.getByRole('button', { name: '내 글 삭제하기' }).click();
    state.gone.add(`${origin}/notes/1`);
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('이미 지워진 글이라');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(card).toHaveCount(0);
    expect(bodies).toEqual([]);
  });

  test('every action on my own note is reachable on a phone without scrolling the row', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>내 글</p>', to: [PUBLIC] })]);
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    const card = page.locator('article.note-card').first();
    const row = card.locator('.note-actions');
    // The row holds everything it has: nothing is parked behind a sideways scroll.
    const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // The five everyone gets, plus 관리 for my own note, on one row; 수정 and 삭제 are one
    // tap behind it (round 15), never behind a scroll.
    const controls: [string, string][] = [
      [
        '답글',
        '.text-button:not(.share-button):not(.like-button):not(.save-button):not(.thread-button):not(.edit-button):not(.delete-button):not(.manage-toggle)',
      ],
      ['공유', '.share-button'],
      ['좋아요', '.like-button'],
      ['저장', '.save-button'],
      ['대화', '.thread-button'],
      ['관리', '.manage-toggle'],
    ];
    await expect(row.locator('.edit-button')).toBeHidden();
    await expect(row.locator('.delete-button')).toBeHidden();
    await row.locator('.manage-toggle').click();
    await expect(row.locator('.manage-toggle')).toHaveAttribute('aria-expanded', 'true');
    controls.push(['수정', '.edit-button'], ['삭제', '.delete-button']);
    for (const [name, selector] of controls) {
      const button = row.locator(selector).first();
      const box = (await button.boundingBox())!;
      expect(box, `${name} is laid out`).toBeTruthy();
      expect(box.x, `${name} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} ends inside the viewport`).toBeLessThanOrEqual(390);
      expect(box.height, `${name} keeps a 44px target`).toBeGreaterThanOrEqual(44);
      // Round 8 put the words back on these controls; they stay visible here.
      await expect(button.locator('.action-label')).toBeVisible();
      await expect(button.locator('.action-label')).toHaveText(new RegExp(`^${name}`));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('my own notes carry a visible label, not only a colour', async ({ page }) => {
    await server(page, [
      createNote(1, {
        content: '<p>내가 쓴 글</p>',
        to: [PUBLIC],
        published: '2026-09-08T00:00:00Z',
      }),
      createNote(2, {
        content: '<p>남이 쓴 글</p>',
        attributedTo: `${origin}/users/bob`,
        to: [PUBLIC],
        published: '2026-09-07T00:00:00Z',
      }),
    ]);
    await connect(page);
    const mine = page.locator('article.note-card').filter({ hasText: '내가 쓴 글' });
    const theirs = page.locator('article.note-card').filter({ hasText: '남이 쓴 글' });
    await expect(mine.locator('.own-badge')).toHaveText('내 글');
    await expect(mine.locator('.own-badge')).toBeVisible();
    await expect(theirs.locator('.own-badge')).toHaveCount(0);
  });

  test('the foot says how much of the server the client actually read', async ({ page }) => {
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      await route.fulfill({
        json:
          url === actor
            ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
            : {
                type: 'OrderedCollection',
                // The outbox declares four and hands over one, with no next page to follow.
                totalItems: url.endsWith('/inbox') ? 0 : 4,
                orderedItems: url.endsWith('/inbox')
                  ? []
                  : [createNote(1, { content: '<p>남은 한 개</p>' })],
              },
      });
    });
    await connect(page);
    await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
    const reach = page.locator('.feed-reach');
    await expect(reach).toBeVisible();
    await expect(reach).toContainText('서버에서 읽은 활동 1개');
    await expect(reach).toContainText('서버에 3개가 더 있지만 아직 불러오지 못했어요');
    await expect(reach).toContainText('이전(오래된) 글 일부는 지금 이 화면에서 볼 수 없어요');
    // No promise of a page this client cannot ask for.
    await expect(page.locator('.feed-foot')).not.toContainText('이전 글 더 불러오기');
  });
});

test.describe('round 12: the panel row, refused activities, a stale toast and the token', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** A server that accepts writes and answers reads of stored objects, as the fixture does. */
  async function server(page: import('@playwright/test').Page, outbox: Record<string, unknown>[]) {
    const bodies: Record<string, unknown>[] = [];
    let held: Promise<void> | undefined;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = request.url();
      if (request.method() === 'POST') {
        bodies.push(request.postDataJSON() as Record<string, unknown>);
        if (held) await held;
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      const stored = outbox
        .map((activity) => activity.object as Record<string, unknown> | undefined)
        .find((object) => object?.id === url);
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : (stored ?? {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? [] : outbox,
              }),
      });
    });
    return { bodies, hold: (gate: Promise<void>) => (held = gate) };
  }

  test('every action on my own note and the whole delete confirmation stay inside the conversation panel from 1100 to 1920', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, {
        content: '<p>대화 속 내 글</p>',
        to: [PUBLIC],
        published: '2026-09-01T00:00:00Z',
      }),
      createNote(2, {
        content: '<p>남의 답글</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: '2026-09-02T00:00:00Z',
      }),
    ]);
    await page.setViewportSize({ width: 1100, height: 900 });
    await connect(page);
    const panel = page.locator('.context-column .thread-panel');
    const focused = panel.locator('.note-card--focused');
    /** Every box a reader has to reach lies inside the panel, and the panel hands it back. */
    const reachable = (target: import('@playwright/test').Locator) =>
      target.evaluate((el: HTMLElement) => {
        const panelBox = el.closest('.thread-panel')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const point = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          inside: box.left >= panelBox.left - 1 && box.right <= panelBox.right + 1,
          width: Math.round(box.width),
          height: Math.round(box.height),
          // The panel hands the point back to this control, not to the shell that clips it.
          hits: !!point && el.contains(point),
        };
      });
    const controls = ['답글', '공유', '좋아요', '저장', '대화', '관리', '수정', '삭제'];
    for (const width of [1100, 1280, 1440, 1600, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .locator('#timeline article.note-card', {
          has: page.locator('.note-content', { hasText: '대화 속 내 글' }),
        })
        .getByRole('button', { name: /^대화/ })
        .click();
      await expect(focused).toBeVisible();
      const row = focused.locator('.note-actions');
      // Round 16: the panel is never 480px wide, so it folds 수정 and 삭제 behind 관리 like a
      // phone does - one row of six, 관리 last on that same row - and opens them inline.
      const manage = row.locator('.manage-toggle');
      await expect(manage, `${width}px`).toBeVisible();
      // Round 18: on a card under 350px my own 저장 waits in the 관리 row with 수정 and 삭제.
      const folded =
        (await row.locator('.save-button--folded').count()) > 0 &&
        (await row
          .locator('.save-button--folded')
          .evaluate((el) => getComputedStyle(el).display)) !== 'none';
      const closedCount = folded ? 5 : 6;
      await expect(row.locator('button:visible')).toHaveCount(closedCount);
      const boxes = await row.locator('button:visible').evaluateAll((items) =>
        items.map((el) => {
          const box = el.getBoundingClientRect();
          return { top: Math.round(box.top), width: Math.round(box.width) };
        }),
      );
      console.log(`panel own row at ${width}: ${boxes.map((box) => box.width).join('+')}px`);
      // One row from 1440 up, where the panel is 460px wide; at 1100-1280 (300-380px) the
      // six fold onto two rows at most, never the three the inline 수정/삭제 used to take.
      expect(new Set(boxes.map((box) => box.top)).size, `${width}px rows`).toBeLessThanOrEqual(
        width >= 1440 ? 1 : 2,
      );
      await manage.click();
      await expect(manage).toHaveAttribute('aria-expanded', 'true');
      await expect(row.locator('button:visible')).toHaveCount(8);
      // Nothing is parked behind a sideways scroll the panel would clip away.
      expect(
        await row.evaluate((el) => el.scrollWidth - el.clientWidth),
        `${width}px`,
      ).toBeLessThanOrEqual(1);
      const opened = folded
        ? ['답글', '공유', '좋아요', '대화', '관리', '저장', '수정', '삭제']
        : controls;
      for (const [index, word] of opened.entries()) {
        const button = row.locator('button:visible').nth(index);
        await expect(button.locator('.action-label'), `${width}px ${word}`).toHaveText(
          new RegExp(`^${word}`),
        );
        await expect(button.locator('.action-label')).toBeVisible();
        const measured = await reachable(button);
        expect(measured, `${width}px ${word}`).toMatchObject({ inside: true, hits: true });
        expect(measured.width, `${width}px ${word} has a target`).toBeGreaterThan(0);
      }
      // The confirmation the delete control opens is inside the panel too, buttons and all.
      await row.locator('.delete-button').click();
      const confirm = panel.locator('.delete-confirm');
      await expect(confirm).toBeVisible();
      expect(await reachable(confirm), `${width}px 확인`).toMatchObject({
        inside: true,
      });
      for (const name of ['삭제 취소', '삭제하기']) {
        const button = confirm.getByRole('button', { name, exact: true });
        await expect(button, `${width}px ${name}`).toBeVisible();
        expect(await reachable(button), `${width}px ${name}`).toMatchObject({
          inside: true,
          hits: true,
        });
      }
      await confirm.getByRole('button', { name: '삭제 취소', exact: true }).click();
      await page.getByRole('button', { name: '목록으로 돌아가기' }).click();
    }
  });

  test('activities the client refused are counted in the foot, apart from the unsupported ones', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>보이는 글</p>', to: [PUBLIC] }),
      // Stored and served by the server, and refused here: the Create is mine, the note
      // inside it says someone else wrote it.
      {
        id: `${origin}/activities/9`,
        type: 'Create',
        actor,
        object: {
          id: `${origin}/notes/9`,
          type: 'Note',
          attributedTo: bob,
          content: '<p>남의 이름이 붙은 글</p>',
          published: '2026-09-05T00:00:00Z',
          to: [PUBLIC],
        },
      },
      { name: 'unsupported activity' },
    ]);
    await connect(page);
    await expect(page.locator('#timeline article.note-card')).toHaveCount(1);
    await expect(page.locator('.note-content')).not.toContainText('남의 이름이 붙은 글');
    await expect(page.locator('.feed-status')).toContainText('표시하지 않은 활동 2개');
    await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
    const refused = page.locator('.feed-status-refused');
    await refused.scrollIntoViewIfNeeded();
    await expect(refused).toBeVisible();
    await expect(refused).toContainText('안전을 위해 거절한 활동 1개');
    // Refused is not the same admission as unsupported, and the foot says so in both places.
    await expect(refused).toContainText('미지원이 아니라');
    await expect(page.locator('.feed-status-dropped')).toHaveText(
      '미지원 활동 1개는 표시하지 못했어요',
    );
    expect(await refused.evaluate((el) => el.getBoundingClientRect().width > 0)).toBe(true);
  });

  test('a clean timeline says nothing about refused activities', async ({ page }) => {
    await server(page, [createNote(1, { content: '<p>문제 없는 글</p>', to: [PUBLIC] })]);
    await connect(page);
    await expect(page.locator('.feed-status')).toContainText('마지막 확인');
    await expect(page.locator('.feed-status-refused')).toHaveCount(0);
    await expect(page.locator('.feed-foot')).not.toContainText('거절');
  });

  test('a confirmation never stands over the write that comes after it', async ({ page }) => {
    const { hold } = await server(page, [
      createNote(1, { content: '<p>첫 글</p>', to: [PUBLIC], published: '2026-09-01T00:00:00Z' }),
      createNote(2, { content: '<p>둘째 글</p>', to: [PUBLIC], published: '2026-09-02T00:00:00Z' }),
    ]);
    await connect(page);
    const cards = page.locator('#timeline article.note-card');
    const toast = page.locator('.toast');
    await openManage(cards.filter({ hasText: '첫 글' }));
    await cards
      .filter({ hasText: '첫 글' })
      .getByRole('button', { name: '내 글 수정하기' })
      .click();
    const form = page.locator('.inline-edit');
    await form.getByLabel('글 수정').fill('첫 글을 고쳤어요');
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    await expect(toast).toHaveText('글을 수정했어요.');
    // Well inside the three seconds the toast would otherwise stand for: the next write begins.
    await openManage(cards.filter({ hasText: '둘째 글' }));
    await cards
      .filter({ hasText: '둘째 글' })
      .getByRole('button', { name: '내 글 수정하기' })
      .click();
    // Inside a second, not four: the words go with the action they confirmed, not on a timer.
    await expect(toast).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByRole('status')).toHaveText('');
    let release!: () => void;
    hold(new Promise<void>((resolve) => (release = resolve)));
    const second = page.locator('.inline-edit');
    await second.getByLabel('글 수정').fill('둘째 글도 고쳤어요');
    await second.getByRole('button', { name: '수정하기', exact: true }).click();
    // Still gone while the second write is in flight; the stale words never come back.
    await expect(toast).toHaveCount(0, { timeout: 1000 });
    release();
    await expect(toast).toHaveText('글을 수정했어요.');
  });

  test('after connecting without the box ticked, one dismissible line says the session ends on reload', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>연결된 글</p>', to: [PUBLIC] })]);
    await connect(page);
    const hint = page.locator('.session-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('새로고침하면 토큰을 다시 입력해야');
    // It points at the option by the words that are on it, and it is one line of prose.
    await expect(hint).toContainText('새로고침해도 이 탭에서 유지');
    await expect(hint.locator('p')).toHaveCount(1);
    // Saying it stores nothing: the default is still memory only.
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe('{}');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-secret');
    // It never covers the composer or the first card; it takes its own space in the column.
    const box = (await hint.boundingBox())!;
    for (const other of ['.main-composer', '#timeline article.note-card']) {
      const target = (await page.locator(other).first().boundingBox())!;
      expect(overlaps(box, target), other).toBe(false);
    }
    await hint.getByRole('button', { name: '안내 닫기' }).click();
    await expect(hint).toHaveCount(0);
    // Once per session: reconnecting the same tab does not ask again.
    await page.getByRole('button', { name: '연결 해제' }).click();
    await page.getByLabel('Actor URL').fill(actor);
    await page.getByLabel('액세스 토큰').fill('test-secret');
    await page.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(page.locator('#timeline article.note-card')).toHaveCount(1);
    await expect(page.locator('.session-hint')).toHaveCount(0);
  });

  test('ticking the box connects without the reminder, and so does the tab it restores', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>기억된 글</p>', to: [PUBLIC] })]);
    await connect(page, true);
    await expect(page.locator('#timeline article.note-card')).toHaveCount(1);
    await expect(page.locator('.session-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#timeline article.note-card')).toHaveCount(1);
    await expect(page.locator('.session-hint')).toHaveCount(0);
  });

  test('the preview is never reminded about a token it does not have', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await expect(page.locator('.note-card').first()).toBeVisible();
    await expect(page.locator('.session-hint')).toHaveCount(0);
  });
});

test.describe('round 13: names, Escape, the phone bar, the quiet foot and the hint', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** Accepts writes and answers reads of stored objects (a reaction names its note by IRI). */
  async function server(page: import('@playwright/test').Page, outbox: unknown[]) {
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      const stored = outbox
        .map((activity) => (activity as { object?: Record<string, unknown> }).object)
        .find((object) => object?.id === url);
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                preferredUsername: 'alice',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : (stored ?? {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? [] : outbox,
              }),
      });
    });
  }
  const firstCardTop = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      window.scrollTo(0, 0);
      return Math.round(
        document.querySelector('#timeline article.note-card')!.getBoundingClientRect().top,
      );
    });

  test('an account that lives at its server root is called by its username, not its host', async ({
    page,
  }) => {
    // A one-person server (ONI) serves the actor at `https://host/`: no path segment to name.
    const root = 'https://oni.example';
    const me = `${root}/`;
    await page.route(`${root}/**`, (route) => {
      const url = route.request().url();
      return route.fulfill({
        json:
          url === me
            ? {
                id: me,
                type: 'Person',
                preferredUsername: 'Oni',
                inbox: `${root}/inbox`,
                outbox: `${root}/outbox`,
              }
            : {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox')
                  ? []
                  : [
                      {
                        id: `${root}/activities/1`,
                        type: 'Create',
                        actor: me,
                        object: {
                          id: `${root}/notes/1`,
                          type: 'Note',
                          attributedTo: me,
                          content: '<p>이름으로 불리는 글</p>',
                          published: '2026-09-08T00:00:00Z',
                          to: [PUBLIC],
                        },
                      },
                      {
                        id: `${root}/activities/2`,
                        type: 'Announce',
                        actor: me,
                        object: {
                          id: `${root}/notes/1`,
                          type: 'Note',
                          attributedTo: me,
                          content: '<p>이름으로 불리는 글</p>',
                          published: '2026-09-08T00:00:00Z',
                          to: [PUBLIC],
                        },
                        to: [PUBLIC],
                      },
                    ],
              },
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByLabel('Actor URL').fill(me);
    await page.getByLabel('액세스 토큰').fill('test-secret');
    await page.getByRole('button', { name: '연결하기', exact: true }).click();
    const card = page.locator('#timeline article.note-card').first();
    await expect(card.locator('.author')).toHaveText('Oni');
    // Every loaded note is Oni's own, so the card leaves the handle out (round 16); the
    // account line still carries the address the sheet and a busier card would show.
    await expect(card.locator('.author-handle')).toHaveCount(0);
    await expect(page.locator('.context-address')).toHaveText('@Oni@oni.example');
    await expect(card).toHaveAttribute('aria-label', 'Oni의 글');
    await expect(card.locator('.shared-by')).toHaveText('Oni님이 공유');
    await expect(page.locator('.context-handle')).toHaveText('Oni로 연결됨');
    await card.getByRole('button', { name: 'Oni에게 답글 달기' }).click();
    await expect(page.locator('.inline-reply .reply-heading')).toContainText('Oni님에게 답글');
    // Someone the client only knows by IRI is still named by its user segment.
    await expect(page.locator('.note-card .author').filter({ hasText: 'oni.example' })).toHaveCount(
      0,
    );
  });

  test('the permalink is "서버에서 보기": one phrase for the server copy, apart from 원글 보기', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>글</p>', to: [PUBLIC] })]);
    await connect(page);
    await expect(page.locator('.note-card .timestamp')).toHaveAttribute(
      'aria-label',
      '서버에서 보기',
    );
    await expect(page.locator('.note-card')).not.toContainText('원문 보기');
  });

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    test(`at ${width} Escape anywhere in the conversation returns to the originating card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await server(page, [
        createNote(1, { content: '<p>첫 글</p>', to: [PUBLIC], published: '2026-09-01T00:00:00Z' }),
        createNote(2, {
          content: '<p>답글</p>',
          attributedTo: bob,
          inReplyTo: `${origin}/notes/1`,
          to: [PUBLIC],
          published: '2026-09-02T00:00:00Z',
        }),
      ]);
      await connect(page);
      const card = page.locator('#timeline article.note-card', {
        has: page.locator('.note-content', { hasText: '첫 글' }),
      });
      await card.focus();
      await page.keyboard.press('Enter');
      // Focus lands on the conversation heading, as it did; Escape there now works too. On
      // one column that heading is the page's h1 (`page-heading`), beside it the panel's h2.
      await expect(page.getByRole('heading', { name: '대화', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(card).toBeFocused();
      await expect(page.locator('.conversation')).toHaveCount(0);
      // From a control inside the thread, not only from a card.
      await card.focus();
      await page.keyboard.press('Enter');
      await page
        .locator('.conversation .thread-focus')
        .getByRole('button', { name: '저장', exact: true })
        .focus();
      await page.keyboard.press('Escape');
      await expect(card).toBeFocused();
      // Inside an open reply composer Escape keeps its own meaning: the composer closes,
      // the conversation stays.
      await card.focus();
      await page.keyboard.press('Enter');
      await page
        .locator('.conversation .thread-focus')
        .getByRole('button', { name: /답글 달기/ })
        .click();
      const textarea = page.locator('.conversation .inline-reply textarea');
      await expect(textarea).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('.conversation .inline-reply')).toHaveCount(0);
      await expect(page.locator('.conversation')).toBeVisible();
    });
  }

  test('on a phone the fifth tab writes; disconnecting lives in the account sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await server(
      page,
      Array.from({ length: 8 }, (_, i) =>
        createNote(i + 1, {
          content: `<p>글 ${i + 1}</p>`,
          to: [PUBLIC],
          published: `2026-09-0${(i % 8) + 1}T00:00:00Z`,
        }),
      ),
    );
    await connect(page);
    await expect(page.locator('#timeline article.note-card')).toHaveCount(8);
    const nav = page.locator('.main-nav');
    const compose = nav.getByRole('button', { name: '새 글 쓰기', exact: true });
    await expect(compose).toBeVisible();
    await expect(nav.getByRole('button', { name: '연결 해제', exact: true })).toHaveCount(0);
    const box = (await compose.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    // The word is visible on the tab, not only in its accessible name.
    await expect(compose.locator('span')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await compose.click();
    const textarea = page.locator('.main-composer textarea');
    await expect(textarea).toBeFocused();
    expect(
      await textarea.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }),
    ).toBe(true);
    // The account control opens a sheet that names the account and holds the exit.
    const account = page.locator('.page-header').getByRole('button', { name: /alice/ });
    const accountBox = (await account.boundingBox())!;
    expect(accountBox.height).toBeGreaterThanOrEqual(44);
    await account.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('alice');
    await sheet.getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  });

  test('the foot says how many activities it did not show in one quiet line, with the reasons behind 자세히', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>보이는 글</p>', to: [PUBLIC] }),
      {
        id: `${origin}/activities/9`,
        type: 'Create',
        actor,
        object: {
          id: `${origin}/notes/9`,
          type: 'Note',
          attributedTo: bob,
          content: '<p>남의 이름이 붙은 글</p>',
          published: '2026-09-05T00:00:00Z',
          to: [PUBLIC],
        },
      },
      { name: 'unsupported activity' },
      { name: 'another one' },
    ]);
    await connect(page);
    const status = page.locator('.feed-status');
    await expect(status).toContainText('표시하지 않은 활동 3개');
    await expect(status).toContainText('마지막 확인');
    await expect(status).not.toContainText('미지원');
    await expect(status).not.toContainText('거절');
    // Quiet: the same type step and colour as the rest of the foot, nothing bold.
    expect(
      await status.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.fontSize, style.fontWeight];
      }),
    ).toEqual(['13px', '400']);
    const dropped = page.locator('.feed-status-dropped');
    const refused = page.locator('.feed-status-refused');
    await expect(dropped).toBeHidden();
    await expect(refused).toBeHidden();
    await page.locator('.feed-foot').getByText('자세히', { exact: true }).click();
    await expect(dropped).toHaveText('미지원 활동 2개는 표시하지 못했어요');
    await expect(refused).toContainText('안전을 위해 거절한 활동 1개');
    await expect(refused).toContainText('미지원이 아니라');
  });

  test('a timeline with nothing withheld says nothing about it', async ({ page }) => {
    await server(page, [createNote(1, { content: '<p>문제 없는 글</p>', to: [PUBLIC] })]);
    await connect(page);
    await expect(page.locator('.feed-status')).toContainText('마지막 확인');
    await expect(page.locator('.feed-foot')).not.toContainText('표시하지 않은');
    await expect(page.locator('.feed-foot details')).toHaveCount(0);
  });

  for (const [width, height, shown] of [
    [1440, 900, 130],
    [390, 844, 170],
  ]) {
    test(`at ${width} the reminder leaves the first card within ${shown}px, and 130px once dismissed`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await server(page, [createNote(1, { content: '<p>첫 글</p>', to: [PUBLIC] })]);
      await connect(page);
      const hint = page.locator('.session-hint');
      await expect(hint).toBeVisible();
      await expect(hint).toContainText('새로고침하면 토큰을 다시 입력해야');
      const top = await firstCardTop(page);
      console.log(`first-card-top with hint at ${width}: ${top}px`);
      expect(top).toBeLessThanOrEqual(shown);
      // In the column's flow everywhere (round 14): one compact line on a phone, and never
      // fixed over a card or the list's foot.
      await expect(hint).toHaveCSS('position', /^(static|relative)$/);
      const box = (await hint.boundingBox())!;
      if (width <= 650) expect(box.height).toBeLessThanOrEqual(40);
      for (const other of ['.main-composer', '#timeline article.note-card']) {
        const target = (await page.locator(other).first().boundingBox())!;
        expect(overlaps(box, target), other).toBe(false);
      }
      await hint.getByRole('button', { name: '안내 닫기' }).click();
      await expect(hint).toHaveCount(0);
      const dismissed = await firstCardTop(page);
      console.log(`first-card-top without hint at ${width}: ${dismissed}px`);
      expect(dismissed).toBeLessThanOrEqual(130);
    });
  }

  test('삭제 is neutral at rest and red only when pointed at, and a pressed pill weighs no more than its neighbours', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await server(page, [
      createNote(1, { content: '<p>내 글</p>', to: [PUBLIC] }),
      {
        id: `${origin}/activities/2`,
        type: 'Like',
        actor,
        object: `${origin}/notes/1`,
        to: [PUBLIC],
      },
      {
        id: `${origin}/activities/3`,
        type: 'Announce',
        actor,
        object: {
          id: `${origin}/notes/1`,
          type: 'Note',
          attributedTo: actor,
          content: '<p>내 글</p>',
          to: [PUBLIC],
        },
        to: [PUBLIC],
      },
    ]);
    await connect(page);
    const card = page.locator('#timeline article.note-card').first();
    const style = (selector: string) =>
      card
        .locator(selector)
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return { color: s.color, size: s.fontSize, weight: s.fontWeight };
        });
    const edit = await style('.edit-button');
    const rest = await style('.delete-button');
    expect(rest.color).toBe(edit.color);
    await card.locator('.delete-button').hover();
    // Past the colour transition.
    await expect.poll(async () => (await style('.delete-button')).color).not.toBe(edit.color);
    await page.mouse.move(0, 0);
    const liked = await style('.like-button[aria-pressed="true"]');
    const shared = await style('.share-button[aria-pressed="true"]');
    const save = await style('.save-button');
    for (const pressed of [liked, shared]) {
      expect(pressed.size).toBe(save.size);
      expect(pressed.weight).toBe(save.weight);
    }
    // The state is still carried by more than hue: the outline stays.
    expect(
      await card.locator('.like-button').evaluate((el) => getComputedStyle(el).boxShadow),
    ).not.toBe('none');
  });

  test('the desktop right column is quiet until a reply arrives', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await server(page, [createNote(1, { content: '<p>혼자 쓴 글</p>', to: [PUBLIC] })]);
    await connect(page);
    const aside = page.locator('.context-column');
    await expect(aside.locator('.replies-peek-empty')).toBeVisible();
    await expect(aside.locator('.replies-peek-heading')).toHaveCount(0);
    await expect(aside.locator('.context-card')).toHaveCount(0);
    expect(
      await aside.locator('.replies-peek-empty').evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          size: s.fontSize,
          border: s.borderStyle,
          height: el.getBoundingClientRect().height,
        };
      }),
    ).toMatchObject({ size: '13px', border: 'none' });
    // With a reply to me, the list shows, with its heading.
    await page.unroute(`${origin}/**`);
    await server(page, [
      createNote(1, { content: '<p>혼자 쓴 글</p>', to: [PUBLIC] }),
      createNote(2, {
        content: '<p>답이요</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: '2026-09-09T00:00:00Z',
      }),
    ]);
    await page.getByRole('button', { name: '타임라인 새로고침' }).click();
    await expect(aside.locator('.replies-peek-heading')).toHaveText('받은 답글');
    await expect(aside.locator('.peek-item')).toContainText('답이요');
  });
});

test.describe('round 14: sheets own the keys, the phone bottom edge, the toast and the names', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  async function server(page: import('@playwright/test').Page, outbox: unknown[]) {
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                preferredUsername: 'alice',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : { type: 'OrderedCollection', orderedItems: url.endsWith('/inbox') ? [] : outbox },
      });
    });
  }

  test('list shortcuts stay quiet behind an open sheet: no composer behind the backdrop, no stacked dialog', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>글</p>', to: [PUBLIC] })]);
    await connect(page);
    const card = page.locator('#timeline article.note-card').first();
    await card.focus();
    await card.getByRole('button', { name: 'alice 정보 보기', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'alice' });
    await expect(sheet.getByRole('button', { name: '닫기' })).toBeFocused();
    // The sheet has the keyboard: `r` does not open a reply composer behind it, `?` does not
    // put a second dialog on top of it, and `l` does not send a Like.
    for (const key of ['r', '?', 'l', 'j', 's']) await page.keyboard.press(key);
    await expect(page.locator('.inline-reply')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('.conversation')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The shortcut list itself still closes on the key that opened it, and nothing else fires.
    await card.focus();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.locator('.inline-reply')).toHaveCount(0);
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).toBeFocused();
    // Closing the sheet with focus returned works as before, so the keys work again.
    await page.keyboard.press('r');
    await expect(page.locator('.inline-reply')).toHaveCount(1);
  });

  test('on a phone 맨 위로 sits above the tab bar, never on 새 글 쓰기', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await server(
      page,
      Array.from({ length: 30 }, (_, index) =>
        createNote(index + 1, {
          content: `<p>note ${index + 1}</p>`,
          to: [PUBLIC],
          published: at(index),
        }),
      ),
    );
    await connect(page);
    await expect(page.locator('#timeline article.note-card')).toHaveCount(30);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2 + 100));
    const toTop = page.locator('.to-top');
    await expect(toTop).toBeVisible();
    await toTop.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const compose = page.locator('.main-nav').getByRole('button', { name: '새 글 쓰기' });
    const tab = (await compose.boundingBox())!;
    const box = (await toTop.boundingBox())!;
    console.log(`to-top at 390: x ${box.x}-${box.x + box.width} y ${box.y}-${box.y + box.height}`);
    const nav = (await page.locator('.main-nav').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    // What a tap at the centre of the tab actually hits.
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.main-nav, .to-top')?.className,
      [tab.x + tab.width / 2, tab.y + tab.height / 2],
    );
    expect(hit).toContain('main-nav');
    await compose.click();
    await expect(page.locator('.main-composer textarea')).toBeFocused();
  });

  test('the sheet, the card and the account line all call a person by the same two labels', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await server(page, [
      createNote(1, { content: '<p>내 글</p>', to: [PUBLIC], published: at(0) }),
      createNote(2, {
        content: '<p>답</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: at(1),
      }),
    ]);
    await connect(page);
    const card = page.locator('#timeline article.note-card', {
      has: page.locator('.note-content', { hasText: '내 글' }),
    });
    await expect(card.locator('.author')).toHaveText('alice');
    await expect(card.locator('.author-handle')).toHaveText('@alice@social.example');
    // The desktop account line: the name, and the address as a muted second line.
    await expect(page.locator('.context-handle')).toHaveText('alice로 연결됨');
    await expect(page.locator('.context-address')).toHaveText('@alice@social.example');
    await card.getByRole('button', { name: 'alice 정보 보기', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'alice' });
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('alice');
    await expect(sheet.locator('.actor-handle')).toHaveText('@alice@social.example');
    await expect(sheet.locator('.actor-facts')).toContainText('social.example');
    await page.keyboard.press('Escape');
    // Someone known only by IRI: the same rule, the same two labels.
    const reply = page.locator('#timeline article.note-card').filter({ hasText: '답' }).first();
    await reply.getByRole('button', { name: 'bob 정보 보기', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'bob' }).locator('.actor-handle')).toHaveText(
      '@bob@social.example',
    );
  });

  test('a reply names whom it answers in its cue once the parent is loaded, on the card and in the thread', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, {
        content: '<p>가려진 글</p>',
        summary: '스포일러',
        sensitive: true,
        to: [PUBLIC],
        published: at(0),
      }),
      createNote(2, {
        content: '<p>가려진 답</p>',
        summary: '스포일러',
        sensitive: true,
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: at(1),
      }),
      createNote(3, {
        content: '<p>모르는 글에 단 답</p>',
        attributedTo: bob,
        inReplyTo: 'https://elsewhere.example/notes/9',
        to: [PUBLIC],
        published: at(2),
      }),
    ]);
    await connect(page);
    // The warned bodies are hidden, so the cards are found by their note IRIs.
    const cards = page.locator('#timeline article.note-card');
    const warned = page.locator(`#timeline article[data-note="${origin}/notes/2"]`);
    // A warned parent lends its warning to the cue, never the body it hides.
    await expect(warned.locator('.reply-context')).toHaveText('alice: 스포일러 · 원글 보기');
    await expect(warned.locator('.reply-context')).not.toContainText('가려진 글');
    // Not loaded: the marker alone, as a link to the server copy.
    const orphan = cards.filter({ hasText: '모르는 글' });
    await expect(orphan.locator('.reply-context')).toHaveText('원글 보기');
    await expect(orphan.locator('a.reply-context')).toHaveAttribute(
      'href',
      'https://elsewhere.example/notes/9',
    );
    // In the thread the reply sits right under the note it answers, so the cue that would
    // only point one card up is left off (round 19); the timeline card above keeps it.
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    await expect(page.locator('.conversation .thread-reply').first()).toBeVisible();
    await expect(
      page.locator('.conversation .thread-reply').first().locator('.reply-context'),
    ).toHaveCount(0);
    await expect(warned.locator('.reply-context')).toHaveText('alice: 스포일러 · 원글 보기');
  });

  test('the shortcut list returns focus to the heading when its opener has left the page', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>첫 글</p>', to: [PUBLIC], published: at(0) }),
      createNote(2, { content: '<p>둘째 글</p>', to: [PUBLIC], published: at(1) }),
    ]);
    await connect(page);
    const card = page.locator('#timeline article.note-card').filter({ hasText: '둘째 글' });
    await card.focus();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toBeVisible();
    // The card that opened the list is filtered out while it is open.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('.search-field input')!;
      input.value = '첫 글';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(card).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Focus lands on the page heading, not on `body`.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });
});

test.describe('round 15: the toast out of the way, the phone row, warned notes and the early shell', () => {
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  /** Alice's server; `hold` keeps the next outbox read open until the test releases it. */
  async function server(page: import('@playwright/test').Page, outbox: unknown[]) {
    const gate = { hold: undefined as Promise<void> | undefined };
    await page.route(`${origin}/**`, async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      if (url.endsWith('/outbox') && gate.hold) await gate.hold;
      await route.fulfill({
        json:
          url === actor
            ? {
                id: actor,
                type: 'Person',
                preferredUsername: 'alice',
                inbox: `${actor}/inbox`,
                outbox: `${actor}/outbox`,
                followers: `${actor}/followers`,
              }
            : { type: 'OrderedCollection', orderedItems: url.endsWith('/inbox') ? [] : outbox },
      });
    });
    return gate;
  }
  const notes = (count: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: count }, (_, index) =>
      createNote(index + 1, {
        content: `<p>note ${index + 1}</p>`,
        to: [PUBLIC],
        published: at(index),
        ...extra,
      }),
    );
  const warned = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      createNote(index + 1, {
        content: `<p>hidden body ${index + 1}</p>`,
        summary: `warning ${index + 1}`,
        sensitive: true,
        to: [PUBLIC],
        published: at(index),
      }),
    );
  const hitAt = (page: import('@playwright/test').Page, x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return {
          button: hit?.closest('button')?.textContent?.trim() ?? '',
          toast: !!hit?.closest('.toast-region'),
        };
      },
      [x, y],
    );

  test('the toast never takes a tap meant for an action under it, and on desktop it leaves the reading column', async ({
    page,
  }) => {
    await server(page, notes(8));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const cards = page.locator('#timeline article.note-card');
    await expect(cards).toHaveCount(8);
    await cards.first().getByRole('button', { name: /^저장/ }).click();
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const pill = (await toast.boundingBox())!;
    const main = (await page.locator('.main-column').boundingBox())!;
    console.log(
      `toast at 1440: x ${pill.x}-${pill.x + pill.width} y ${pill.y}, main right ${main.x + main.width}`,
    );
    // At the foot of the right column, wholly beside the reading column.
    expect(pill.x).toBeGreaterThanOrEqual(main.x + main.width);
    // Every action of the card the old pill used to stand over answers its own tap.
    for (const name of ['좋아요', '저장', '대화']) {
      const button = cards.nth(3).getByRole('button', { name: new RegExp(`^${name}`) });
      const box = (await button.boundingBox())!;
      expect(await hitAt(page, box.x + box.width / 2, box.y + box.height / 2)).toEqual({
        button: name,
        toast: false,
      });
    }
    await page.getByRole('button', { name: '알림 닫기' }).click();
    await expect(toast).toHaveCount(0);

    // A phone (round 17): the toast is a full-width strip directly above the tab bar, never
    // on it, so a tap at a tab during its three seconds reaches the tab; and every tap
    // passes through the strip itself. There is no close control on a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await cards.first().getByRole('button', { name: /^저장/ }).click();
    await expect(toast).toBeVisible();
    await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const band = (await page.locator('.toast-region').boundingBox())!;
    const tabs = (await page.locator('.main-nav').boundingBox())!;
    console.log(
      `toast strip at 390: x ${band.x}-${band.x + band.width} y ${band.y} h ${band.height}, tabs y ${tabs.y}`,
    );
    expect(band.x).toBe(0);
    expect(band.width).toBe(390);
    expect(Math.abs(band.y + band.height - tabs.y)).toBeLessThanOrEqual(1);
    expect(band.height).toBe(56);
    await expect(page.locator('.toast-region')).toHaveCSS('pointer-events', 'none');
    await expect(page.getByRole('button', { name: '알림 닫기' })).toHaveCount(0);
    // Scroll a card's action row under the strip: the control, not the strip, answers there.
    const like = cards.nth(2).getByRole('button', { name: /^좋아요/ });
    const likeBox = (await like.boundingBox())!;
    await page.evaluate(
      (delta) => window.scrollBy(0, delta),
      likeBox.y + likeBox.height / 2 - (band.y + band.height / 2),
    );
    const under = await hitAt(page, 8, band.y + band.height / 2);
    expect(under.toast).toBe(false);
    // A tab tapped while the toast stands navigates.
    const replies = page.locator('.main-nav').getByRole('button', { name: '받은 답글' });
    const tab = (await replies.boundingBox())!;
    expect(await hitAt(page, tab.x + tab.width / 2, tab.y + tab.height / 2)).toMatchObject({
      toast: false,
      button: '받은 답글',
    });
    await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('받은 답글');
    await page.locator('.main-nav').getByRole('button', { name: '타임라인' }).click();
    await expect(toast).toHaveCount(0, { timeout: 4500 });
    // Three seconds, not four.
    await page.evaluate(() => window.scrollTo(0, 0));
    await cards.first().getByRole('button', { name: /^저장/ }).click();
    await expect(toast).toBeVisible();
    const shownAt = Date.now();
    await expect(toast).toHaveCount(0, { timeout: 4500 });
    expect(Date.now() - shownAt).toBeLessThan(4000);
  });

  test('on a phone my own card folds 수정 and 삭제 behind 관리 at the end of one row', async ({
    page,
  }) => {
    await server(page, warned(3));
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    const card = page.locator('#timeline article.note-card').first();
    const row = card.locator('.note-actions');
    const manage = row.getByRole('button', { name: '내 글 관리: 수정, 삭제' });
    await expect(manage).toBeVisible();
    await expect(manage).toHaveAttribute('aria-expanded', 'false');
    await expect(row.locator('.edit-button')).toBeHidden();
    await expect(row.locator('.delete-button')).toBeHidden();
    // One row: the five plus 관리 share a line, and 관리 is the last of them.
    const boxes = await row.locator('button:visible').evaluateAll((items) =>
      items.map((el) => {
        const box = el.getBoundingClientRect();
        return { top: Math.round(box.top), width: Math.round(box.width) };
      }),
    );
    console.log(`own row at 390: ${boxes.map((box) => box.width).join('+')}px`);
    expect(boxes).toHaveLength(6);
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    for (const box of boxes) expect(box.width).toBeGreaterThanOrEqual(44);
    const manageBox = (await manage.boundingBox())!;
    expect(manageBox.height).toBeGreaterThanOrEqual(44);
    expect(manageBox.x + manageBox.width).toBeLessThanOrEqual(390);
    const closed = (await card.boundingBox())!.height;
    await manage.click();
    await expect(manage).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['내 글 수정하기', '내 글 삭제하기']) {
      const button = row.getByRole('button', { name });
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    const open = (await card.boundingBox())!.height;
    console.log(`own warned card at 390: ${closed}px folded, ${open}px with 관리 open`);
    expect(closed).toBeLessThan(open);
    // Escape closes it and hands focus back to 관리.
    await row.getByRole('button', { name: '내 글 수정하기' }).focus();
    await page.keyboard.press('Escape');
    await expect(manage).toHaveAttribute('aria-expanded', 'false');
    await expect(manage).toBeFocused();
    await expect(row.locator('.edit-button')).toBeHidden();
    // Deleting still takes its two steps, and cancelling comes back to 삭제.
    await manage.click();
    await row.getByRole('button', { name: '내 글 삭제하기' }).click();
    const confirm = page.locator('.delete-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: '삭제 취소' })).toBeFocused();
    await confirm.getByRole('button', { name: '삭제 취소' }).click();
    await expect(row.getByRole('button', { name: '내 글 삭제하기' })).toBeFocused();
    await expect(confirm).toHaveCount(0);
    // At 1280 the reading column is 504px wide and its card folds like the phone's (round
    // 19); from 1440 the column keeps both inline and never draws 관리.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(manage, '1280').toBeVisible();
    // 관리 was left open above, so 수정 stands in its own row under the six.
    await expect(row.locator('.note-manage-row'), '1280').toHaveAttribute('data-open', '');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(manage, '1440').toBeHidden();
    await expect(row.locator('.edit-button'), '1440').toBeVisible();
    await expect(row.locator('.delete-button'), '1440').toBeVisible();
  });

  test('경고 글 항상 펼치기 opens every warned note, one 접기 still closes one, and a reload keeps it', async ({
    page,
  }) => {
    await server(page, warned(3));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const bodies = page.locator('#timeline .content-warning + .note-content');
    await expect(page.locator('#timeline .content-warning')).toHaveCount(3);
    await expect(bodies).toHaveCount(0);
    const toggle = page.getByRole('switch', { name: '경고 글 항상 펼치기' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(bodies).toHaveCount(3);
    await expect(page.getByText('hidden body 2')).toBeVisible();
    // The per-note control now reads 접기 and closes this note alone.
    const second = page.locator('#timeline article.note-card').nth(1);
    await second.getByRole('button', { name: '접기' }).click();
    await expect(page.getByText('hidden body 2')).toBeHidden();
    await expect(bodies).toHaveCount(2);
    await expect(second.getByRole('button', { name: '내용 보기' })).toBeVisible();
    // A flag in this browser, nothing else.
    expect(await page.evaluate(() => localStorage.getItem('kimino.reveal-warned'))).toBe('1');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('hidden body');
    await page.reload();
    await connect(page);
    await expect(page.getByRole('switch', { name: '경고 글 항상 펼치기' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(bodies).toHaveCount(3);
    await page.getByRole('switch', { name: '경고 글 항상 펼치기' }).click();
    await expect(bodies).toHaveCount(0);
  });

  test('촘촘하게 sets a warned note as one line, not a box', async ({ page }) => {
    await server(page, warned(3));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const card = page.locator('#timeline article.note-card').first();
    const warning = card.locator('.content-warning');
    const heights = async () => ({
      card: (await card.boundingBox())!.height,
      warning: (await warning.boundingBox())!.height,
    });
    const comfortable = await heights();
    await page.getByRole('switch', { name: '촘촘하게' }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'compact');
    const compact = await heights();
    console.log(
      `warned card at 1440: comfortable ${comfortable.card}px (warning ${comfortable.warning}px), compact ${compact.card}px (warning ${compact.warning}px)`,
    );
    expect(compact.card).toBeLessThan(comfortable.card * 0.8);
    // One line: the label and 내용 보기 share their baseline row, and the box is gone.
    const label = (await warning.locator('.content-warning-label').boundingBox())!;
    const toggle = (await warning.getByRole('button', { name: '내용 보기' }).boundingBox())!;
    expect(Math.abs(label.y + label.height / 2 - (toggle.y + toggle.height / 2))).toBeLessThan(4);
    expect(compact.warning).toBeLessThanOrEqual(24);
    await expect(warning).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await warning.getByRole('button', { name: '내용 보기' }).click();
    // Newest first: the first card is the third note.
    await expect(card.getByText('hidden body 3')).toBeVisible();
  });

  test('a remembered tab draws its navigation and account line before the timeline arrives', async ({
    page,
  }) => {
    const gate = await server(page, notes(2));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page, true);
    await expect(page.getByText('note 1')).toBeVisible();
    await page.getByRole('button', { name: '내가 쓴 글', exact: true }).click();
    let release = () => {};
    gate.hold = new Promise<void>((resolve) => (release = resolve));
    await page.reload();
    // The shell, before any note: the list the tab was on, the account, the skeleton.
    const nav = page.locator('.main-nav');
    await expect(nav.getByRole('button', { name: '내가 쓴 글', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: '내가 쓴 글', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('.context-account')).toContainText('alice로 연결됨');
    await expect(page.locator('.skeleton-list')).toBeVisible();
    await expect(page.getByText('note 1')).toHaveCount(0);
    release();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('내가 쓴 글');
    await expect(page.getByText('note 1')).toBeVisible();
    await expect(page.locator('.context-account')).toContainText('alice로 연결됨');
  });

  test('a dialog whose opener was folded away hands focus to the page heading', async ({
    page,
  }) => {
    await server(page, notes(1));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    await page.getByRole('button', { name: '단축키' }).click();
    await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toBeVisible();
    // The phone layout hides the sidebar control that opened it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar-shortcuts')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.locator('#page-heading')).toBeFocused();
  });

  test('on a phone 맨 위로 is centred above the bar, and the thread heading is a heading', async ({
    page,
  }) => {
    await server(page, notes(30));
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    await expect(page.locator('#timeline article.note-card')).toHaveCount(30);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2 + 100));
    const toTop = page.locator('.to-top');
    await expect(toTop).toBeVisible();
    await toTop.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = (await toTop.boundingBox())!;
    console.log(`to-top at 390: x ${box.x}-${box.x + box.width}`);
    expect(Math.abs(box.x + box.width / 2 - 195)).toBeLessThanOrEqual(2);
    const compose = (await page
      .locator('.main-nav')
      .getByRole('button', { name: '새 글 쓰기' })
      .boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(compose.y);
    // Desktop: the panel's 대화 heading takes focus without dressing as a button.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .locator('#timeline article.note-card')
      .first()
      .getByRole('button', { name: /^대화/ })
      .click();
    const heading = page.locator('#conversation-heading');
    await expect(heading).toBeFocused();
    expect(
      await heading.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          outline: style.outlineStyle,
          border: style.borderStyle,
          bg: style.backgroundColor,
        };
      }),
    ).toEqual({ outline: 'none', border: 'none', bg: 'rgba(0, 0, 0, 0)' });
  });
});

test.describe('round 16: threads that read, one cursor, switches, the phone band and the remembered tab', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  /**
   * A server for any number of actors under `origin`: every actor IRI listed answers with a
   * Person document; `hold` keeps the next outbox read open until the test releases it.
   */
  async function server(
    page: import('@playwright/test').Page,
    outbox: unknown[],
    actors: Record<string, string> = { [actor]: 'alice' },
    inbox: unknown[] = [],
  ) {
    const gate = { hold: undefined as Promise<void> | undefined };
    for (const [id, username] of Object.entries(actors)) {
      const root = new URL(id).origin;
      await page.route(`${root}/**`, async (route) => {
        const url = route.request().url();
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            headers: {
              Location: `${origin}/activities/new`,
              'Access-Control-Expose-Headers': 'Location',
            },
          });
          return;
        }
        if (url.endsWith('/outbox') && gate.hold) await gate.hold;
        const person = Object.entries(actors).find(([candidate]) => candidate === url);
        // A stored object read back by IRI (the reader resolves a Like's target this way).
        const stored = [...outbox, ...inbox]
          .map((activity) => (activity as { object?: Record<string, unknown> }).object)
          .find((object) => object && typeof object === 'object' && object.id === url);
        await route.fulfill({
          json: person
            ? {
                id: url,
                type: 'Person',
                preferredUsername: person[1],
                inbox: `${url.replace(/\/$/, '')}/inbox`,
                outbox: `${url.replace(/\/$/, '')}/outbox`,
              }
            : (stored ?? {
                type: 'OrderedCollection',
                orderedItems: url.endsWith('/inbox') ? inbox : outbox,
              }),
        });
      });
    }
    return gate;
  }
  const notes = (count: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: count }, (_, index) =>
      createNote(index + 1, {
        content: `<p>note ${index + 1}</p>`,
        to: [PUBLIC],
        published: at(index),
        ...extra,
      }),
    );
  const tops = (row: import('@playwright/test').Locator) =>
    row
      .locator('button:visible')
      .evaluateAll((items) => items.map((el) => Math.round(el.getBoundingClientRect().top)));

  test('a remembered tab forgets its account once the restore settles, and never greets a root-hosted account by its host', async ({
    page,
  }) => {
    const root = 'https://root.example/';
    const gate = await server(page, notes(1), { [actor]: 'alice', [bob]: 'bob', [root]: 'Oni' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page, true);
    await expect(page.locator('.context-account')).toContainText('alice로 연결됨');
    await page.getByRole('button', { name: '연결 해제' }).click();
    await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
    // Another account connects in the same tab, with its timeline held: nothing on screen
    // may still say alice while bob's list loads.
    let release = () => {};
    gate.hold = new Promise<void>((resolve) => (release = resolve));
    await page.getByLabel('Actor URL').fill(bob);
    await page.getByLabel('액세스 토큰').fill('other-secret');
    await page.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(page.locator('.skeleton-list')).toBeVisible();
    await expect(page.locator('.context-account')).toHaveCount(0);
    await expect(page.locator('.main-nav')).toHaveCount(0);
    release();
    await expect(page.locator('.context-account')).toContainText('bob로 연결됨');
    await expect(page.locator('.context-account')).not.toContainText('alice');
    // An account that lives at its server root: its IRI carries no name, and the account
    // line says the tab is connecting rather than calling it by its host.
    await page.getByRole('button', { name: '연결 해제' }).click();
    await page.getByLabel('Actor URL').fill(root);
    await page.getByLabel('액세스 토큰').fill('root-secret');
    await page.getByLabel(/새로고침해도 이 탭에서 유지/).check();
    await page.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(page.locator('.context-account')).toContainText('Oni로 연결됨');
    gate.hold = new Promise<void>((resolve) => (release = resolve));
    await page.reload();
    await expect(page.locator('.skeleton-list')).toBeVisible();
    await expect(page.locator('.context-account')).toContainText('연결 중…');
    await expect(page.locator('.context-account')).not.toContainText('root.example로');
    await expect(page.locator('.context-address')).toHaveCount(0);
    release();
    await expect(page.locator('.context-account')).toContainText('Oni로 연결됨');
    await expect(page.locator('.context-address')).toHaveText('@Oni@root.example');
  });

  test('a reply cue quotes the parent by author and first words, a self-reply reads 이어서, and cues differ in the panel', async ({
    page,
  }) => {
    const long = '가나다라마바사아자차카타파하'.repeat(4);
    await server(page, [
      createNote(1, { content: '<p>original words here</p>', to: [PUBLIC], published: at(0) }),
      createNote(2, {
        content: '<p>answer from bob</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: at(1),
      }),
      createNote(3, {
        content: '<p>my own follow-up</p>',
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: at(2),
      }),
      createNote(4, { content: `<p>${long}</p>`, to: [PUBLIC], published: at(3) }),
      createNote(5, {
        content: '<p>answer to the long one</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/4`,
        to: [PUBLIC],
        published: at(4),
      }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const card = (id: number) =>
      page.locator(`#timeline article[data-note="${origin}/notes/${id}"]`);
    await expect(card(2).locator('.reply-context')).toHaveText(
      'alice: original words here · 원글 보기',
    );
    await expect(card(3).locator('.reply-context')).toHaveText('이어서 · 원글 보기');
    // Forty characters, then an ellipsis.
    await expect(card(5).locator('.reply-context')).toHaveText(
      `alice: ${long.slice(0, 40)}… · 원글 보기`,
    );
    // In the panel bob's reply sits right under the note it answers and carries no cue
    // (round 19); my follow-up, one card further down, still says which note it continues.
    await card(1).getByRole('button', { name: /^대화/ }).click();
    const cues = page.locator('.context-column .conversation .thread-reply .reply-context');
    await expect(cues).toHaveText(['이어서 · 원글 보기']);
  });

  test('a one-person timeline leaves out the 내 글 badge and the handle until someone else writes', async ({
    page,
  }) => {
    await server(page, notes(3));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const cards = page.locator('#timeline article.note-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('.own-badge')).toHaveCount(0);
    await expect(cards.locator('.author-handle')).toHaveCount(0);
    await expect(cards.first().locator('.author')).toHaveText('alice');
    // A second author brings both marks back on every own card, so the two can be told apart.
    await page.getByRole('button', { name: '연결 해제' }).click();
    await server(page, [
      ...notes(2),
      createNote(3, {
        content: '<p>from bob</p>',
        attributedTo: bob,
        to: [PUBLIC],
        published: at(2),
      }),
    ]);
    await connect(page);
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('.own-badge')).toHaveCount(2);
    await expect(cards.locator('.author-handle')).toHaveCount(3);
  });

  test('in a conversation the focus outline is the only current mark: the opened-from note keeps its type, not a bar', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>root note</p>', to: [PUBLIC], published: at(0) }),
      createNote(2, {
        content: '<p>the reply</p>',
        attributedTo: bob,
        inReplyTo: `${origin}/notes/1`,
        to: [PUBLIC],
        published: at(1),
      }),
      createNote(3, {
        content: '<p>a deeper reply</p>',
        inReplyTo: `${origin}/notes/2`,
        to: [PUBLIC],
        published: at(2),
      }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/2"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    await expect(page.locator('#conversation-heading')).toBeFocused();
    const opened = page.locator('.conversation .thread-focus .note-card');
    const ancestor = page.locator('.conversation .thread-ancestor .note-card');
    const style = (target: import('@playwright/test').Locator) =>
      target.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bar: s.borderLeftWidth,
          size: parseFloat(getComputedStyle(el.querySelector('.note-content')!).fontSize),
        };
      });
    const before = await style(opened);
    expect(before.bar).toBe('0px');
    expect(before.size).toBeGreaterThan((await style(ancestor)).size);
    await page.keyboard.press('j');
    await expect(ancestor).toBeFocused();
    // One mark: the ring on the ancestor; the opened-from card carries nothing of its own.
    await expect(page.locator('.conversation .note-card:focus')).toHaveCount(1);
    expect(await style(opened)).toEqual(before);
    await page.keyboard.press('j');
    await expect(opened).toBeFocused();
    await expect(page.locator('.conversation .note-card:focus')).toHaveCount(1);
    await page.keyboard.press('j');
    await expect(page.locator('.conversation .thread-reply .note-card')).toBeFocused();
    expect(await style(opened)).toEqual(before);
  });

  test('a reload brings back the open conversation while its note is loaded, and nothing after it was closed', async ({
    page,
  }) => {
    await server(page, notes(3));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page, true);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/2"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const panel = page.locator('.context-column .conversation');
    await expect(panel.locator('.thread-focus')).toContainText('note 2');
    expect(await page.evaluate(() => sessionStorage.getItem('kimino.session'))).toContain(
      '"thread":"https://social.example/notes/2"',
    );
    await page.reload();
    await expect(page.getByText('note 1')).toBeVisible();
    await expect(panel.locator('.thread-focus')).toContainText('note 2');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('타임라인');
    await page.getByRole('button', { name: '목록으로 돌아가기' }).click();
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('kimino.session'))).not.toContain(
      '"thread"',
    );
    await page.reload();
    await expect(page.getByText('note 1')).toBeVisible();
    await expect(panel).toHaveCount(0);
    // A note that left the timeline meanwhile is not asked for: no conversation, no alert.
    await page
      .locator(`#timeline article[data-note="${origin}/notes/3"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    await expect(panel.locator('.thread-focus')).toContainText('note 3');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await server(page, notes(2));
    await page.reload();
    await expect(page.getByText('note 1')).toBeVisible();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('.missing-parent')).toHaveCount(0);
  });

  test('촘촘하게 and 경고 글 항상 펼치기 are switches with a track and a knob, not filled pills', async ({
    page,
  }) => {
    await server(page, notes(1));
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const density = page.getByRole('switch', { name: '촘촘하게' });
    const reveal = page.getByRole('switch', { name: '경고 글 항상 펼치기' });
    await expect(density).toHaveAttribute('aria-checked', 'false');
    await expect(reveal).toHaveAttribute('aria-checked', 'false');
    const measure = (target: import('@playwright/test').Locator) =>
      target.evaluate((el) => {
        const track = el.querySelector('.switch-track')!.getBoundingClientRect();
        const knob = el.querySelector('.switch-knob')!;
        return {
          height: Math.round(el.getBoundingClientRect().height),
          track: { width: Math.round(track.width), height: Math.round(track.height) },
          knob: Math.round(knob.getBoundingClientRect().width),
          shift: getComputedStyle(knob).transform,
          background: getComputedStyle(el).backgroundColor,
        };
      });
    const off = await measure(density);
    console.log(`switch at 1440: ${JSON.stringify(off)}`);
    expect(off.height).toBeGreaterThanOrEqual(36);
    expect((await measure(reveal)).height).toBeGreaterThanOrEqual(36);
    expect(off.track).toEqual({ width: 32, height: 16 });
    expect(off.knob).toBe(12);
    expect(off.shift).toBe('none');
    await density.click();
    await expect(density).toHaveAttribute('aria-checked', 'true');
    // Measured once the knob's short transition has run.
    await expect.poll(async () => (await measure(density)).shift).toBe('matrix(1, 0, 0, 1, 16, 0)');
    const on = await measure(density);
    // On, it is not drawn like the current list: no fill behind the row.
    const active = page.locator('.main-nav .nav-item.active');
    expect(on.background).toBe('rgba(0, 0, 0, 0)');
    expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      on.background,
    );
    await reveal.click();
    await expect(reveal).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('kimino.reveal-warned'))).toBe('1');
    // 촘촘하게 is on now, and the compact desktop target is 32px, as every control's is.
    expect((await measure(reveal)).height).toBeGreaterThanOrEqual(32);
  });

  test('the toast shows once per notice across the desktop breakpoint and never over the end of a long thread', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>root of a long thread</p>', to: [PUBLIC], published: at(0) }),
      ...Array.from({ length: 14 }, (_, index) =>
        createNote(index + 2, {
          content: `<p>reply ${index + 1} in a thread long enough to scroll the right column</p>`,
          attributedTo: bob,
          inReplyTo: `${origin}/notes/1`,
          to: [PUBLIC],
          published: at(index + 1),
        }),
      ),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const root = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await root.getByRole('button', { name: /^대화/ }).click();
    const panelCards = page.locator('.context-column .conversation .note-card');
    await expect(panelCards).toHaveCount(15);
    await root.getByRole('button', { name: /^저장/ }).click();
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await toast.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    // Round 17: it sticks to the bottom of the column's own scrollport, so under a long
    // thread it is on screen, lets every pointer through, and the column keeps room under
    // its last card so that card's actions are never beneath it at the end of the scroll.
    const region = page.locator('.context-column .toast-region');
    await expect(region).toHaveCSS('position', 'sticky');
    await expect(region).toHaveCSS('pointer-events', 'none');
    const pill = (await toast.boundingBox())!;
    console.log(`toast under a long thread: pill y ${pill.y}-${pill.y + pill.height}`);
    expect(pill.y + pill.height).toBeLessThanOrEqual(900);
    expect(pill.y).toBeGreaterThan(0);
    const column = page.locator('.context-column');
    await column.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const lastRow = (await panelCards.last().locator('.note-actions').boundingBox())!;
    const pillAtEnd = (await toast.boundingBox())!;
    console.log(
      `scrolled to the end: last row y ${lastRow.y}-${lastRow.y + lastRow.height}, pill y ${pillAtEnd.y}`,
    );
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(pillAtEnd.y + 1);
    const overlapped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.conversation .note-actions button')).some((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !!hit?.closest('.toast-region');
      }),
    );
    expect(overlapped).toBe(false);
    await column.evaluate((el) => el.scrollTo(0, 0));
    await page.getByRole('button', { name: '알림 닫기' }).click();
    await expect(toast).toHaveCount(0);
    // Crossing the desktop width mounts the other copy of the toast: it must not replay.
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('');
  });

  test('at 390 my own row keeps six controls on one line with two-digit counts', async ({
    page,
  }) => {
    const likers = Array.from({ length: 12 }, (_, index) => `${origin}/users/fan${index}`);
    // Other people's reactions and replies arrive in the inbox; my note is in the outbox.
    await server(
      page,
      [createNote(1, { content: '<p>popular note</p>', to: [PUBLIC], published: at(0) })],
      { [actor]: 'alice' },
      [
        ...likers.map((who, index) => ({
          id: `${origin}/activities/like${index}`,
          type: 'Like',
          actor: who,
          object: `${origin}/notes/1`,
          to: [PUBLIC],
        })),
        ...likers.map((who, index) => ({
          id: `${origin}/activities/share${index}`,
          type: 'Announce',
          actor: who,
          object: `${origin}/notes/1`,
          to: [PUBLIC],
        })),
        ...Array.from({ length: 12 }, (_, index) =>
          createNote(index + 2, {
            content: `<p>reply ${index + 1}</p>`,
            attributedTo: bob,
            inReplyTo: `${origin}/notes/1`,
            to: [PUBLIC],
            published: at(index + 1),
          }),
        ),
      ],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    const card = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await card.scrollIntoViewIfNeeded();
    const row = card.locator('.note-actions');
    const like = row.getByRole('button', { name: '좋아요 12' });
    const share = row.getByRole('button', { name: '공유 12' });
    await expect(like).toBeVisible();
    await expect(share).toBeVisible();
    await expect(row.getByRole('button', { name: /^대화/ })).toContainText('12');
    const manage = row.getByRole('button', { name: '내 글 관리: 수정, 삭제' });
    await expect(manage).toBeVisible();
    const boxes = await row.locator('button:visible').evaluateAll((items) =>
      items.map((el) => {
        const box = el.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          width: Math.round(box.width),
          right: Math.round(box.right),
          height: Math.round(box.height),
        };
      }),
    );
    console.log(`own row with counts of 12 at 390: ${boxes.map((box) => box.width).join('+')}px`);
    expect(boxes).toHaveLength(6);
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.right).toBeLessThanOrEqual(390);
    }
    // The counted reactions keep their icon and number and fold the word; the name keeps it.
    await expect(like.locator('.count')).toHaveText('12');
    await expect(like.locator('.action-label')).not.toBeInViewport();
    await expect(share.locator('.count')).toHaveText('12');
    // 대화 with a count folds its word too (round 18); the name keeps it.
    await expect(row.getByRole('button', { name: '대화 12' }).locator('.count')).toHaveText('12');
    await expect(
      row.getByRole('button', { name: '대화 12' }).locator('.action-label'),
    ).not.toBeInViewport();
    // Everyone else's word stays on screen.
    for (const name of ['답글', '저장', '관리']) {
      await expect(
        row
          .getByRole('button', { name: new RegExp(`^${name}|${name}`) })
          .locator('.action-label')
          .first(),
      ).toBeVisible();
    }
  });

  test('Escape keeps 관리 open while the delete confirmation it opened is still on screen', async ({
    page,
  }) => {
    await server(page, notes(1));
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    const card = page.locator('#timeline article.note-card').first();
    const row = card.locator('.note-actions');
    const manage = row.getByRole('button', { name: '내 글 관리: 수정, 삭제' });
    await manage.click();
    const remove = row.getByRole('button', { name: '내 글 삭제하기' });
    await remove.click();
    const confirm = page.locator('.delete-confirm');
    await expect(confirm).toBeVisible();
    await expect(remove).toHaveAttribute('aria-expanded', 'true');
    // Escape on the control itself, while its confirmation is open, backs out one level:
    // the confirmation closes, 삭제 keeps focus, and the 관리 group stays open.
    await remove.focus();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(manage).toHaveAttribute('aria-expanded', 'true');
    await expect(remove).toBeFocused();
    await expect(remove).toBeVisible();
    // Reopen and cancel from inside the confirmation: same landing.
    await remove.click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '삭제 취소' }).focus();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
    await expect(remove).toBeVisible();
    // Now Escape folds the group, as before.
    await page.keyboard.press('Escape');
    await expect(manage).toHaveAttribute('aria-expanded', 'false');
    await expect(manage).toBeFocused();
    await expect(remove).toBeHidden();
  });
});

test.describe('round 17: one voice, a parent that is gone, the card as its own column, the strip', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  /**
   * Alice's server with bob as a second person: a Delete leaves a Tombstone inside the
   * note's Create and answers 410, as the real fixture does; `hold` keeps the next outbox
   * read open until released.
   */
  async function server(
    page: import('@playwright/test').Page,
    outbox: Record<string, unknown>[],
    inbox: Record<string, unknown>[] = [],
  ) {
    const gate = { hold: undefined as Promise<void> | undefined };
    const bodies: Record<string, unknown>[] = [];
    const objectOf = (activity: Record<string, unknown>) =>
      activity.object as Record<string, unknown> | undefined;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = request.url();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        bodies.push(body);
        if (body.type === 'Delete') {
          for (const activity of outbox)
            if (objectOf(activity)?.id === body.object)
              activity.object = { id: body.object, type: 'Tombstone', formerType: 'Note' };
          await route.fulfill({
            status: 410,
            headers: {
              Location: `${origin}/activities/gone`,
              'Access-Control-Expose-Headers': 'Location',
            },
          });
          return;
        }
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      if (url.endsWith('/outbox') && gate.hold) await gate.hold;
      const person = url === actor ? 'alice' : url === bob ? 'bob' : undefined;
      const stored = [...outbox, ...inbox].map(objectOf).find((object) => object?.id === url);
      await route.fulfill({
        json: person
          ? {
              id: url,
              type: 'Person',
              preferredUsername: person,
              inbox: `${url}/inbox`,
              outbox: `${url}/outbox`,
              followers: `${url}/followers`,
            }
          : (stored ?? {
              type: 'OrderedCollection',
              orderedItems: url.endsWith('/inbox') ? inbox : outbox,
            }),
      });
    });
    return { gate, bodies };
  }
  const reaction = (type: 'Like' | 'Announce', note: number, index: number) => ({
    id: `${origin}/activities/${type.toLowerCase()}-${note}-${index}`,
    type,
    actor: `${origin}/users/fan${index}`,
    object: `${origin}/notes/${note}`,
    to: [PUBLIC],
  });
  const dozen = (note: number) => [
    ...Array.from({ length: 12 }, (_, index) => reaction('Like', note, index)),
    ...Array.from({ length: 12 }, (_, index) => reaction('Announce', note, index)),
  ];

  test('every toast and every line speaks in one register', async ({ page }) => {
    await server(page, [createNote(1, { content: '<p>한 목소리</p>', to: [PUBLIC] })]);
    await connect(page);
    await page.getByLabel('새 글').fill('새 글이에요');
    await page.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('게시됐어요.');
    await page.getByRole('button', { name: '저장한 글', exact: true }).click();
    await expect(page.locator('.scope-note')).toHaveText(
      '글 링크만 이 브라우저에 저장해요. 서버나 다른 기기에는 동기화되지 않아요.',
    );
    // Nothing on the page ends in 합쇼체: -니다, -니까, -십시오 (the same rule as copy.test).
    expect(await page.locator('.app-shell').innerText()).not.toMatch(
      /[가-힣](?<!아)니다(?=[\s.!?,'"`)]|$)|니까[.?]|십시오(?=[\s.!?,'"`)]|$)/,
    );
  });

  test('after its parent is deleted a reply says so, with no link to the 410', async ({ page }) => {
    const { bodies } = await server(
      page,
      [createNote(1, { content: '<p>지울 원글</p>', to: [PUBLIC], published: at(0) })],
      [
        createNote(2, {
          content: '<p>남는 답글</p>',
          attributedTo: bob,
          inReplyTo: `${origin}/notes/1`,
          to: [PUBLIC],
          published: at(1),
        }),
        createNote(3, {
          content: '<p>모르는 글에 단 답</p>',
          attributedTo: bob,
          inReplyTo: 'https://elsewhere.example/notes/9',
          to: [PUBLIC],
          published: at(2),
        }),
      ],
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await connect(page);
    const reply = page.locator(`#timeline article[data-note="${origin}/notes/2"]`);
    await expect(reply.locator('.reply-context')).toHaveText('alice: 지울 원글 · 원글 보기');
    const root = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await openManage(root);
    await root.getByRole('button', { name: '내 글 삭제하기' }).click();
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('내 서버에서 글을 지웠어요');
    await expect(root).toHaveCount(0);
    expect(bodies).toHaveLength(1);
    // The reply's cue now says the parent is gone, and nothing links to the deleted note.
    await expect(reply.locator('.reply-context')).toHaveText('원글이 삭제됐어요');
    await expect(reply.locator('a.reply-context')).toHaveCount(0);
    await expect(page.locator(`a[href="${origin}/notes/1"]`)).toHaveCount(0);
    // A parent the client never saw keeps its link to the server copy.
    const orphan = page.locator(`#timeline article[data-note="${origin}/notes/3"]`);
    await expect(orphan.locator('a.reply-context')).toHaveText('원글 보기');
    // After a reload the tombstone in the outbox says the same thing.
    await page.reload();
    await connect(page);
    await expect(reply.locator('.reply-context')).toHaveText('원글이 삭제됐어요');
    await expect(page.locator(`a[href="${origin}/notes/1"]`)).toHaveCount(0);
  });

  test('the edit composer names its key by what the button does and keeps the marker rule behind a disclosure', async ({
    page,
  }) => {
    await server(page, [createNote(1, { content: '<p>고칠 글</p>', to: [PUBLIC] })]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await connect(page);
    // The main composer: publish, with no marker note at all.
    await expect(page.locator('.main-composer .draft-hint')).toContainText('Enter로 게시');
    await expect(page.locator('.main-composer .edit-marker-hint')).toHaveCount(0);
    const card = page.locator('article.note-card').first();
    await openManage(card);
    await card.getByRole('button', { name: '내 글 수정하기' }).click();
    const form = page.locator('.inline-edit');
    await expect(form.getByRole('button', { name: '수정하기', exact: true })).toBeVisible();
    await expect(form.locator('.draft-hint')).toContainText('Ctrl / ⌘ + Enter로 수정 · Esc로 닫기');
    await expect(form.locator('.draft-hint')).not.toContainText('게시');
    // An edit starts full: it carries no "지금, 어떤 생각을 하고 있나요?" (round 18).
    await expect(form.getByLabel('글 수정')).not.toHaveAttribute('placeholder', /./);
    await expect(form.locator('.compose-scope--fixed')).toHaveText(
      '공개 그대로 · 본문과 경고 문구만 바꿔요',
    );
    // The "수정됨" rule waits behind one short line and opens on request.
    const disclosure = form.locator('.edit-marker-hint');
    await expect(disclosure.locator('summary')).toHaveText('수정 표시에 대해');
    await expect(disclosure.locator('p')).toBeHidden();
    await expect(form.locator('.visibility')).toHaveCount(0);
    await disclosure.locator('summary').click();
    await expect(disclosure.locator('p')).toBeVisible();
    await expect(disclosure.locator('p')).toContainText('"수정됨" 표시는');
  });

  test('on a phone a nested reply that continues its own author reads 이어서, and "…에게" otherwise', async ({
    page,
  }) => {
    const chain = (id: number, parent: number, who: string) =>
      createNote(id, {
        content: `<p>reply ${id}</p>`,
        attributedTo: who,
        inReplyTo: `${origin}/notes/${parent}`,
        to: [PUBLIC],
        published: at(id),
      });
    await server(
      page,
      [
        createNote(1, { content: '<p>root</p>', to: [PUBLIC], published: at(0) }),
        chain(2, 1, actor),
        chain(3, 2, actor),
        chain(4, 3, actor),
        chain(5, 4, actor),
        chain(7, 6, actor),
      ],
      [chain(6, 5, bob)],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const cue = (id: number) =>
      page.locator(
        `.conversation .thread-reply:has(article[data-note="${origin}/notes/${id}"]) > .reply-cue`,
      );
    // Depth 3 on a phone draws the cue: alice's reply 5 continues alice's reply 4.
    await expect(cue(4)).toBeHidden();
    await expect(cue(5)).toBeVisible();
    await expect(cue(5)).toHaveText('이어서');
    // bob answering alice, and alice answering bob, are addressed by name.
    await expect(cue(6)).toHaveText('alice에게');
    await expect(cue(7)).toHaveText('bob에게');
    await expect(page.locator('.conversation')).not.toContainText('alice에게 이어서');
  });

  test('j is next, the right column foot speaks Korean, and the dot lights only once connected', async ({
    page,
  }) => {
    const { gate } = await server(page, [
      createNote(1, { content: '<p>note 1</p>', to: [PUBLIC], published: at(0) }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page, true);
    await expect(page.getByText('note 1')).toBeVisible();
    await page.keyboard.press('?');
    const row = page
      .locator('.shortcut-row')
      .filter({ has: page.locator('kbd', { hasText: /^j$/ }) });
    await expect(row.locator('kbd')).toHaveText(['j', 'k']);
    await expect(row.locator('dd')).toHaveText('다음 / 이전 글로 이동');
    await page.keyboard.press('Escape');
    // One tagline: the foot of the right column repeats the sidebar's, with no English line.
    const foot = page.locator('.site-footer');
    await expect(foot).toHaveText(`Kimino · ${await page.locator('.brand-caption').innerText()}`);
    expect(await foot.innerText()).not.toMatch(/[A-Z]{2,}/);
    // The lit dot, next to the connected account.
    const dot = page.locator('.context-account .connection-dot');
    const lit = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    // A remembered tab reconnecting: the account line is drawn from the remembered IRI
    // before anything answers, and the dot stays unlit until the actor is loaded.
    let release = () => {};
    gate.hold = new Promise<void>((resolve) => (release = resolve));
    await page.reload();
    await expect(page.locator('.skeleton-list')).toBeVisible();
    await expect(dot).toHaveClass(/connection-dot--pending/);
    expect(await dot.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(lit);
    release();
    await expect(page.locator('.context-account')).toContainText('alice로 연결됨');
    await expect(dot).not.toHaveClass(/connection-dot--pending/);
    expect(await dot.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(lit);
  });

  test('a card folds its row by its own width: six controls with two-digit counts fit at 390 at depth 0 and 2, and at depth 3 in the 1440 panel', async ({
    page,
  }) => {
    const mine = (id: number, parent: number) =>
      createNote(id, {
        content: `<p>mine ${id}</p>`,
        inReplyTo: `${origin}/notes/${parent}`,
        to: [PUBLIC],
        published: at(id),
      });
    await server(
      page,
      [
        createNote(1, { content: '<p>root</p>', to: [PUBLIC], published: at(0) }),
        mine(2, 1),
        mine(3, 2),
        mine(4, 3),
        mine(5, 4),
      ],
      [
        ...dozen(1),
        ...dozen(4),
        ...dozen(5),
        ...Array.from({ length: 12 }, (_, index) =>
          createNote(10 + index, {
            content: `<p>bob ${index}</p>`,
            attributedTo: bob,
            inReplyTo: `${origin}/notes/5`,
            to: [PUBLIC],
            published: at(10 + index),
          }),
        ),
      ],
    );
    const oneRow = async (
      row: import('@playwright/test').Locator,
      where: string,
      edge: number,
      count = 6,
    ) => {
      const boxes = await boxesOf(row);
      // The target size the column promises: 44px on the phone, --tap on a fine pointer.
      const tap = await row.evaluate((el) =>
        parseFloat(getComputedStyle(el).getPropertyValue('--tap')),
      );
      console.log(`${where}: ${boxes.map((box) => box.width).join('+')}px (tap ${tap})`);
      expect(boxes, where).toHaveLength(count);
      expect(new Set(boxes.map((box) => box.top)).size, `${where} rows`).toBe(1);
      for (const box of boxes) {
        expect(box.width, where).toBeGreaterThanOrEqual(tap);
        expect(box.height, where).toBeGreaterThanOrEqual(tap);
        expect(box.right, where).toBeLessThanOrEqual(edge);
      }
      expect(
        await row.evaluate((el) => el.scrollWidth - el.clientWidth),
        where,
      ).toBeLessThanOrEqual(1);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    const root = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await root.scrollIntoViewIfNeeded();
    await expect(root.getByRole('button', { name: '좋아요 12' })).toBeVisible();
    await expect(root.getByRole('button', { name: /^대화/ })).toContainText('16');
    await oneRow(root.locator('.note-actions'), 'timeline at 390, depth 0', 390);
    // With a count 대화 folds its word like the counted reactions (round 18): six with
    // 12/12/16 measured 322px against a 318px row with the word on.
    await expect(root.locator('.thread-button .action-label')).not.toBeInViewport();
    await expect(root.locator('.thread-button .count')).toBeInViewport();
    await root.getByRole('button', { name: /^대화/ }).click();
    const deep = page.locator(`.conversation article[data-note="${origin}/notes/4"]`);
    await expect(deep.getByRole('button', { name: '좋아요 12' })).toBeVisible();
    await expect(deep.getByRole('button', { name: '대화 13' })).toBeVisible();
    // Two levels deep my own 저장 has folded into the 관리 row (round 18): five on the line.
    await oneRow(deep.locator('.note-actions'), 'thread at 390, depth 2', 390, 5);
    await expect(deep.locator('.note-actions > .save-button')).toBeHidden();
    // Every card is inside the viewport, indent and all.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '목록으로 돌아가기' }).click();
    // The 1440 panel: the reply three levels deep still keeps its six on one line.
    await page.setViewportSize({ width: 1440, height: 900 });
    await root.getByRole('button', { name: /^대화/ }).click();
    const panel = page.locator('.context-column .thread-panel');
    const deepest = panel.locator(`article[data-note="${origin}/notes/5"]`);
    await expect(deepest).toBeVisible();
    await expect(deepest.getByRole('button', { name: '대화 12' })).toBeVisible();
    const panelBox = (await panel.boundingBox())!;
    // Three deep in the panel the card is 342px: 저장 folds into the 관리 row here too.
    await oneRow(
      deepest.locator('.note-actions'),
      'panel at 1440, depth 3',
      panelBox.x + panelBox.width + 1,
      5,
    );
    // The column itself is still a container: the visibility picker folds by the column.
    await expect(page.locator('.main-column')).toHaveCSS('container-name', 'column');
    await expect(root).toHaveCSS('container-name', 'card');
  });
});

test.describe('round 18: shortcuts from a control, a parent that is gone, the 관리 row, the search and the dots', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  /** Alice's server with bob: a Delete leaves a Tombstone in the note's Create and answers 410. */
  async function server(
    page: import('@playwright/test').Page,
    outbox: Record<string, unknown>[],
    inbox: Record<string, unknown>[] = [],
  ) {
    const objectOf = (activity: Record<string, unknown>) =>
      activity.object as Record<string, unknown> | undefined;
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = request.url();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (body.type === 'Delete') {
          for (const activity of outbox)
            if (objectOf(activity)?.id === body.object)
              activity.object = { id: body.object, type: 'Tombstone', formerType: 'Note' };
          await route.fulfill({
            status: 410,
            headers: {
              Location: `${origin}/activities/gone`,
              'Access-Control-Expose-Headers': 'Location',
            },
          });
          return;
        }
        await route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/new`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
        return;
      }
      const person = url === actor ? 'alice' : url === bob ? 'bob' : undefined;
      const stored = [...outbox, ...inbox].map(objectOf).find((object) => object?.id === url);
      await route.fulfill({
        json: person
          ? {
              id: url,
              type: 'Person',
              preferredUsername: person,
              inbox: `${url}/inbox`,
              outbox: `${url}/outbox`,
            }
          : (stored ?? {
              type: 'OrderedCollection',
              orderedItems: url.endsWith('/inbox') ? inbox : outbox,
            }),
      });
    });
  }
  const mine = (id: number, parent: number) =>
    createNote(id, {
      content: `<p>mine ${id}</p>`,
      inReplyTo: `${origin}/notes/${parent}`,
      to: [PUBLIC],
      published: at(id),
    });
  const bobs = (id: number, parent: number) =>
    createNote(id, {
      content: `<p>bob ${id}</p>`,
      attributedTo: bob,
      inReplyTo: `${origin}/notes/${parent}`,
      to: [PUBLIC],
      published: at(id),
    });

  test('after r and Escape the shortcuts still work from the reply button: j moves on, Escape leaves', async ({
    page,
  }) => {
    await server(page, [
      createNote(1, { content: '<p>first</p>', to: [PUBLIC], published: at(0) }),
      createNote(2, { content: '<p>second</p>', to: [PUBLIC], published: at(1) }),
      createNote(3, { content: '<p>third</p>', to: [PUBLIC], published: at(2) }),
      mine(4, 3),
    ]);
    await page.setViewportSize({ width: 1000, height: 900 });
    await connect(page);
    const cards = page.locator('#timeline article.note-card');
    await expect(cards).toHaveCount(4);
    await page.keyboard.press('j');
    await expect(cards.nth(0)).toBeFocused();
    await page.keyboard.press('r');
    await expect(page.getByLabel('답글 내용')).toBeFocused();
    await page.keyboard.press('Escape');
    // The composer closed and put focus on the reply button of the same card.
    const replyButton = cards.nth(0).getByRole('button', { name: /에게 답글 달기/ });
    await expect(replyButton).toBeFocused();
    await expect(page.getByLabel('답글 내용')).toHaveCount(0);
    // From that button the keys still mean what they mean on the card.
    await page.keyboard.press('j');
    await expect(cards.nth(1)).toBeFocused();
    await expect(page.getByLabel('답글 내용')).toHaveCount(0);
    await page.keyboard.press('k');
    await expect(cards.nth(0)).toBeFocused();
    await replyButton.focus();
    await page.keyboard.press('ArrowDown');
    await expect(cards.nth(1)).toBeFocused();
    await cards.nth(1).getByRole('button', { name: '저장', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#timeline')).toBeFocused();
    // Enter on a button is still that button, never the card's "open".
    await replyButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('답글 내용')).toBeFocused();
    await expect(page.locator('.thread-focus')).toHaveCount(0);
    // And in the conversation too: after r, Escape, j walks on from the focused note's
    // reply button to the reply under it.
    await page.keyboard.press('Escape');
    await cards.nth(0).focus();
    await page.keyboard.press('Enter');
    const conversation = page.locator('.conversation');
    await expect(conversation).toBeVisible();
    // The newest card is the reply (note 4): its conversation has note 3 above it.
    const focused = conversation.locator('.note-card--focused');
    await expect(focused).toContainText('mine 4');
    await focused.getByRole('button', { name: /에게 답글 달기/ }).click();
    await expect(page.getByLabel('답글 내용')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(focused.getByRole('button', { name: /에게 답글 달기/ })).toBeFocused();
    await page.keyboard.press('k');
    await expect(conversation.locator(`article[data-note="${origin}/notes/3"]`)).toBeFocused();
  });

  test('the conversation of a reply whose parent is gone says so, and links to no 410', async ({
    page,
  }) => {
    await server(
      page,
      [createNote(1, { content: '<p>지울 원글</p>', to: [PUBLIC], published: at(0) })],
      [bobs(2, 1)],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const root = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await openManage(root);
    await root.getByRole('button', { name: '내 글 삭제하기' }).click();
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('내 서버에서 글을 지웠어요');
    await expect(root).toHaveCount(0);
    const reply = page.locator(`#timeline article[data-note="${origin}/notes/2"]`);
    await reply.getByRole('button', { name: '대화 열기', exact: true }).click();
    const conversation = page.locator('.context-column .conversation');
    await expect(conversation).toBeVisible();
    // The column says the parent is gone; it neither claims it is unloaded nor links to it.
    await expect(conversation.locator('.missing-parent')).toHaveText('원글이 삭제됐어요');
    await expect(conversation.locator('.missing-parent a')).toHaveCount(0);
    await expect(conversation).not.toContainText('아직 불러오지 않았어요');
    await expect(page.locator(`a[href="${origin}/notes/1"]`)).toHaveCount(0);
    // After a reload the tombstone in the outbox says the same thing.
    await page.reload();
    await connect(page);
    await reply.getByRole('button', { name: '대화 열기', exact: true }).click();
    await expect(conversation.locator('.missing-parent')).toHaveText('원글이 삭제됐어요');
    await expect(conversation.locator('.missing-parent a')).toHaveCount(0);
    await expect(page.locator(`a[href="${origin}/notes/1"]`)).toHaveCount(0);
  });

  test('a parent the client never saw still offers the server copy', async ({ page }) => {
    await server(page, [
      createNote(3, {
        content: '<p>모르는 글에 단 답</p>',
        inReplyTo: 'https://elsewhere.example/notes/9',
        to: [PUBLIC],
        published: at(2),
      }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/3"]`)
      .getByRole('button', { name: '대화 열기', exact: true })
      .click();
    const missing = page.locator('.context-column .conversation .missing-parent');
    await expect(missing).toContainText('원글을 아직 불러오지 않았어요');
    await expect(missing.locator('a')).toHaveAttribute('href', 'https://elsewhere.example/notes/9');
  });

  test('on a phone my own row folds 저장 into the 관리 row one level deep, and opening 관리 never moves the five', async ({
    page,
  }) => {
    await server(
      page,
      [
        createNote(1, { content: '<p>root</p>', to: [PUBLIC], published: at(0) }),
        mine(2, 1),
        mine(3, 2),
        mine(4, 3),
        mine(5, 4),
      ],
      [bobs(12, 1), bobs(13, 2), bobs(14, 3), bobs(15, 4)],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const card = (id: number) =>
      page.locator(`.conversation article[data-note="${origin}/notes/${id}"]`);
    // The focused note (a 314px row) keeps six with every word; the replies below fold.
    const focusRow = card(1).locator('.note-actions');
    const focusBoxes = await boxesOf(focusRow);
    console.log(`phone thread depth 0: ${focusBoxes.map((box) => box.width).join('+')}px`);
    expect(focusBoxes).toHaveLength(6);
    expect(new Set(focusBoxes.map((box) => box.top)).size).toBe(1);
    for (const [depth, id] of [
      [1, 3],
      [2, 4],
      [3, 5],
    ] as const) {
      const row = card(id).locator('.note-actions');
      const rowWidth = Math.round((await row.boundingBox())!.width);
      const boxes = await boxesOf(row);
      console.log(
        `phone thread depth ${depth}: row ${rowWidth}px, ${boxes.map((box) => box.width).join('+')}px`,
      );
      // Five on one line: 답글, 공유, 좋아요, 대화, 관리 - every one at 44px, inside the phone.
      expect(boxes, `depth ${depth}`).toHaveLength(5);
      expect(new Set(boxes.map((box) => box.top)).size, `depth ${depth} rows`).toBe(1);
      for (const box of boxes) {
        expect(box.width, `depth ${depth}`).toBeGreaterThanOrEqual(44);
        expect(box.height, `depth ${depth}`).toBeGreaterThanOrEqual(44);
        expect(box.right, `depth ${depth}`).toBeLessThanOrEqual(390);
      }
      await expect(row.locator('> .save-button')).toBeHidden();
      for (const word of ['답글', '공유', '좋아요', '대화', '관리'])
        await expect(
          row.locator('button:visible').filter({ hasText: word }).locator('.action-label'),
          `depth ${depth} ${word}`,
        ).toBeVisible();
      // Opening 관리 draws its own row underneath: 저장, 수정, 삭제 - and the five stay put.
      const manage = row.getByRole('button', { name: '내 글 관리: 수정, 삭제' });
      await manage.click();
      await expect(manage).toHaveAttribute('aria-expanded', 'true');
      const opened = await boxesOf(row);
      // The five keep their places (the page may have scrolled to the tap: compare within).
      const relative = (items: typeof boxes) =>
        items.map((box) => ({ ...box, top: box.top - items[0].top }));
      expect(relative(opened.slice(0, 5))).toEqual(relative(boxes));
      const manageRow = row.locator('.note-manage-row[data-open]');
      await expect(manageRow).toBeVisible();
      await expect(manageRow.locator('button:visible .action-label')).toHaveText([
        '저장',
        '수정',
        '삭제',
      ]);
      const rowTop = opened[0].top;
      for (const box of opened.slice(5)) {
        expect(box.top, `depth ${depth} manage row is beneath`).toBeGreaterThan(rowTop);
        expect(box.height, `depth ${depth}`).toBeGreaterThanOrEqual(44);
        expect(box.right, `depth ${depth}`).toBeLessThanOrEqual(390);
      }
      expect(new Set(opened.slice(5).map((box) => box.top)).size, `depth ${depth}`).toBe(1);
      // The folded 저장 is the real one: it saves, and says so.
      await manageRow.getByRole('button', { name: '저장', exact: true }).click();
      // ...and the row stays open around it: a save no longer redraws the thread's cards.
      await expect(manage).toHaveAttribute('aria-expanded', 'true');
      const folded = manageRow.locator('.save-button--folded');
      await expect(folded).toHaveAttribute('aria-pressed', 'true');
      await expect(folded).toHaveAccessibleName('저장됨');
      await folded.click();
      await expect(folded).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Escape');
      await expect(manage).toHaveAttribute('aria-expanded', 'false');
      await expect(manageRow).toHaveCount(0);
    }
    // Someone else's reply keeps its five words at every depth of the phone.
    for (const id of [13, 14, 15]) {
      const row = card(id).locator('.note-actions');
      const boxes = await boxesOf(row);
      expect(boxes, `bob ${id}`).toHaveLength(5);
      expect(new Set(boxes.map((box) => box.top)).size, `bob ${id}`).toBe(1);
      await expect(row.locator('.action-label:visible')).toHaveText([
        '답글',
        '공유',
        '좋아요',
        '저장',
        '대화',
      ]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('in the 1440 panel opening 관리 three levels deep adds a row beneath and moves none of the six', async ({
    page,
  }) => {
    await server(
      page,
      [
        createNote(1, { content: '<p>root</p>', to: [PUBLIC], published: at(0) }),
        mine(2, 1),
        mine(3, 2),
        mine(4, 3),
        mine(5, 4),
      ],
      [bobs(13, 2), bobs(14, 3), bobs(15, 4)],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const panel = page.locator('.context-column .thread-panel');
    const panelBox = (await panel.boundingBox())!;
    for (const [depth, id, count] of [
      [1, 3, 6],
      [2, 4, 6],
      [3, 5, 5],
    ] as const) {
      const row = panel.locator(`article[data-note="${origin}/notes/${id}"] .note-actions`);
      const rowWidth = Math.round((await row.boundingBox())!.width);
      const before = await boxesOf(row);
      console.log(
        `panel depth ${depth}: row ${rowWidth}px, ${before.map((box) => box.width).join('+')}px`,
      );
      expect(before, `depth ${depth}`).toHaveLength(count);
      expect(new Set(before.map((box) => box.top)).size, `depth ${depth} rows`).toBe(1);
      const manage = row.getByRole('button', { name: '내 글 관리: 수정, 삭제' });
      await manage.click();
      const after = await boxesOf(row);
      const relative = (items: typeof before) =>
        items.map((box) => ({ ...box, top: box.top - items[0].top }));
      expect(relative(after.slice(0, count)), `depth ${depth} six stay`).toEqual(relative(before));
      const manageRow = row.locator('.note-manage-row[data-open]');
      await expect(manageRow.locator('button:visible .action-label')).toHaveText(
        count === 5 ? ['저장', '수정', '삭제'] : ['수정', '삭제'],
      );
      for (const box of after.slice(count)) {
        expect(box.top, `depth ${depth} beneath`).toBeGreaterThan(after[0].top);
        expect(box.right, `depth ${depth} inside the panel`).toBeLessThanOrEqual(
          panelBox.x + panelBox.width + 1,
        );
      }
      await page.keyboard.press('Escape');
      await expect(manage).toHaveAttribute('aria-expanded', 'false');
    }
    // Someone else's reply in the panel: the five keep their words down to 300px.
    for (const id of [13, 14, 15]) {
      const row = panel.locator(`article[data-note="${origin}/notes/${id}"] .note-actions`);
      const boxes = await boxesOf(row);
      expect(boxes, `bob ${id}`).toHaveLength(5);
      expect(new Set(boxes.map((box) => box.top)).size, `bob ${id}`).toBe(1);
    }
  });

  test("in the 1100 panel someone else's reply folds 공유, 좋아요 and 저장 to their icons and keeps five on one line", async ({
    page,
  }) => {
    await server(
      page,
      [createNote(1, { content: '<p>root</p>', to: [PUBLIC], published: at(0) }), mine(2, 1)],
      [bobs(13, 2), bobs(14, 13)],
    );
    await page.setViewportSize({ width: 1100, height: 900 });
    await connect(page);
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const panel = page.locator('.context-column .thread-panel');
    for (const id of [13, 14]) {
      const row = panel.locator(`article[data-note="${origin}/notes/${id}"] .note-actions`);
      const rowWidth = Math.round((await row.boundingBox())!.width);
      const boxes = await boxesOf(row);
      console.log(
        `1100 panel bob ${id}: row ${rowWidth}px, ${boxes.map((box) => box.width).join('+')}px`,
      );
      expect(boxes, `bob ${id}`).toHaveLength(5);
      expect(new Set(boxes.map((box) => box.top)).size, `bob ${id} rows`).toBe(1);
      // The words fold behind the icons; the names keep them, and 답글 / 대화 keep theirs.
      for (const name of ['공유', '좋아요', '저장']) {
        const button = row.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        await expect(button.locator('.action-label')).not.toBeInViewport();
      }
      await expect(
        row.getByRole('button', { name: /답글 달기/ }).locator('.action-label'),
      ).toBeVisible();
      await expect(
        row.getByRole('button', { name: /^대화/ }).locator('.action-label'),
      ).toBeVisible();
    }
  });

  test('the sidebar dot is lit only for a connected account: grey on the landing page and in the preview', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const dot = page.locator('.sidebar-bottom .connection-dot');
    await expect(dot).toHaveClass(/connection-dot--pending/);
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await expect(page.locator('.note-card').first()).toBeVisible();
    await expect(dot).toHaveClass(/connection-dot--pending/);
    // The preview's account line is not a connection either.
    await expect(page.locator('.context-account .connection-dot')).toHaveClass(
      /connection-dot--pending/,
    );
    await page.getByRole('button', { name: '둘러보기 종료' }).click();
    await server(page, [createNote(1, { content: '<p>note</p>', to: [PUBLIC], published: at(0) })]);
    await connect(page);
    await expect(page.getByText('note')).toBeVisible();
    await expect(dot).not.toHaveClass(/connection-dot--pending/);
    await expect(page.locator('.context-account .connection-dot')).not.toHaveClass(
      /connection-dot--pending/,
    );
  });
});

test.describe('round 19: laptop rows, quiet chrome', () => {
  const bob = `${origin}/users/bob`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  const at = (index: number) =>
    new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60_000).toISOString();
  const reaction = (type: 'Like' | 'Announce', note: number, index: number) => ({
    id: `${origin}/activities/${type.toLowerCase()}-${note}-${index}`,
    type,
    actor: `${origin}/users/fan${index}`,
    object: `${origin}/notes/${note}`,
    to: [PUBLIC],
  });
  const dozen = (note: number) => [
    ...Array.from({ length: 12 }, (_, index) => reaction('Like', note, index)),
    ...Array.from({ length: 12 }, (_, index) => reaction('Announce', note, index)),
  ];
  const mine = (id: number, parent?: number) =>
    createNote(id, {
      content: `<p>mine ${id}</p>`,
      ...(parent ? { inReplyTo: `${origin}/notes/${parent}` } : {}),
      to: [PUBLIC],
      published: at(id),
    });
  const bobs = (id: number, parent: number) =>
    createNote(id, {
      content: `<p>bob ${id}</p>`,
      attributedTo: bob,
      inReplyTo: `${origin}/notes/${parent}`,
      to: [PUBLIC],
      published: at(id),
    });
  /** One row of `count` controls, logged with the row width for the report. */
  const oneRow = async (
    row: import('@playwright/test').Locator,
    where: string,
    edge: number,
    count = 6,
  ) => {
    const boxes = await boxesOf(row);
    const tap = await row.evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue('--tap')),
    );
    const rowWidth = Math.round((await row.boundingBox())!.width);
    console.log(`${where}: row ${rowWidth}px, ${boxes.map((box) => box.width).join('+')}px`);
    expect(boxes, where).toHaveLength(count);
    expect(new Set(boxes.map((box) => box.top)).size, `${where} rows`).toBe(1);
    for (const box of boxes) {
      expect(box.width, where).toBeGreaterThanOrEqual(tap);
      expect(box.height, where).toBeGreaterThanOrEqual(tap);
      expect(box.right, where).toBeLessThanOrEqual(edge);
    }
    expect(await row.evaluate((el) => el.scrollWidth - el.clientWidth), where).toBeLessThanOrEqual(
      1,
    );
    return rowWidth;
  };

  test('my own card with counts is one row of actions in the reading column at every laptop width, in the 1440 panel, and at 390 down to depth 3', async ({
    page,
  }) => {
    await mockServer(
      page,
      [mine(1), mine(2, 1), mine(3, 2), mine(4, 3), mine(5, 4)],
      [...dozen(1), ...dozen(2), ...dozen(3), ...dozen(4), ...dozen(5)],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const root = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    await expect(root.getByRole('button', { name: '좋아요 12' })).toBeVisible();
    // The reading column: seven inline where the card is wide enough, six with 관리 where
    // it is not - one line either way, every control at the target size.
    for (const width of [1100, 1180, 1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const folded = await root.locator('.manage-toggle').isVisible();
      await oneRow(root.locator('.note-actions'), `main at ${width}`, width, folded ? 6 : 7);
    }
    // The thread column at 1440: the focused note and its replies, counts and all.
    await root.getByRole('button', { name: /^대화/ }).click();
    const panel = page.locator('.context-column .thread-panel');
    const panelBox = (await panel.boundingBox())!;
    const edge = panelBox.x + panelBox.width + 1;
    await oneRow(
      panel.locator(`article[data-note="${origin}/notes/1"] .note-actions`),
      'panel at 1440, focused',
      edge,
    );
    await oneRow(
      panel.locator(`article[data-note="${origin}/notes/2"] .note-actions`),
      'panel at 1440, depth 0',
      edge,
    );
    await page.getByRole('button', { name: '목록으로 돌아가기' }).click();
    // A phone: depth 0 to 3 in the conversation (저장 folds into 관리 from depth 1).
    await page.setViewportSize({ width: 390, height: 844 });
    await root.getByRole('button', { name: /^대화/ }).click();
    for (const [depth, id] of [
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
    ] as const) {
      const row = page.locator(
        `.conversation article[data-note="${origin}/notes/${id}"] .note-actions`,
      );
      await row.scrollIntoViewIfNeeded();
      await oneRow(row, `phone thread depth ${depth}`, 390, depth === 0 ? 6 : 5);
    }
  });

  test('in the conversation a reply right under its parent carries no "원글 보기" cue; the timeline and a reply further down keep it', async ({
    page,
  }) => {
    // 2 answers 1, 3 answers 2, 6 answers 1 after 3 in reading order.
    await mockServer(page, [mine(1), mine(2, 1), mine(3, 2)], [bobs(6, 1)]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const timelineCue = (id: number) =>
      page.locator(`#timeline article[data-note="${origin}/notes/${id}"] .reply-context`);
    for (const id of [2, 3, 6]) await expect(timelineCue(id)).toBeVisible();
    await page
      .locator(`#timeline article[data-note="${origin}/notes/1"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    const conversation = page.locator('.context-column .conversation');
    const cue = (id: number) =>
      conversation.locator(`article[data-note="${origin}/notes/${id}"] .reply-context`);
    await expect(conversation.locator('article.note-card')).toHaveCount(4);
    // 2 sits right under 1, 3 right under 2: nothing to say. 6 sits under 3 but answers 1.
    await expect(cue(2)).toHaveCount(0);
    await expect(cue(3)).toHaveCount(0);
    await expect(cue(6)).toBeVisible();
    await expect(cue(6)).toContainText('원글 보기');
    // Opened on 3: its ancestors 1 and 2 stand above it in order, so neither 2 nor 3 says
    // where its parent is; the timeline card of 3 still does.
    await page
      .locator(`#timeline article[data-note="${origin}/notes/3"]`)
      .getByRole('button', { name: /^대화/ })
      .click();
    await expect(conversation.locator('.note-card--focused')).toContainText('mine 3');
    await expect(cue(2)).toHaveCount(0);
    await expect(cue(3)).toHaveCount(0);
    await expect(timelineCue(3)).toBeVisible();
  });

  test('the replies view does not repeat its empty state in the right column, and 자세히 sits on the count line', async ({
    page,
  }) => {
    // A Create whose object claims another author is refused, so the foot has a 자세히.
    await mockServer(page, [
      mine(1),
      { ...createNote(2, { content: '<p>not mine</p>', attributedTo: bob, to: [PUBLIC] }), actor },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const aside = page.locator('.context-column');
    await expect(aside.locator('.replies-peek-empty')).toBeVisible();
    await page.getByRole('button', { name: '받은 답글', exact: true }).click();
    await expect(page.locator('.empty-state h2')).toHaveText('아직 받은 답글이 없어요');
    await expect(aside.locator('.replies-peek')).toHaveCount(0);
    await expect(page.getByText('아직 받은 답글이 없어요')).toHaveCount(1);
    await page.getByRole('button', { name: '타임라인', exact: true }).click();
    await expect(aside.locator('.replies-peek-empty')).toBeVisible();
    // The foot: the count sentence and 자세히 share a line.
    const status = page.locator('.feed-status');
    const summary = page.locator('.feed-details summary');
    await expect(status).toContainText('표시하지 않은 활동 1개');
    await expect(summary).toHaveText('자세히');
    const statusBox = (await status.boundingBox())!;
    const summaryBox = (await summary.boundingBox())!;
    expect(summaryBox.y).toBeLessThan(statusBox.y + statusBox.height);
    expect(summaryBox.y + summaryBox.height).toBeGreaterThan(statusBox.y);
    expect(summaryBox.x).toBeGreaterThan(statusBox.x);
    await summary.click();
    await expect(page.locator('.feed-status-refused')).toContainText('거절한 활동 1개');
    // Opened, the reason stands on its own line under the count.
    const reason = (await page.locator('.feed-status-refused').boundingBox())!;
    expect(reason.y).toBeGreaterThanOrEqual(statusBox.y + statusBox.height - 1);
  });

  test('the composer prompt reads at the body step and the navigation in the brand accent', async ({
    page,
  }) => {
    await mockServer(page, [mine(1)]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    const size = (locator: import('@playwright/test').Locator) =>
      locator.evaluate((el) => getComputedStyle(el).fontSize);
    expect(await size(page.getByLabel('새 글'))).toBe(await size(page.locator('.note-content')));
    const accent = await page.locator('.brand-period').evaluate((el) => getComputedStyle(el).color);
    expect(
      await page
        .locator('.main-nav .nav-item')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(accent);
  });

  test('the landing form starts empty with the local server as its placeholder, and the phone preview banner wraps instead of clipping', async ({
    page,
  }) => {
    await page.goto('/');
    const field = page.getByLabel('Actor URL');
    await expect(field).toHaveValue('');
    await expect(field).toHaveAttribute('placeholder', 'https://localhost:8443/');
    await page.getByText('개발자용: 로컬 ONI 서버 연결').click();
    await expect(page.getByRole('link', { name: /로컬 서버 열기/ })).toHaveAttribute(
      'href',
      'https://localhost:8443/',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const banner = page.locator('.demo-pill > span');
    await expect(banner).toContainText('계정 연결 후 가능해요');
    const metrics = await banner.evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth,
      lines: Math.round(
        el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
      ),
    }));
    expect(metrics.clipped).toBe(false);
    expect(metrics.lines).toBe(2);
  });

  test('a reply or edit composer opened on a card low in the window brings its submit row into view', async ({
    page,
  }) => {
    await mockServer(
      page,
      Array.from({ length: 8 }, (_, index) => mine(index + 1)),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await connect(page);
    // The last card (mine 1, the oldest) drawn low: scroll so its action row is at the fold.
    const card = page.locator(`#timeline article[data-note="${origin}/notes/1"]`);
    const bottomEdge = async (locator: import('@playwright/test').Locator) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height;
    };
    await card.locator('.note-actions').evaluate((el) => {
      const row = el.getBoundingClientRect();
      window.scrollBy(0, row.bottom - innerHeight + 4);
    });
    expect(await bottomEdge(card.locator('.note-actions'))).toBeLessThanOrEqual(900);
    await openManage(card);
    await card.getByRole('button', { name: '내 글 수정하기' }).click();
    const editFooter = card.locator('..').locator('.inline-edit .composer-footer');
    await expect(editFooter).toBeVisible();
    await expect(editFooter).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(editFooter).toHaveCount(0);
    await card.locator('.note-actions').evaluate((el) => {
      const row = el.getBoundingClientRect();
      window.scrollBy(0, row.bottom - innerHeight + 4);
    });
    await card.getByRole('button', { name: /에게 답글 달기/ }).click();
    const replyFooter = card.locator('..').locator('.inline-reply .composer-footer');
    await expect(replyFooter).toBeInViewport({ ratio: 1 });
  });
});
