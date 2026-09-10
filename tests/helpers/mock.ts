import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The in-memory C2S server the browser suites share: one actor document, an outbox and an
 * inbox as plain `OrderedCollection`s, no paging. Tests that need POSTs, delays or stored
 * objects keep their own `page.route`; this is the read-only shape most of them use.
 */
export const origin = 'https://social.example';
export const actor = `${origin}/users/alice`;
export const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

export const person = (id: string, username?: string) => ({
  id,
  type: 'Person',
  ...(username ? { preferredUsername: username } : {}),
  inbox: `${id}/inbox`,
  outbox: `${id}/outbox`,
});

export const collection = (items: unknown[]) => ({
  type: 'OrderedCollection',
  orderedItems: items,
});

/** Read-only mock server: actor + outbox activities, empty inbox unless given. */
export async function mockServer(
  page: Page,
  outbox: unknown[],
  inbox: unknown[] = [],
  options: { actor?: string; username?: string } = {},
) {
  const me = options.actor ?? actor;
  /** An object embedded in an activity, read back by its IRI (a Like's target, say). */
  const stored = (url: string) =>
    [...outbox, ...inbox]
      .map((activity) => (activity as { object?: { id?: string } }).object)
      .find((object) => object?.id === url);
  await page.route(`${new URL(me).origin}/**`, (route) => {
    const url = route.request().url();
    return route.fulfill({
      json:
        url === me
          ? person(me, options.username)
          : (stored(url) ?? collection(url.endsWith('/inbox') ? inbox : outbox)),
    });
  });
}

/** Fills the connect form from the landing page and submits it. */
export async function connect(
  page: Page,
  options: { remember?: boolean; actor?: string; token?: string; goto?: boolean } = {},
) {
  if (options.goto !== false) await page.goto('/');
  await page.getByLabel('Actor URL').fill(options.actor ?? actor);
  if (options.token !== '')
    await page.getByLabel('액세스 토큰').fill(options.token ?? 'test-secret');
  if (options.remember) await page.getByLabel(/새로고침해도 이 탭에서 유지/).check();
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
}

/** A `Create` activity around one note; `attributedTo` in `object` names another author. */
export const createNote = (id: number | string, object: Record<string, unknown>) => ({
  id: `${origin}/activities/${id}`,
  type: 'Create',
  actor: (object.attributedTo as string) || actor,
  object: { id: `${origin}/notes/${id}`, type: 'Note', attributedTo: actor, ...object },
});

/** Every visible control of an action row: its edges, in DOM order. */
export const boxesOf = (row: Locator) =>
  row.locator('button:visible').evaluateAll((items) =>
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

/**
 * Asserts one row of `count` controls, every one at the target size and inside `edge`, and
 * nothing to scroll sideways to. Returns the row's width and the widths of its controls.
 */
export async function oneRow(row: Locator, where: string, edge: number, count: number) {
  const boxes = await boxesOf(row);
  const tap = await row.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue('--tap')),
  );
  const rowWidth = Math.round((await row.boundingBox())!.width);
  expect(boxes, where).toHaveLength(count);
  expect(new Set(boxes.map((box) => box.top)).size, `${where} rows`).toBe(1);
  for (const box of boxes) {
    expect(box.width, where).toBeGreaterThanOrEqual(tap);
    expect(box.height, where).toBeGreaterThanOrEqual(tap);
    expect(box.right, where).toBeLessThanOrEqual(edge);
  }
  expect(await row.evaluate((el) => el.scrollWidth - el.clientWidth), where).toBeLessThanOrEqual(1);
  return { rowWidth, widths: boxes.map((box) => box.width) };
}
