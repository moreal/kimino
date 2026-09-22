import { expect, it, vi } from 'vitest';
import { createSocialSession } from './social-session';
import type { TimelineReadOptions } from './timeline-read';
import {
  clock,
  credentials,
  deferred,
  gateway,
  note,
  post,
  timeline,
} from './session-doubles.test-support';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const progress = { pages: 100, items: 1982 };

it('publishes no initial timeline until explicit continuation completes the full read', async () => {
  const active = gateway();
  const resumed = vi.fn();
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    await options?.onReadBudget?.(progress);
    resumed();
    return timeline();
  };
  const session = createSocialSession(() => active, { now: clock() });
  const connecting = session.connect(credentials);
  await flush();
  expect(session.getSnapshot()).toMatchObject({ connecting: true, readBudget: progress });
  expect(session.getSnapshot().timeline).toBeUndefined();
  expect(resumed).not.toHaveBeenCalled();
  expect(session.continueReading()).toBe(true);
  expect(session.continueReading()).toBe(false);
  await connecting;
  expect(resumed).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({ connecting: false, timeline: timeline() });
  expect(session.getSnapshot().readBudget).toBeUndefined();
});

it('cancels a paused initial read without exposing an error or aborting session transport', async () => {
  const active = gateway();
  let readOptions: TimelineReadOptions | undefined;
  let sessionSignal: AbortSignal | undefined;
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    readOptions = options;
    await options?.onReadBudget?.(progress);
    return timeline();
  };
  const session = createSocialSession(
    (options) => {
      sessionSignal = options.signal;
      return active;
    },
    { now: clock() },
  );
  const connecting = session.connect(credentials);
  await flush();
  session.cancelReading();
  await connecting;
  expect(readOptions?.signal?.aborted).toBe(true);
  expect(sessionSignal?.aborted).toBe(false);
  expect(session.getSnapshot()).toMatchObject({
    connecting: false,
    timeline: undefined,
    error: undefined,
    readBudget: undefined,
  });
  await expect(readOptions!.onReadBudget!(progress)).rejects.toThrow();
  expect(session.getSnapshot().readBudget).toBeUndefined();
});

it('a write supersedes a paused refresh without canceling its POST or replacement read', async () => {
  const active = gateway();
  let signal: AbortSignal | undefined;
  const session = createSocialSession(
    (options) => {
      signal = options.signal;
      return active;
    },
    { now: clock() },
  );
  await session.connect(credentials);
  const previous = session.getSnapshot().timeline;
  let stale: TimelineReadOptions | undefined;
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    stale = options;
    await options?.onReadBudget?.(progress);
    return timeline('https://stale.test/actor');
  };
  const refreshing = session.refresh();
  await flush();
  expect(session.getSnapshot().timeline).toBe(previous);
  expect(session.getSnapshot().readBudget).toEqual(progress);
  active.loadRecent = vi.fn().mockResolvedValue({ ...timeline(), partial: true, notes: [note()] });
  await session.react(note(), 'like', true);
  await refreshing;
  await session.settled();
  expect(active.react).toHaveBeenCalledOnce();
  expect(signal?.aborted).toBe(false);
  expect(stale?.signal?.aborted).toBe(true);
  await expect(stale!.onReadBudget!(progress)).rejects.toThrow();
  expect(session.getSnapshot()).toMatchObject({
    readBudget: undefined,
    refreshing: false,
    notice: 'liked',
    error: undefined,
  });
  expect(session.getSnapshot().timeline?.notes).toEqual([note()]);
});

it('keeps a confirmed POST successful while its full fallback waits for continuation', async () => {
  const active = gateway();
  const session = createSocialSession(() => active, { now: clock() });
  await session.connect(credentials);
  const previous = session.getSnapshot().timeline;
  active.loadRecent = vi.fn().mockRejectedValue(new Error('recent failed'));
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    await options?.onReadBudget?.(progress);
    return { ...timeline(), notes: [note()] };
  };
  await expect(session.publish(post('accepted'))).resolves.toBeUndefined();
  await flush();
  expect(session.getSnapshot()).toMatchObject({
    refreshing: true,
    readBudget: progress,
    error: undefined,
  });
  expect(session.getSnapshot().timeline).toBe(previous);
  session.continueReading();
  await session.settled();
  expect(session.getSnapshot()).toMatchObject({
    refreshing: false,
    readBudget: undefined,
    notice: 'published',
    error: undefined,
  });
  expect(active.publishNote).toHaveBeenCalledOnce();
});

it('canceling fallback hydration preserves the old timeline and never retries an accepted POST', async () => {
  const active = gateway();
  const session = createSocialSession(() => active, { now: clock() });
  await session.connect(credentials);
  const previous = session.getSnapshot().timeline;
  const before = session.getSnapshot();
  active.loadRecent = vi.fn().mockRejectedValue(new Error('recent failed'));
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    await options?.onReadBudget?.(progress);
    return timeline();
  };
  await session.publish(post('accepted'));
  await flush();
  session.cancelReading();
  await session.settled();
  expect(session.getSnapshot()).toMatchObject({
    refreshing: false,
    readBudget: undefined,
    error: undefined,
    notice: 'published',
    loadedAt: before.loadedAt,
    lastFullLoadAt: before.lastFullLoadAt,
  });
  expect(session.getSnapshot().timeline).toBe(previous);
  expect(active.publishNote).toHaveBeenCalledOnce();
});

it('disconnect drops the old gate without disturbing a new connection gate', async () => {
  const active = gateway();
  const optionsSeen: TimelineReadOptions[] = [];
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    if (options) optionsSeen.push(options);
    await options?.onReadBudget?.(progress);
    return timeline();
  };
  const session = createSocialSession(() => active, { now: clock() });
  const old = session.connect(credentials);
  await flush();
  session.disconnect();
  const next = session.connect(credentials);
  await flush();
  await old;
  await expect(optionsSeen[0].onReadBudget!(progress)).rejects.toThrow();
  expect(session.getSnapshot()).toMatchObject({ connecting: true, readBudget: progress });
  session.continueReading();
  await next;
  expect(session.getSnapshot().timeline).toBeDefined();
});

it('canceling an uncooperative read settles connection and ignores a late result', async () => {
  const active = gateway();
  const late = deferred<ReturnType<typeof timeline>>();
  active.loadTimeline = async (options?: TimelineReadOptions) => {
    await options?.onReadBudget?.(progress);
    return late.promise;
  };
  const session = createSocialSession(() => active, { now: clock() });
  const connecting = session.connect(credentials);
  await flush();
  session.continueReading();
  await flush();
  session.cancelReading();
  await connecting;
  late.resolve(timeline());
  await flush();
  expect(session.getSnapshot()).toMatchObject({
    connecting: false,
    timeline: undefined,
    error: undefined,
    readBudget: undefined,
  });
});
