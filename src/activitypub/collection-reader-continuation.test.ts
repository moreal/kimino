import { expect, it, vi } from 'vitest';
import { createCollectionReader } from './collection-reader';
import type { ASObject } from '../domain/social';
const root = 'https://own.test/outbox';
const item = (i: number) => ({
  type: 'Follow',
  id: `https://own.test/f/${i}`,
  actor: 'https://own.test/alice',
  object: 'https://remote.test/bob',
});
function pages(count: number, declared = count) {
  const routes: Record<string, ASObject> = {};
  for (let i = 0; i < count; i++)
    routes[i === 0 ? root : root + '?page=' + i] = {
      type: 'OrderedCollectionPage',
      ...(i === 0 ? { totalItems: declared } : {}),
      orderedItems: [item(i)],
      ...(i < count - 1 ? { next: root + '?page=' + (i + 1) } : {}),
    };
  return routes;
}
it('resumes multiple page chunks without rereading or losing accumulated items', async () => {
  const routes = pages(5),
    events: string[] = [],
    progress: { pages: number; items: number }[] = [];
  const read = createCollectionReader({
    maxPages: 2,
    fetch: async (url) => {
      events.push(url);
      return routes[url];
    },
    onReadBudget: async (value) => {
      progress.push(value);
      events.push('continue');
    },
  });
  expect(await read(root)).toEqual({ items: [0, 1, 2, 3, 4].map(item), declared: 5 });
  expect(progress).toEqual([
    { pages: 2, items: 2 },
    { pages: 4, items: 4 },
  ]);
  expect(events).toEqual([
    root,
    root + '?page=1',
    'continue',
    root + '?page=2',
    root + '?page=3',
    'continue',
    root + '?page=4',
  ]);
});
it('cancels an unresolved continuation and removes the abort listener without another fetch', async () => {
  const routes = pages(2),
    abort = new AbortController(),
    fetcher = vi.fn(async (url: string) => routes[url]);
  let entered!: () => void;
  const gateEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const remove = vi.spyOn(abort.signal, 'removeEventListener');
  const pending = createCollectionReader({
    maxPages: 1,
    fetch: fetcher,
    signal: abort.signal,
    onReadBudget: () => {
      entered();
      return new Promise(() => {});
    },
  })(root);
  await Promise.race([gateEntered, pending]);
  abort.abort(new Error('cancelled'));
  await expect(pending).rejects.toThrow('cancelled');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
it('propagates a rejected continuation without reading the next page', async () => {
  const routes = pages(2),
    fetcher = vi.fn(async (url: string) => routes[url]);
  await expect(
    createCollectionReader({
      maxPages: 1,
      fetch: fetcher,
      onReadBudget: async () => {
        throw new Error('declined');
      },
    })(root),
  ).rejects.toThrow('declined');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('returns a typed page limit when no continuation callback exists', async () => {
  const routes = pages(2);
  await expect(
    createCollectionReader({ maxPages: 1, fetch: async (url) => routes[url] })(root),
  ).rejects.toMatchObject({ reason: 'pages', limit: 1 });
});
it('retains cycle detection across continuation boundaries', async () => {
  const routes = pages(2);
  routes[root + '?page=1'].next = root;
  let gates = 0;
  await expect(
    createCollectionReader({
      maxPages: 1,
      fetch: async (url) => routes[url],
      onReadBudget: async () => {
        gates++;
      },
    })(root),
  ).rejects.toThrow(/cycle/);
  expect(gates).toBe(2);
});
it('does not use a declared total as permission to skip the rest of the collection', async () => {
  const routes = pages(3, 1);
  let gates = 0;
  const result = await createCollectionReader({
    maxPages: 1,
    fetch: async (url) => routes[url],
    onReadBudget: async () => {
      gates++;
    },
  })(root);
  expect(result.items).toHaveLength(3);
  expect(result.declared).toBe(1);
  expect(gates).toBe(2);
});
it('never requests continuation for a recent read', async () => {
  const routes = pages(3),
    onReadBudget = vi.fn(async () => {});
  expect(
    (
      await createCollectionReader({
        maxPages: 1,
        held: new Map(),
        fetch: async (url) => routes[url],
        onReadBudget,
      })(root)
    ).items,
  ).toHaveLength(1);
  expect(onReadBudget).not.toHaveBeenCalled();
});
it('keeps a typed global object ceiling independent of page continuations', async () => {
  await expect(
    createCollectionReader({
      maxPages: 1,
      fetch: async () => ({
        type: 'OrderedCollection',
        orderedItems: Array.from({ length: 10001 }, (_, i) => item(i)),
      }),
    })(root),
  ).rejects.toMatchObject({ reason: 'objects', limit: 10000 });
});
it('checks cancellation before fetching a nested object', async () => {
  const abort = new AbortController();
  const fetcher = vi.fn(async () => {
    abort.abort();
    return {
      type: 'OrderedCollection',
      orderedItems: [{ type: 'Create', object: 'https://own.test/n/1' }],
    };
  });
  await expect(
    createCollectionReader({ maxPages: 10, fetch: fetcher, signal: abort.signal })(root),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retains nested-object resolution cache across continuation gates', async () => {
  const object = 'https://own.test/n/1';
  const routes: Record<string, ASObject> = {
    [root]: {
      type: 'OrderedCollection',
      orderedItems: [{ type: 'Create', object }],
      next: root + '?page=2',
    },
    [root + '?page=2']: {
      type: 'OrderedCollectionPage',
      orderedItems: [{ type: 'Create', object }],
    },
    [object]: { type: 'Note', id: object, content: 'retained' },
  };
  const fetcher = vi.fn(async (url: string) => routes[url]);
  const result = await createCollectionReader({
    maxPages: 1,
    fetch: fetcher,
    onReadBudget: async () => {},
  })(root);
  expect(result.items).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => url === object)).toHaveLength(1);
});
it('does not reset the object ceiling when another chunk is authorized', async () => {
  let continuations = 0;
  await expect(
    createCollectionReader({
      maxPages: 1,
      fetch: async (url) => ({
        type: 'OrderedCollectionPage',
        orderedItems: Array.from({ length: 6000 }, (_, i) => item(i)),
        ...(url === root ? { next: root + '?page=2' } : {}),
      }),
      onReadBudget: async () => {
        continuations++;
      },
    })(root),
  ).rejects.toMatchObject({ reason: 'objects', limit: 10000 });
  expect(continuations).toBe(1);
});
it('keeps excessive nesting as a protocol error rather than a continuable object budget', async () => {
  let object: ASObject = { type: 'Note', id: 'https://own.test/n/1' };
  for (let i = 0; i < 10; i++) object = { type: 'Create', object };
  await expect(
    createCollectionReader({
      maxPages: 1,
      fetch: async () => ({ type: 'OrderedCollection', orderedItems: [object] }),
    })(root),
  ).rejects.toMatchObject({ reason: 'unexpected-response' });
});
