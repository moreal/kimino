import { expect, it } from 'vitest';
import { readMembership } from './membership-reader';
import type { ASObject } from '../domain/social';
import { GatewayProtocolError, GatewayReadLimit } from '../application/gateway-errors';

const actor = 'https://local.example/alice';
const start = actor + '/following';
const next = start + '?page=2';
const bob = 'https://remote.example/bob';
const june = 'https://another.example/june';
function fixture(pages: Record<string, ASObject>, limits = {}) {
  const calls: string[] = [];
  return {
    calls,
    read: () =>
      readMembership(start, {
        actorOrigin: actor,
        maxPages: 5,
        ...limits,
        fetch: async (url) => {
          calls.push(url);
          if (!pages[url]) throw new Error('unexpected fetch');
          return pages[url];
        },
      }),
  };
}

it('reads member IRIs across pages without fetching any remote profile', async () => {
  const f = fixture({
    [start]: { id: start, type: 'OrderedCollection', totalItems: 2, first: next },
    [next]: {
      id: next,
      type: 'OrderedCollectionPage',
      partOf: start,
      orderedItems: [bob],
      next: '?page=3',
    },
    [start + '?page=3']: {
      type: 'OrderedCollectionPage',
      orderedItems: [{ id: june, type: 'Person', name: 'untrusted profile' }],
    },
  });
  await expect(f.read()).resolves.toEqual([june, bob].sort());
  expect(f.calls).toEqual([start, next, start + '?page=3']);
});

it('does not revisit an inline root first page and accepts terminal lists without totals', async () => {
  const f = fixture({
    [start]: { id: start, type: 'OrderedCollectionPage', first: start, orderedItems: [bob] },
  });
  await expect(f.read()).resolves.toEqual([bob]);
  expect(f.calls).toEqual([start]);
});

it('reads embedded pages and compact/full types', async () => {
  const f = fixture({
    [start]: {
      type: 'Collection',
      totalItems: 1,
      first: {
        type: 'https://www.w3.org/ns/activitystreams#CollectionPage',
        items: [{ type: 'Link', href: bob }],
      },
    },
  });
  await expect(f.read()).resolves.toEqual([bob]);
  expect(f.calls).toEqual([start]);
});

it.each([
  { type: 'Collection', totalItems: 0 },
  { type: 'Collection', items: [] },
])('accepts explicit empty collections', async (root) => {
  await expect(fixture({ [start]: root }).read()).resolves.toEqual([]);
});

it.each([
  { type: 'Collection' },
  { type: 'Collection', items: null },
  { type: 'Collection', items: 'wrong' },
  { type: 'Collection', items: [null] },
  { type: 'Collection', items: ['javascript:alert(1)'] },
  { type: 'Collection', items: ['https://user:password@remote.example/'] },
  { type: 'Collection', items: [bob, bob] },
  { type: 'Collection', items: [bob], totalItems: 2 },
  { type: 'Collection', items: [bob], totalItems: 0 },
  { type: 'Collection', items: [], totalItems: -1 },
  { type: 'Collection', items: [], totalItems: 0.5 },
  { type: 'Collection', items: [], totalItems: '0' },
  { type: 'Note', items: [] },
  { type: 'Collection', id: actor + '/swapped', items: [] },
  { type: 'Collection', items: [], partOf: actor + '/other' },
  { type: 'Collection', items: [bob], next: 'https://remote.example/page' },
  { type: 'Collection', first: start },
  {
    type: 'Collection',
    first: { type: 'CollectionPage', id: 'https://remote.example/page', items: [] },
  },
])('refuses malformed or incomplete evidence instead of returning absence: %j', async (root) => {
  const f = fixture({ [start]: root });
  await expect(f.read()).rejects.toBeInstanceOf(GatewayProtocolError);
  expect(f.calls).toEqual([start]);
});

it('rejects a cross-origin initial collection before fetching', async () => {
  const f = fixture(
    { [start]: { type: 'Collection', items: [] } },
    { actorOrigin: 'https://elsewhere.example' },
  );
  await expect(f.read()).rejects.toBeInstanceOf(GatewayProtocolError);
  expect(f.calls).toEqual([]);
});

it('rejects repeated page identities even when embedded', async () => {
  const f = fixture({
    [start]: {
      type: 'Collection',
      first: {
        id: next,
        type: 'CollectionPage',
        items: [bob],
        next: { id: next, type: 'CollectionPage', items: [] },
      },
    },
  });
  await expect(f.read()).rejects.toBeInstanceOf(GatewayProtocolError);
});

it('does not return the first page after later network failure', async () => {
  const f = fixture({ [start]: { type: 'Collection', items: [bob], next } });
  await expect(f.read()).rejects.toThrow('unexpected fetch');
});

it.each([{ maxPages: 1 }, { maxMembers: 1 }])(
  'enforces bounded reads without partial results',
  async (limits) => {
    const f = fixture(
      {
        [start]: { type: 'Collection', items: [bob], next },
        [next]: { type: 'CollectionPage', items: [june] },
      },
      limits,
    );
    await expect(f.read()).rejects.toBeInstanceOf(GatewayReadLimit);
  },
);

// A terminal later page must never stand in for an unread first page.
it.each([
  { type: 'Collection', first: next, next: start + '?page=3' },
  { type: 'Collection', items: [], first: next },
  { type: 'Collection', items: [], first: { id: start, type: 'CollectionPage', items: [bob] } },
  { type: 'Collection', orderedItems: [], items: [bob] },
  { type: 'Collection', totalItems: 2 },
])('rejects ambiguous or absent root contents: %j', async (root) => {
  const f = fixture({
    [start]: root,
    [next]: { type: 'CollectionPage', items: [bob], next: start + '?page=3' },
    [start + '?page=3']: { type: 'CollectionPage', items: [] },
  });
  await expect(f.read()).rejects.toBeInstanceOf(GatewayProtocolError);
  expect(f.calls).toEqual([start]);
});
it.each([{ members: [] }, { members: [bob] }])(
  'reads ONI canonical query pages, ignoring root partial items: %j',
  async ({ members }) => {
    const first = start + '?page=true';
    const f = fixture({
      [start]: {
        type: 'OrderedCollectionPage',
        id: start + '?cursor=root',
        partOf: start,
        totalItems: members.length,
        first,
        orderedItems: [june],
      },
      [first]: {
        type: 'OrderedCollectionPage',
        id: start + '?cursor=first',
        partOf: start,
        totalItems: members.length,
        first,
        ...(members.length ? { orderedItems: members } : {}),
      },
    });
    expect(await f.read()).toEqual(members);
    expect(f.calls).toEqual([start, first]);
  },
);
it.each([
  { id: start + '?cursor=x', partOf: actor + '/other' },
  { id: actor + '/other?cursor=x', partOf: start },
  { id: 'https://evil.test/alice/following?cursor=x', partOf: start },
  { id: start + '?cursor=x', partOf: undefined },
])('rejects unbound canonical page aliases %j', async (identity) => {
  await expect(
    fixture({ [start]: { type: 'OrderedCollectionPage', totalItems: 0, ...identity } }).read(),
  ).rejects.toThrow();
});
it('keeps collection count checks across canonical pages', async () => {
  const first = start + '?page=1';
  await expect(
    fixture({
      [start]: {
        type: 'OrderedCollectionPage',
        id: start + '?alias=1',
        partOf: start,
        totalItems: 2,
        first,
      },
      [first]: { type: 'OrderedCollectionPage', id: first, partOf: start, items: [bob] },
    }).read(),
  ).rejects.toThrow();
});
it('accepts explicit empty omitted lists on the root and self-first terminal canonical page', async () => {
  const first = start + '?page=true';
  const f = fixture({
    [start]: {
      type: 'OrderedCollectionPage',
      id: start + '?cursor=0',
      partOf: start,
      totalItems: 0,
      first,
    },
    [first]: {
      type: 'OrderedCollectionPage',
      id: start + '?cursor=1',
      partOf: start,
      totalItems: 0,
      first,
    },
  });
  expect(await f.read()).toEqual([]);
  expect(f.calls).toEqual([start, first]);
});
it('requires a genuine reference for a canonical root first link', async () => {
  await expect(
    fixture({
      [start]: {
        type: 'OrderedCollectionPage',
        id: start + '?cursor=0',
        partOf: start,
        totalItems: 0,
        first: { type: 'CollectionPage', id: start, items: [bob] },
      },
    }).read(),
  ).rejects.toThrow();
});
