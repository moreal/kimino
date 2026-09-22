import { expect, it, vi } from 'vitest';
import { CollectionReadCancelled, type CollectionReadOptions } from './collection-read';
import { createSocialSession } from './social-session';
import type { RelationshipGateway } from './relationship-types';
import { clock, credentials, gateway, timeline } from './session-doubles.test-support';

const target = 'https://remote.test/them';
const request = { id: 'https://example.test/follow/1', target, rejected: false };
const graphBudget = { pages: 100, items: 2000, collection: 'following' as const };
const timelineBudget = { pages: 100, items: 1900 };
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function relationships(): RelationshipGateway {
  return {
    load: vi.fn().mockResolvedValue({ following: [target], requests: [request] }),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    prepareUnfollow: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
  };
}

it('timeline and relationship continuation gates are independent', async () => {
  const graph = relationships();
  const active = { ...gateway(), relationships: graph };
  const session = createSocialSession(() => active, { now: clock() });
  await session.connect(credentials);
  active.loadTimeline = async (options) => {
    await options?.onReadBudget?.(timelineBudget);
    return timeline();
  };
  graph.load = async (options) => {
    await options?.onReadBudget?.(graphBudget);
    return { following: [target], requests: [request] };
  };
  const readingTimeline = session.refresh();
  const readingGraph = session.loadRelationships();
  await flush();
  expect(session.getSnapshot().readBudget).toEqual(timelineBudget);
  expect(session.getSnapshot().relationships?.readBudget).toEqual(graphBudget);
  expect(session.continueRelationshipReading()).toBe(true);
  expect(session.continueRelationshipReading()).toBe(false);
  await readingGraph;
  expect(session.getSnapshot().relationships?.phase).toBe('ready');
  expect(session.getSnapshot().readBudget).toEqual(timelineBudget);
  session.cancelReading();
  await readingTimeline;
  expect(session.getSnapshot().relationships?.following).toEqual([target]);
});

it('disconnect disposes relationship preparation before a replacement account starts', async () => {
  const graph = relationships();
  const old = { ...gateway(), relationships: graph };
  const next = { ...gateway(), relationships: relationships() };
  next.loadTimeline = vi.fn().mockResolvedValue(timeline('https://next.test/me'));
  let active = old;
  const session = createSocialSession(() => active, { now: clock() });
  await session.connect(credentials);
  await session.loadRelationships();
  const send = vi.fn(async () => undefined);
  let preflight: CollectionReadOptions | undefined;
  graph.prepareUnfollow = async (_request, options) => {
    preflight = options;
    await options?.onReadBudget?.(graphBudget);
    return send;
  };
  const withdrawing = session.unfollow(target).catch((error: unknown) => error);
  await flush();
  expect(session.getSnapshot().relationships?.readPurpose).toBe('unfollow');
  session.disconnect();
  active = next;
  await session.connect({ actorUrl: 'https://next.test/me' });
  await withdrawing;
  expect(preflight?.signal?.aborted).toBe(true);
  expect(send).not.toHaveBeenCalled();
  await expect(preflight!.onReadBudget!(graphBudget)).rejects.toBeInstanceOf(
    CollectionReadCancelled,
  );
  expect(session.getSnapshot().relationships).toBeUndefined();
  expect(session.continueRelationshipReading()).toBe(false);
  expect(session.getSnapshot().actor?.id).toBe('https://next.test/me');
});
