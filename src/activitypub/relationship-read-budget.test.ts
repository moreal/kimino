import { expect, it, vi } from 'vitest';
import { readMembership } from './membership-reader';
import { createRelationshipGateway } from './relationships';
import type { ASObject, Actor } from '../domain/social';
const self = 'https://own.test/alice',
  target = 'https://remote.test/bob',
  id = 'https://own.test/f/1';
const actor: Actor = {
  id: self,
  inbox: self + '/inbox',
  outbox: self + '/outbox',
  following: self + '/following',
};
const follow = { type: 'Follow', id, actor: self, object: target };
function fixture() {
  const routes: Record<string, ASObject> = {};
  for (const root of [actor.following!, actor.inbox, actor.outbox]) {
    routes[root] = {
      type: 'OrderedCollection',
      totalItems: root === actor.inbox ? 0 : 1,
      first: root + '?page=1',
    };
    routes[root + '?page=1'] = {
      type: 'OrderedCollectionPage',
      orderedItems: root === actor.following ? [target] : root === actor.outbox ? [follow] : [],
    };
  }
  const get = vi.fn(async (url: string, _signal?: AbortSignal) => routes[url]);
  const post = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(null, { status: 201 }),
  );
  return {
    routes,
    get,
    post,
    gateway: createRelationshipGateway({
      actorUrl: self,
      maxPages: 1,
      actor: async () => actor,
      json: get,
      request: post,
    }),
  };
}
it('continues complete membership without dropping accumulated members', async () => {
  const start = actor.following!,
    fetched: string[] = [],
    progress: unknown[] = [];
  const result = await readMembership(start, {
    actorOrigin: self,
    maxPages: 1,
    fetch: async (url) => {
      fetched.push(url);
      return url === start
        ? { type: 'Collection', totalItems: 2, items: [target], next: start + '?p=2' }
        : { type: 'CollectionPage', items: ['https://remote.test/carol'] };
    },
    onReadBudget: async (p) => {
      progress.push(p);
    },
  });
  expect(result).toEqual([target, 'https://remote.test/carol']);
  expect(fetched).toHaveLength(2);
  expect(progress).toEqual([{ pages: 1, items: 1 }]);
});
it('reports typed membership page and member limits', async () => {
  const start = actor.following!;
  await expect(
    readMembership(start, {
      actorOrigin: self,
      maxPages: 1,
      fetch: async () => ({ type: 'Collection', items: [], next: start + '?p=2' }),
    }),
  ).rejects.toMatchObject({ reason: 'pages', limit: 1 });
  await expect(
    readMembership(start, {
      actorOrigin: self,
      maxPages: 1,
      maxMembers: 1,
      fetch: async () => ({ type: 'Collection', items: [target, 'https://remote.test/carol'] }),
    }),
  ).rejects.toMatchObject({ reason: 'objects', limit: 1 });
});
it('labels every complete relationship collection budget and performs no write', async () => {
  const f = fixture(),
    labels: unknown[] = [];
  expect(
    await f.gateway.load({
      onReadBudget: async (p) => {
        labels.push(p);
      },
    }),
  ).toEqual({ following: [target], requests: [{ id, target, rejected: false }] });
  expect(labels).toEqual(
    ['following', 'inbox', 'outbox'].map((collection) => ({ collection, pages: 1, items: 0 })),
  );
  expect(f.post).not.toHaveBeenCalled();
});
it.each(['following', 'inbox', 'outbox'])(
  'cancels preparation at %s without POST',
  async (stage) => {
    const f = fixture(),
      abort = new AbortController();
    const pending = f.gateway.prepareUnfollow!(
      { id, target, rejected: false },
      {
        signal: abort.signal,
        onReadBudget: async (p) => {
          if (p.collection === stage) {
            abort.abort(new Error('canceled'));
            await new Promise(() => {});
          }
        },
      },
    );
    await expect(pending).rejects.toThrow('canceled');
    expect(f.post).not.toHaveBeenCalled();
  },
);
it('returns a one-shot command isolated from the completed preflight signal', async () => {
  const f = fixture(),
    abort = new AbortController();
  const command = await f.gateway.prepareUnfollow!(
    { id, target, rejected: false },
    { signal: abort.signal, onReadBudget: async () => {} },
  );
  expect(f.post).not.toHaveBeenCalled();
  abort.abort();
  await command();
  await expect(command()).rejects.toThrow();
  expect(f.post).toHaveBeenCalledTimes(1);
  expect(f.post.mock.calls[0][1]?.signal).toBeUndefined();
  expect(JSON.parse(String(f.post.mock.calls[0][1]?.body))).toMatchObject({
    type: 'Undo',
    object: follow,
  });
});
it('copies the caller request before yielding and refuses a stale original', async () => {
  const f = fixture(),
    request = { id, target, rejected: false };
  const command = await f.gateway.prepareUnfollow!(request, {
    onReadBudget: async () => {
      request.id = 'https://own.test/forged';
      request.target = 'https://remote.test/other';
    },
  });
  await command();
  expect(JSON.parse(String(f.post.mock.calls[0][1]?.body)).object.id).toBe(id);
  const bad = fixture();
  bad.routes[actor.outbox + '?page=1'] = {
    type: 'CollectionPage',
    items: [{ ...follow, object: 'https://remote.test/other' }],
  };
  await expect(
    bad.gateway.prepareUnfollow!({ id, target, rejected: false }, { onReadBudget: async () => {} }),
  ).rejects.toThrow();
  expect(bad.post).not.toHaveBeenCalled();
});
it('does not retry a consumed command after an uncertain POST failure', async () => {
  const f = fixture();
  f.post.mockRejectedValueOnce(new Error('unknown outcome'));
  const command = await f.gateway.prepareUnfollow!(
    { id, target, rejected: false },
    { onReadBudget: async () => {} },
  );
  await expect(command()).rejects.toThrow('unknown outcome');
  await expect(command()).rejects.toThrow();
  expect(f.post).toHaveBeenCalledTimes(1);
});
it('retains cycle and declared-count rejection after membership continuation', async () => {
  const root = actor.following!;
  await expect(
    readMembership(root, {
      actorOrigin: self,
      maxPages: 1,
      fetch: async () => ({ type: 'CollectionPage', items: [], next: root }),
      onReadBudget: async () => {},
    }),
  ).rejects.toThrow(/cycle/);
  await expect(
    readMembership(root, {
      actorOrigin: self,
      maxPages: 1,
      fetch: async (url) =>
        url === root
          ? { type: 'Collection', totalItems: 2, first: root + '?p=1' }
          : { type: 'CollectionPage', items: [target] },
      onReadBudget: async () => {},
    }),
  ).rejects.toThrow(/total/);
});
it('passes read cancellation into actor and all GETs, never into the POST command', async () => {
  const f = fixture(),
    abort = new AbortController();
  const actorRead = vi.fn(async (_signal?: AbortSignal) => actor);
  const gateway = createRelationshipGateway({
    actorUrl: self,
    maxPages: 1,
    actor: actorRead,
    json: f.get,
    request: f.post,
  });
  await gateway.load({ signal: abort.signal, onReadBudget: async () => {} });
  expect(actorRead).toHaveBeenCalledWith(abort.signal);
  expect(f.get.mock.calls.every(([, signal]) => signal === abort.signal)).toBe(true);
});
