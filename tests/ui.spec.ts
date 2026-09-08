import { test, expect } from '@playwright/test';
const origin = 'https://social.example';
const actor = `${origin}/users/alice`;
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

test('disconnect cancels publication waiting for actor discovery', async ({ page }) => {
  let actorReads = 0;
  let posts = 0;
  let releaseActor!: () => void;
  const actorGate = new Promise<void>((resolve) => {
    releaseActor = resolve;
  });
  await page.route(`${origin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await route.fulfill({ status: 500 });
      return;
    }
    if (route.request().url() === actor) {
      if (++actorReads > 1) await actorGate;
      try {
        await route.fulfill({
          json: { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` },
        });
      } catch {
        /* Aborted session. */
      }
    } else await route.fulfill({ json: { type: 'OrderedCollection', orderedItems: [] } });
  });
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByLabel('새 글').fill('cancel me before publishing');
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect.poll(() => actorReads).toBe(2);
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  releaseActor();
  await expect(page.getByRole('button', { name: '연결하기', exact: true })).toBeVisible();
  await expect(page.getByLabel('액세스 토큰')).toHaveValue('');
  expect(posts).toBe(0);
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
  await expect(page.getByRole('status')).toHaveText('게시되었습니다.');
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
  await page.getByRole('button', { name: '대화 보기', exact: true }).click();
  version = 'after';
  await page.getByRole('button', { name: '타임라인 새로고침' }).click();
  await expect(page.locator('.thread-focus')).toContainText('after');
  version = 'deleted';
  await page.getByRole('button', { name: '타임라인 새로고침' }).click();
  await expect(page.locator('.thread-focus')).toHaveCount(0);
  await expect(
    page.getByText('선택한 글은 현재 타임라인에 없습니다.', { exact: false }),
  ).toBeVisible();
});

test('inline reply retains context and draft across conversation navigation', async ({ page }) => {
  await page.route(`${origin}/**`, (route) =>
    route.fulfill({
      json:
        route.request().url() === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : {
              type: 'OrderedCollection',
              orderedItems: route.request().url().endsWith('/inbox')
                ? []
                : [{ id: `${origin}/activities/1`, type: 'Create', actor, object: note }],
            },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByRole('button', { name: /에게 답글 달기/ }).click();
  await expect(page.locator('.inline-reply .compose-parent')).toContainText('Hello world');
  await page.getByLabel('답글 내용').fill('이 초안은 유지되어야 합니다.');
  await page.getByRole('button', { name: '대화 보기', exact: true }).click();
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
  await page.getByRole('button', { name: '대화 보기', exact: true }).click();
  rejectPost();
  await expect(page.getByRole('alert')).toContainText('500');
  await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
  await expect(page.getByLabel('새 글')).toHaveValue('다른 화면에서도 실패를 알아야 해요');
});
