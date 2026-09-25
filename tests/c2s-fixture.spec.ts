import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { pushPastFirstPage } from './helpers/c2s';

const actor = 'https://fixture.example/';
const original = `${actor}notes/original`;
const credentials = { actorUrl: actor, token: 'synthetic-fixture-token' };

function fixture(options: { keepOriginalFirst?: boolean; failWrite?: number } = {}) {
  const extras: Record<string, unknown>[] = [];
  const target = { type: 'Create', object: original, published: '2026-09-25T00:00:00Z' };
  let observed = true;
  let pendingRead = false;
  let writes = 0;
  let secondPageReads = 0;
  const response = (body: unknown) => ({ status: () => 200, json: async () => body });
  const request = {
    get: async (url: string) => {
      if (url === actor) return response({ outbox: `${actor}outbox` });
      if (url.startsWith(`${actor}activities/`)) return response(extras.at(-1));
      const offset = url.includes('page=2') ? 20 : 0;
      if (offset) secondPageReads++;
      const visible = pendingRead ? extras.slice(0, -1) : extras;
      pendingRead = false;
      const ordered = options.keepOriginalFirst ? [target, ...visible] : [...visible, target];
      const items = ordered.slice(offset, offset + 20);
      if (items.includes(extras.at(-1)!)) observed = true;
      return response({
        orderedItems: items,
        ...(ordered.length > offset + 20 ? { next: `${actor}outbox?page=2` } : {}),
      });
    },
    post: async () => {
      expect(observed, 'a previous write must be observed before the next POST').toBe(true);
      writes++;
      if (writes === options.failWrite) throw new Error('injected fixture write failure');
      extras.push({
        id: `${actor}activities/${writes}`,
        type: 'Create',
        object: `${actor}notes/${writes}`,
        published: '2026-09-25T00:00:01Z',
      });
      observed = false;
      pendingRead = true;
      return { status: () => 201, headers: () => ({ location: `${actor}activities/${writes}` }) };
    },
  } as unknown as APIRequestContext;
  const page = { waitForTimeout: async () => {} } as unknown as Page;
  return { request, page, writes: () => writes, secondPageReads: () => secondPageReads };
}

test('fixture setup observes tied writes beyond page one without overlapping POSTs', async () => {
  const server = fixture();
  const extras = await pushPastFirstPage(server.page, server.request, credentials, original);
  expect(extras).toHaveLength(21);
  expect(server.writes()).toBe(21);
  expect(server.secondPageReads()).toBeGreaterThan(0);
});

test('fixture setup still rejects an original that remains on page one', async () => {
  const server = fixture({ keepOriginalFirst: true });
  await expect(
    pushPastFirstPage(server.page, server.request, credentials, original),
  ).rejects.toThrow('the Create is no longer on the first outbox page');
});

test('fixture setup retains partial cleanup IDs when a later write fails', async () => {
  const server = fixture({ failWrite: 4 });
  const cleanup: string[] = [];
  await expect(
    pushPastFirstPage(server.page, server.request, credentials, original, cleanup),
  ).rejects.toThrow('injected fixture write failure');
  expect(cleanup).toEqual([1, 2, 3].map((index) => `${actor}notes/${index}`));
});
