import { test, expect, type Locator, type Page } from '@playwright/test';
import { actor, connect as connectAs, origin } from './helpers/mock';

/** Presses 수정 or 삭제 on my own card; the two fold behind 관리 where the action row is narrow. */
async function manage(card: Locator, name: '내 글 수정하기' | '내 글 삭제하기') {
  const button = card.getByRole('button', { name });
  await card.locator('.note-actions').waitFor();
  if (!(await button.isVisible())) await card.getByRole('button', { name: /^내 글 관리/ }).click();
  await button.click();
}

/**
 * Writes keep the page responsive: after the server accepts a write, the re-read that
 * follows runs in the background while every other control stays usable, and each
 * confirmation arrives when what it confirms is on screen.
 */
const bob = `${origin}/users/bob`;
const noteOf = (id: string, author: string, content: string, summary?: string) => ({
  id: `${origin}/notes/${id}`,
  type: 'Note',
  attributedTo: author,
  content: `<p>${content}</p>`,
  ...(summary ? { summary } : {}),
  published: '2026-09-08T00:00:00Z',
  to: ['https://www.w3.org/ns/activitystreams#Public'],
});

/**
 * A small C2S server in memory: two of bob's notes in the inbox, two of mine in the outbox
 * (one behind a content warning). `postDelay` holds every POST that long; `failReads`
 * makes every outbox read after the first write answer 500 instead.
 */
function mockServer(page: Page, options: { readDelay: number; postDelay?: number }) {
  const notes: Record<string, ReturnType<typeof noteOf>> = {
    one: noteOf('one', bob, 'first card'),
    two: noteOf('two', bob, 'second card'),
    mine: noteOf('mine', actor, 'before edit'),
    warned: noteOf('warned', actor, 'behind the warning', '주의할 내용'),
  };
  const server = {
    likes: [] as string[],
    updates: 0,
    posts: 0,
    slow: false,
    outboxReads: 0,
    failReads: false,
  };
  const create = (id: string) => ({
    id: `${origin}/activities/${id}`,
    type: 'Create',
    actor: notes[id].attributedTo,
    object: notes[id],
  });
  const collection = (items: unknown[]) => ({ type: 'OrderedCollection', orderedItems: items });
  const promise = page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as {
        type: string;
        object: string | { id: string; content: string };
      };
      server.posts++;
      if (options.postDelay) await new Promise((resolve) => setTimeout(resolve, options.postDelay));
      if (body.type === 'Like') server.likes.push(body.object as string);
      if (body.type === 'Update' && typeof body.object === 'object') {
        server.updates++;
        const key = Object.keys(notes).find(
          (k) => notes[k].id === (body.object as { id: string }).id,
        );
        if (key) notes[key] = { ...notes[key], content: body.object.content };
      }
      // Once a write went through, every re-read of the timeline is slow.
      server.slow = true;
      await route.fulfill({
        status: 201,
        headers: {
          Location: `${origin}/activities/${server.likes.length + server.updates}`,
          'Access-Control-Expose-Headers': 'Location',
        },
      });
      return;
    }
    let json: unknown;
    if (url === actor)
      json = { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` };
    else if (url === `${actor}/inbox`) json = collection([create('one'), create('two')]);
    else if (url === `${actor}/outbox`) {
      server.outboxReads++;
      if (server.slow) await new Promise((resolve) => setTimeout(resolve, options.readDelay));
      if (server.slow && server.failReads) {
        await route.fulfill({ status: 500 });
        return;
      }
      json = collection([
        create('mine'),
        create('warned'),
        ...server.likes.map((object, index) => ({
          id: `${origin}/likes/${index + 1}`,
          type: 'Like',
          actor,
          object,
        })),
      ]);
    } else {
      const note = Object.values(notes).find((candidate) => candidate.id === url);
      if (!note) {
        await route.fulfill({ status: 404 });
        return;
      }
      json = note;
    }
    await route.fulfill({ json, contentType: 'application/activity+json' });
  });
  return { server, ready: promise };
}

async function connect(page: Page) {
  await connectAs(page);
  await expect(page.locator('.note-card')).toHaveCount(4);
}
const card = (page: Page, id: string) =>
  page.locator(`.note-card[data-note="${origin}/notes/${id}"]`);

test('a like shows at once, the re-read runs in the background, and a second like may follow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { server, ready } = mockServer(page, { readDelay: 1500 });
  await ready;
  await connect(page);
  const refresh = page.getByRole('button', { name: '타임라인 새로고침' });
  const first = card(page, 'one');
  const second = card(page, 'two');
  const like = first.getByRole('button', { name: /^좋아요/ });
  await like.click();
  // The server answered 201 at once; the button flips with it, not with the re-read.
  const liked = first.getByRole('button', { name: /^좋아함/ });
  await expect(liked).toHaveAttribute('aria-pressed', 'true', { timeout: 300 });
  await expect(page.getByRole('status')).toHaveText('좋아요를 남겼어요.');
  // The re-read is in flight and says so quietly on the refresh control alone.
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect(second.getByRole('button', { name: /에게 답글 달기/ })).toBeEnabled();
  await expect(first.getByRole('button', { name: /에게 답글 달기/ })).toBeEnabled();
  await expect(page.getByLabel('새 글')).toBeEnabled();
  await expect(page.locator('.note-actions button:disabled')).toHaveCount(0);
  // A second like on another card during that window goes through without waiting.
  await second.getByRole('button', { name: /^좋아요/ }).click();
  await expect(second.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
    { timeout: 300 },
  );
  await expect.poll(() => server.likes.length).toBe(2);
  // Once the newest re-read lands, both likes come back from the server itself.
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 6000 });
  await expect(first.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(second.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('an edit is confirmed only once the edited words are on screen', async ({ page }) => {
  const { server, ready } = mockServer(page, { readDelay: 1000 });
  await ready;
  await connect(page);
  const mine = card(page, 'mine');
  await manage(mine, '내 글 수정하기');
  const form = page.locator('.inline-edit');
  await form.getByLabel('글 수정').fill('after edit');
  await form.getByRole('button', { name: '수정하기', exact: true }).click();
  await expect.poll(() => server.updates).toBe(1);
  // The form closed with the 201; the card still shows the old words and nothing claims
  // the edit is done yet, while the re-read is on its way.
  await expect(page.locator('.inline-edit')).toHaveCount(0);
  await expect(mine.locator('.note-content')).toContainText('before edit');
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page.getByRole('button', { name: '타임라인 새로고침' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  // The first moment the confirmation is on screen, so are the edited words.
  await page.waitForFunction(
    () => (document.querySelector('[role="status"]')?.textContent ?? '').trim() !== '',
  );
  const seen = await page.evaluate((id) => {
    const content = document.querySelector(`.note-card[data-note="${id}"] .note-content`);
    return {
      toast: document.querySelector('[role="status"]')?.textContent?.trim(),
      content: content?.textContent?.trim(),
    };
  }, `${origin}/notes/mine`);
  expect(seen).toEqual({ toast: '글을 수정했어요.', content: 'after edit' });
});

test('two likes 20 ms apart both go out, in order, and disable no action button meanwhile', async ({
  page,
}) => {
  const { server, ready } = mockServer(page, { readDelay: 300, postDelay: 150 });
  await ready;
  await connect(page);
  // Sample the page for disabled action buttons every few milliseconds, from before the
  // first click until the sampler is read back: no moment may disable any of them.
  await page.evaluate(() => {
    const samples: number[] = [];
    const tick = () =>
      samples.push(document.querySelectorAll('.note-actions button:disabled').length);
    tick();
    (window as unknown as { __samples: number[]; __sampler: number }).__samples = samples;
    (window as unknown as { __sampler: number }).__sampler = window.setInterval(tick, 5);
  });
  const first = card(page, 'one');
  const second = card(page, 'two');
  await first.getByRole('button', { name: /^좋아요/ }).click();
  await page.waitForTimeout(20);
  await second.getByRole('button', { name: /^좋아요/ }).click();
  await expect(first.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(second.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => server.likes).toEqual([`${origin}/notes/one`, `${origin}/notes/two`]);
  await expect(page.getByRole('button', { name: '타임라인 새로고침' })).not.toHaveAttribute(
    'aria-busy',
    'true',
    { timeout: 6000 },
  );
  const samples = await page.evaluate(() => {
    const w = window as unknown as { __samples: number[]; __sampler: number };
    window.clearInterval(w.__sampler);
    return w.__samples;
  });
  expect(samples.length).toBeGreaterThan(10);
  expect(Math.max(...samples)).toBe(0);
  expect(server.posts).toBe(2);
});

test('a failed re-read after a like shows one message, not a confirmation beside a warning', async ({
  page,
}) => {
  const { server, ready } = mockServer(page, { readDelay: 100 });
  await ready;
  await connect(page);
  server.failReads = true;
  await card(page, 'one')
    .getByRole('button', { name: /^좋아요/ })
    .click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('좋아요는 남겼지만');
  await expect(page.getByRole('status')).toHaveText('');
  // The button keeps what the server accepted, and nothing else on the page waits.
  await expect(card(page, 'one').getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.note-actions button:disabled')).toHaveCount(0);
});

test('a revealed content warning stays open through an edit and shows the new words', async ({
  page,
}) => {
  const { server, ready } = mockServer(page, { readDelay: 200 });
  await ready;
  await connect(page);
  const warned = card(page, 'warned');
  await warned.getByRole('button', { name: '내용 보기', exact: true }).click();
  await expect(warned.locator('.note-content')).toContainText('behind the warning');
  await manage(warned, '내 글 수정하기');
  const form = page.locator('.inline-edit');
  await form.getByLabel('글 수정').fill('edited behind the warning');
  await form.getByRole('button', { name: '수정하기', exact: true }).click();
  await expect.poll(() => server.updates).toBe(1);
  await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
  // The re-read replaced the card; the reader's choice to see the text stands with it.
  await expect(warned.locator('.note-content')).toContainText('edited behind the warning');
  await expect(warned.getByRole('button', { name: '접기', exact: true })).toBeVisible();
  await expect(warned.getByRole('button', { name: '내용 보기', exact: true })).toHaveCount(0);
});

test('Escape on 삭제 while its confirmation is open closes the confirmation and stays on 삭제', async ({
  page,
}) => {
  const { ready } = mockServer(page, { readDelay: 200 });
  await ready;
  await connect(page);
  const mine = card(page, 'mine');
  await manage(mine, '내 글 삭제하기');
  const remove = mine.getByRole('button', { name: '내 글 삭제하기' });
  const confirmation = page.getByRole('group', { name: '이 글을 삭제할까요?' });
  await expect(confirmation).toBeVisible();
  await expect(page.getByRole('button', { name: '삭제 취소' })).toBeFocused();
  // Back on the control that opened it, Escape must not fall through to the list's own
  // Escape, which would move focus to the list and leave the question open.
  await page.keyboard.press('Shift+Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(remove).toHaveAttribute('aria-expanded', 'false');
});
