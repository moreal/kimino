import { expect, it, vi } from 'vitest';
import { CollectionReadCancelled, type CollectionReadOptions } from './collection-read';
import { createRelationshipSession } from './relationship-session';
import type {
  RelationshipEvidence,
  RelationshipGateway,
  RelationshipState,
} from './relationship-types';
import { GatewayUnreachable } from './gateway-errors';
import { deferred } from './session-doubles.test-support';

const self = 'https://home.test/me';
const target = 'https://remote.test/them';
const request = { id: 'https://home.test/follow/1', target, rejected: false };
const evidence = (): RelationshipEvidence => ({ following: [target], requests: [{ ...request }] });
const budget = { pages: 100, items: 1982, collection: 'outbox' as const };
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
async function setup(onUpdate: (state: RelationshipState) => void = () => undefined) {
  const send = vi.fn(async () => undefined);
  const gateway: RelationshipGateway = {
    load: vi.fn().mockResolvedValue(evidence()),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    prepareUnfollow: vi.fn(async () => send),
  };
  const session = createRelationshipSession(gateway, self, {
    current: () => true,
    update: onUpdate,
  });
  await session.refresh();
  return { gateway, session, send };
}

it('retains complete graph evidence while refresh awaits exactly one continuation', async () => {
  const { gateway, session } = await setup();
  gateway.load = async (options?: CollectionReadOptions) => {
    await options?.onReadBudget?.(budget);
    return { following: [], requests: [] };
  };
  const refreshing = session.refresh();
  await flush();
  expect(session.getSnapshot()).toMatchObject({
    ...evidence(),
    phase: 'loading',
    readBudget: budget,
    readPurpose: 'refresh',
    readTarget: undefined,
  });
  expect(session.continueReading()).toBe(true);
  expect(session.continueReading()).toBe(false);
  await refreshing;
  expect(session.getSnapshot()).toMatchObject({
    following: [],
    requests: [],
    phase: 'ready',
    readBudget: undefined,
    readPurpose: undefined,
  });
});

it('canceling refresh preserves old evidence but blocks actions until another complete read', async () => {
  const { gateway, session } = await setup();
  let stale: CollectionReadOptions | undefined;
  gateway.load = async (options?: CollectionReadOptions) => {
    stale = options;
    await options?.onReadBudget?.(budget);
    return { following: [], requests: [] };
  };
  const refreshing = session.refresh();
  await flush();
  session.cancelReading();
  await refreshing;
  expect(stale?.signal?.aborted).toBe(true);
  expect(session.getSnapshot()).toMatchObject({
    ...evidence(),
    phase: 'canceled',
    readBudget: undefined,
    readPurpose: undefined,
    failure: undefined,
  });
  await expect(session.unfollow(target)).rejects.toMatchObject({
    failure: { kind: 'relationship-state' },
  });
  await expect(stale!.onReadBudget!(budget)).rejects.toBeInstanceOf(CollectionReadCancelled);
  gateway.load = vi.fn().mockResolvedValue(evidence());
  await session.refresh();
  await session.unfollow(target);
});

it('canceling withdrawal preflight sends nothing and does not quarantine the target', async () => {
  const { gateway, session, send } = await setup();
  gateway.prepareUnfollow = async (_request, options) => {
    await options?.onReadBudget?.(budget);
    return send;
  };
  const withdrawing = session.unfollow(target);
  const result = withdrawing.catch((error: unknown) => error);
  await flush();
  expect(session.getSnapshot()).toMatchObject({
    readBudget: budget,
    readPurpose: 'unfollow',
    readTarget: target,
  });
  session.cancelReading();
  expect(await result).toBeInstanceOf(CollectionReadCancelled);
  expect(send).not.toHaveBeenCalled();
  expect(gateway.unfollow).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({
    phase: 'canceled',
    pending: {},
    uncertain: {},
    confirmed: {},
    errors: {},
    readBudget: undefined,
    readTarget: undefined,
  });
});

it('preflight transport failures remain typed read failures, not uncertain writes', async () => {
  const { gateway, session, send } = await setup();
  gateway.prepareUnfollow = vi.fn().mockRejectedValue(new GatewayUnreachable('offline'));
  await expect(session.unfollow(target)).rejects.toMatchObject({
    failure: { kind: 'unreachable' },
  });
  expect(session.getSnapshot().errors[target]?.kind).toBe('unreachable');
  expect(session.getSnapshot().uncertain).toEqual({});
  expect(send).not.toHaveBeenCalled();
});

it('cancellation during the prepare/send handoff prevents the command from starting', async () => {
  let cancelAtHandoff = false;
  let sawPreflight = false;
  const { session, send } = await setup((state) => {
    if (state.readPurpose === 'unfollow') sawPreflight = true;
    if (cancelAtHandoff && sawPreflight && state.pending[target] && !state.readPurpose) {
      cancelAtHandoff = false;
      session.cancelReading();
    }
  });
  // A completed prepare announces that reading ended while the write is still pending.
  cancelAtHandoff = true;
  await expect(session.unfollow(target)).rejects.toBeInstanceOf(CollectionReadCancelled);
  expect(send).not.toHaveBeenCalled();
  expect(session.getSnapshot().uncertain).toEqual({});
});

it('incidental refresh does not cancel a paused withdrawal preflight', async () => {
  const { gateway, session, send } = await setup();
  gateway.prepareUnfollow = async (_request, options) => {
    await options?.onReadBudget?.(budget);
    return send;
  };
  const withdrawing = session.unfollow(target);
  await flush();
  await session.refresh();
  expect(session.getSnapshot()).toMatchObject({ readPurpose: 'unfollow', readBudget: budget });
  expect(gateway.load).toHaveBeenCalledTimes(1);
  session.continueReading();
  await withdrawing;
  expect(send).toHaveBeenCalledOnce();
});

it('cancel after POST invocation neither aborts nor reports an unsent withdrawal', async () => {
  const { gateway, session } = await setup();
  const sent = deferred<void>();
  const command = vi.fn(() => sent.promise);
  gateway.prepareUnfollow = vi.fn().mockResolvedValue(command);
  const withdrawing = session.unfollow(target);
  await flush();
  expect(command).toHaveBeenCalledOnce();
  expect(session.getSnapshot().readTarget).toBeUndefined();
  session.cancelReading();
  expect(session.getSnapshot().pending[target]).toBe('unfollow');
  sent.reject(new GatewayUnreachable());
  await expect(withdrawing).rejects.toMatchObject({ failure: { kind: 'relationship-uncertain' } });
  expect(session.getSnapshot().uncertain[target]).toBe('unfollow');
});

it('canceling hydration after a confirmed POST preserves the receipt and previous evidence', async () => {
  const { gateway, session, send } = await setup();
  gateway.load = async (options?: CollectionReadOptions) => {
    await options?.onReadBudget?.(budget);
    return { following: [], requests: [] };
  };
  await session.unfollow(target);
  await flush();
  expect(session.getSnapshot().confirmed[target]).toBe('unfollow');
  expect(session.getSnapshot()).toMatchObject({ readPurpose: 'refresh', readTarget: undefined });
  session.cancelReading();
  await flush();
  expect(session.getSnapshot()).toMatchObject({
    ...evidence(),
    phase: 'canceled',
    confirmed: { [target]: 'unfollow' },
    uncertain: {},
    failure: undefined,
  });
  expect(send).toHaveBeenCalledOnce();
});

it('disposal aborts preflight and blocks its late command and later callbacks', async () => {
  const { gateway, session, send } = await setup();
  const prepared = deferred<() => Promise<void>>();
  let old: CollectionReadOptions | undefined;
  gateway.prepareUnfollow = (_request, options) => {
    old = options;
    return prepared.promise;
  };
  const withdrawing = session.unfollow(target);
  const result = withdrawing.catch((error: unknown) => error);
  await flush();
  session.dispose();
  expect(session.getSnapshot().readTarget).toBeUndefined();
  prepared.resolve(send);
  await result;
  expect(old?.signal?.aborted).toBe(true);
  expect(send).not.toHaveBeenCalled();
  await expect(old!.onReadBudget!(budget)).rejects.toBeInstanceOf(CollectionReadCancelled);
});

it('passes a snapshot of the exact selected request to preparation', async () => {
  const { gateway, session } = await setup();
  const prepared = deferred<() => Promise<void>>();
  const send = vi.fn(async () => undefined);
  gateway.prepareUnfollow = vi.fn(() => prepared.promise);
  const withdrawing = session.unfollow(target);
  await flush();
  const selected = vi.mocked(gateway.prepareUnfollow).mock.calls[0][0];
  session.getSnapshot().requests[0].id = 'https://home.test/follow/replacement';
  expect(selected.id).toBe(request.id);
  prepared.resolve(send);
  await withdrawing;
  expect(send).toHaveBeenCalledOnce();
});

it('preflight supersedes a refresh started reentrantly while the older refresh clears', async () => {
  let replaceOnClear = false;
  let replacement: Promise<void> | undefined;
  const { gateway, session, send } = await setup((state) => {
    if (replaceOnClear && !state.readBudget) {
      replaceOnClear = false;
      replacement = session.refresh();
    }
  });
  gateway.load = async (options) => {
    await options?.onReadBudget?.({ ...budget, collection: 'following' });
    return evidence();
  };
  const older = session.refresh();
  await flush();
  gateway.prepareUnfollow = async (_request, options) => {
    await options?.onReadBudget?.(budget);
    return send;
  };
  replaceOnClear = true;
  const withdrawing = session.unfollow(target);
  await flush();
  await older;
  await replacement;
  expect(session.getSnapshot()).toMatchObject({ readPurpose: 'unfollow', readBudget: budget });
  session.continueReading();
  await withdrawing;
  expect(send).toHaveBeenCalledOnce();
  session.cancelReading();
});
