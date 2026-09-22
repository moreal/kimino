import { expect, it } from 'vitest';
import { ActivityPubClient } from './client';
import type { ASObject } from '../domain/social';
const actor = 'https://own.test/alice',
  target = 'https://remote.test/bob',
  id = 'https://own.test/f/1';
const follow = { type: 'Follow', id, actor, object: target };
function setup(
  options: {
    following?: boolean;
    outbox?: ASObject;
    inbox?: ASObject;
    members?: ASObject;
    status?: number;
  } = {},
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const routes: Record<string, ASObject> = {
    [actor]: {
      id: actor,
      type: 'Person',
      inbox: actor + '/inbox',
      outbox: actor + '/outbox',
      ...(options.following === false ? {} : { following: actor + '/following' }),
    },
    [actor + '/outbox']: options.outbox ?? {
      type: 'OrderedCollection',
      totalItems: 1,
      orderedItems: [follow],
    },
    [actor + '/inbox']: options.inbox ?? {
      type: 'OrderedCollection',
      totalItems: 1,
      orderedItems: [
        {
          type: 'Create',
          id: 'https://remote.test/c/1',
          actor: target,
          object: 'https://remote.test/n/1',
        },
      ],
    },
    [actor + '/following']: options.members ?? {
      type: 'Collection',
      totalItems: 1,
      items: [target],
    },
  };
  const client = new ActivityPubClient({
    actorUrl: actor,
    token: 'secret',
    fetch: async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (init.method === 'POST') return new Response(null, { status: options.status ?? 201 });
      if (!routes[url]) throw new Error('Unexpected remote fetch');
      return Response.json(routes[url]);
    },
  });
  return { client, calls, routes };
}
it('reads full graph and pending evidence without dereferencing remote actors or note objects', async () => {
  const { client, calls } = setup();
  expect(await client.relationships.load()).toEqual({
    following: [target],
    requests: [{ id, target, rejected: false }],
  });
  expect(calls).toHaveLength(4);
  expect(calls.every((c) => new URL(c.url).origin === 'https://own.test')).toBe(true);
});
it.each([200, 201, 202])(
  'writes standard Follow and exact embedded Undo with optional Location (%s)',
  async (status) => {
    const { client, calls } = setup({ status });
    await client.relationships.follow(target);
    await client.relationships.unfollow({ id, target, rejected: false });
    const posts = calls.filter((c) => c.init.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[0].init.body))).toMatchObject({
      type: 'Follow',
      actor,
      object: target,
      to: [target],
    });
    expect(JSON.parse(String(posts[1].init.body))).toMatchObject({
      type: 'Undo',
      actor,
      object: { type: 'Follow', id, actor, object: target },
    });
    expect(posts[0].url).toBe(actor + '/outbox');
    expect(posts[0].init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer secret' },
    });
  },
);
it('refuses missing advertised collection and never synthesizes following', async () => {
  const { client, calls } = setup({ following: false });
  await expect(client.relationships.load()).rejects.toThrow();
  expect(calls).toHaveLength(1);
});
it.each([
  { type: 'OrderedCollection', totalItems: 2, orderedItems: [follow] },
  {
    type: 'OrderedCollection',
    totalItems: 1,
    orderedItems: [follow],
    next: 'https://evil.test/page',
  },
  { type: 'OrderedCollection', totalItems: 1, orderedItems: [follow], next: actor + '/outbox' },
  { type: 'OrderedCollection', totalItems: 1, orderedItems: [{ ...follow, id: undefined }] },
  { type: 'OrderedCollection', id: actor + '/other', orderedItems: [] },
  {
    type: 'OrderedCollection',
    totalItems: 1,
    orderedItems: [follow],
    next: { type: 'OrderedCollectionPage', id: 'https://evil.test/page', orderedItems: [] },
  },
])('rejects malformed or incomplete outbox evidence', async (outbox) => {
  const { client } = setup({ outbox });
  await expect(client.relationships.load()).rejects.toThrow();
});
it.each([204, 400, 500])('does not confirm status %s', async (status) => {
  await expect(setup({ status }).client.relationships.follow(target)).rejects.toThrow();
});
it('refuses unknown or mismatched original Follow before Undo', async () => {
  const { client, calls } = setup();
  await expect(
    client.relationships.unfollow({ id, target: 'https://remote.test/other', rejected: false }),
  ).rejects.toThrow();
  expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(0);
});
it.each([
  { type: 'Note', orderedItems: [] },
  { type: 'OrderedCollection', totalItems: 0, orderedItems: [], next: '' },
  { type: 'OrderedCollection', totalItems: 0, orderedItems: [], next: false },
])('refuses malformed strict relationship pages rather than proving absence', async (outbox) => {
  await expect(setup({ outbox }).client.relationships.load()).rejects.toThrow();
});
it('refuses multiple surviving own Follow IDs for one withdrawal', async () => {
  const { client, calls } = setup({
    outbox: {
      type: 'OrderedCollection',
      totalItems: 2,
      orderedItems: [follow, { ...follow, id: id + '2' }],
    },
  });
  await expect(client.relationships.unfollow({ id, target, rejected: false })).rejects.toThrow();
  expect(calls.some((call) => call.init.method === 'POST')).toBe(false);
});
it('rejects a root that could skip first-page Follow evidence via next', async () => {
  const { client } = setup({
    outbox: {
      type: 'OrderedCollection',
      first: { type: 'OrderedCollectionPage', orderedItems: [follow] },
      next: { type: 'OrderedCollectionPage', orderedItems: [] },
    },
  });
  await expect(client.relationships.load()).rejects.toThrow();
});
it('accepts an inline root that identifies itself as first without revisiting it', async () => {
  const { client, calls } = setup({
    outbox: {
      type: 'OrderedCollection',
      id: actor + '/outbox',
      totalItems: 0,
      orderedItems: [],
      first: actor + '/outbox',
    },
  });
  expect((await client.relationships.load()).requests).toEqual([]);
  expect(calls.filter((call) => call.url === actor + '/outbox')).toHaveLength(1);
});
it.each([
  { type: 'OrderedCollection', orderedItems: [], first: 'https://own.test/different' },
  {
    type: 'OrderedCollection',
    orderedItems: [],
    first: { type: 'OrderedCollectionPage', id: actor + '/outbox', orderedItems: [follow] },
  },
  { type: 'OrderedCollection', orderedItems: [], items: [] },
])('rejects ambiguous inline relationship roots', async (outbox) => {
  await expect(setup({ outbox }).client.relationships.load()).rejects.toThrow();
});
it.each(['load', 'follow', 'unfollow'] as const)(
  'binds relationship %s to the actor established by the timeline',
  async (action) => {
    const { client, calls, routes } = setup({
      inbox: { type: 'OrderedCollection', orderedItems: [] },
    });
    await client.loadTimeline();
    const other = 'https://own.test/carol';
    routes[actor] = { ...routes[actor], id: other, outbox: other + '/outbox' };
    const operation =
      action === 'load'
        ? client.relationships.load()
        : action === 'follow'
          ? client.relationships.follow(target)
          : client.relationships.unfollow({ id, target, rejected: false });
    await expect(operation).rejects.toThrow();
    expect(calls.some((call) => call.init.method === 'POST')).toBe(false);
    expect(calls.some((call) => call.url === other + '/outbox')).toBe(false);
  },
);
it('allows an initial same-origin canonical actor alias then pins its identity', async () => {
  const { client, routes, calls } = setup({
    inbox: { type: 'OrderedCollection', orderedItems: [] },
    outbox: { type: 'OrderedCollection', orderedItems: [] },
  });
  const canonical = 'https://own.test/users/alice';
  routes[actor] = { ...routes[actor], id: canonical };
  expect((await client.loadTimeline()).actor.id).toBe(canonical);
  await client.relationships.follow(target);
  expect(
    JSON.parse(String(calls.find((call) => call.init.method === 'POST')!.init.body)).actor,
  ).toBe(canonical);
});
it.each([{ activities: [] }, { activities: [follow] }])(
  'reads complete canonical relationship pages: %j',
  async ({ activities }) => {
    const root = actor + '/outbox',
      first = root + '?page=true';
    const { client, routes } = setup({
      outbox: {
        type: 'OrderedCollectionPage',
        id: root + '?cursor=root',
        partOf: root,
        totalItems: activities.length,
        first,
        orderedItems: [{ ...follow, id: id + 'ignored' }],
      },
    });
    routes[first] = {
      type: 'OrderedCollectionPage',
      id: root + '?cursor=first',
      partOf: root,
      totalItems: activities.length,
      first,
      ...(activities.length ? { orderedItems: activities } : {}),
    };
    expect((await client.relationships.load()).requests).toEqual(
      activities.length ? [{ id, target, rejected: false }] : [],
    );
  },
);
it('rejects malformed first objects even on a bound canonical zero-count root', async () => {
  const root = actor + '/outbox';
  await expect(
    setup({
      outbox: {
        type: 'OrderedCollectionPage',
        id: root + '?cursor=0',
        partOf: root,
        totalItems: 0,
        first: { type: 'CollectionPage', id: root, orderedItems: [follow] },
      },
    }).client.relationships.load(),
  ).rejects.toThrow();
});
it.each([
  { id: actor + '/outbox?alias=1', partOf: actor + '/wrong' },
  { id: actor + '/wrong?alias=1', partOf: actor + '/outbox' },
  { id: 'https://evil.test/outbox?alias=1', partOf: actor + '/outbox' },
  { id: actor + '/outbox?alias=1' },
])('rejects unbound relationship response aliases %j', async (identity) => {
  await expect(
    setup({
      outbox: { type: 'OrderedCollectionPage', totalItems: 0, ...identity },
    }).client.relationships.load(),
  ).rejects.toThrow();
});
it.each([{}, null, '', false])(
  'rejects malformed partOf as a canonical-page binding: %j',
  async (partOf) => {
    const root = actor + '/outbox';
    await expect(
      setup({
        outbox: {
          type: 'OrderedCollectionPage',
          id: root + '?cursor=alias',
          partOf,
          totalItems: 0,
        },
      }).client.relationships.load(),
    ).rejects.toThrow();
  },
);
it.each([{}, null, '', false])(
  'cannot discard root Follow evidence using malformed partOf: %j',
  async (partOf) => {
    const root = actor + '/outbox',
      first = root + '?page=first';
    const { client, routes } = setup({
      outbox: { type: 'OrderedCollectionPage', id: root, partOf, orderedItems: [follow], first },
    });
    routes[first] = { type: 'OrderedCollectionPage', partOf: root, totalItems: 0 };
    await expect(client.relationships.load()).rejects.toThrow();
  },
);
