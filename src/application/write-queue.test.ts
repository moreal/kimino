import { describe, expect, it, vi } from 'vitest';
import type { TimelineGateway } from './social-session';
import { createWriteQueue, landed, noticeTiming, type ReadState } from './write-queue';
import { createGuard } from './guard';
import { GatewayRejected, GatewayUnreachable, type WriteAction } from './gateway-errors';
import type { Timeline, TimelineNote } from '../domain/social';
import {
  clock,
  createSession,
  credentials,
  deferred,
  gateway,
  note,
  post,
  timeline,
} from './session-doubles.test-support';

describe('write queue', () => {
  it('stamps a landed timeline, and the full-read stamp only for a full read', () => {
    const full = timeline();
    expect(landed(full, 't1')).toEqual({
      timeline: full,
      actor: full.actor,
      loadedAt: 't1',
      lastFullLoadAt: 't1',
    });
    const partial = { ...timeline(), partial: true };
    expect(landed(partial, 't2')).toEqual({
      timeline: partial,
      actor: partial.actor,
      loadedAt: 't2',
    });
  });

  it('refuses a write whose session ended before its turn, and sends nothing for it', async () => {
    const guard = createGuard();
    let state: ReadState = { refreshing: false };
    const queue = createWriteQueue({
      guard,
      state: () => state,
      update: (patch) => (state = { ...state, ...patch }),
      now: clock(),
    });
    const reader = gateway();
    const out = deferred<void>();
    const first = queue.enqueue(reader, () => out.promise, { notice: 'liked', action: 'like' });
    const perform = vi.fn(async () => undefined);
    const second = queue.enqueue(reader, perform, { notice: 'shared', action: 'share' });
    expect(queue.writing()).toBe(true);
    guard.next();
    out.resolve();
    await first;
    await expect(second).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    expect(perform).not.toHaveBeenCalled();
    // Nothing lands for a session that is over: no read was started.
    await queue.settled();
    expect(reader.loadRecent).not.toHaveBeenCalled();
    expect(queue.writing()).toBe(false);
  });
});

// The ordering rules are exercised through the session's use cases: what the queue orders
// and what its reads carry are only visible in the snapshot those use cases publish.
describe('round 13: writes that keep the page responsive', () => {
  const connected = async (active: TimelineGateway) => {
    const session = createSession(() => active);
    await session.connect(credentials);
    return session;
  };
  const withNotes = (...ids: string[]): Timeline => ({
    ...timeline(),
    notes: ids.map((id) => note({ id })),
  });
  const noteIds = (session: ReturnType<typeof createSession>) =>
    session.getSnapshot().timeline?.notes.map((n) => n.id);

  it('says when each write is confirmed: at the POST, or once the read shows it', () => {
    const actions: WriteAction[] = [
      'publish',
      'reply',
      'edit',
      'delete',
      'like',
      'unlike',
      'share',
      'unshare',
    ];
    expect(Object.fromEntries(actions.map((a) => [a, noticeTiming(a)]))).toEqual({
      publish: 'after-reload',
      reply: 'after-reload',
      edit: 'after-reload',
      delete: 'on-write',
      like: 'on-write',
      unlike: 'on-write',
      share: 'on-write',
      unshare: 'on-write',
    });
  });

  it('disables nothing while the POST is out, and is refreshing during the read after it', async () => {
    const active = gateway();
    const posting = deferred<unknown>();
    const reading = deferred<Timeline>();
    active.react = () => posting.promise;
    const session = await connected(active);
    const seen: boolean[] = [];
    session.subscribe((s) => seen.push(s.connecting));
    active.loadTimeline = () => reading.promise;
    const liking = session.react(note(), 'like', true);
    expect(session.getSnapshot()).toMatchObject({ connecting: false, refreshing: false });
    posting.resolve(undefined);
    await liking;
    // The write resolved at the 201: the control shows it, the notice says it, and nothing
    // is busy while the timeline is read again in the background.
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      refreshing: true,
      notice: 'liked',
      error: undefined,
    });
    reading.resolve(withNotes('a'));
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({ connecting: false, refreshing: false });
    expect(noteIds(session)).toEqual(['a']);
    // A write never reports the page as connecting.
    expect(seen.some(Boolean)).toBe(false);
  });

  it('confirms a post or an edit only when the read that shows it lands', async () => {
    const active = gateway();
    const reading = deferred<Timeline>();
    const session = await connected(active);
    active.loadTimeline = () => reading.promise;
    await session.publish(post('hello'));
    expect(session.getSnapshot()).toMatchObject({ notice: undefined, refreshing: true });
    reading.resolve(withNotes('new'));
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({ notice: 'published', refreshing: false });
    const editing = deferred<Timeline>();
    active.loadTimeline = () => editing.promise;
    await session.editNote(note({ author: credentials.actorUrl }), post('fixed'));
    expect(session.getSnapshot().notice).toBeUndefined();
    editing.resolve(withNotes('new'));
    await session.settled();
    expect(session.getSnapshot().notice).toBe('edited');
  });

  it('lets a new write begin during the last one’s read, and drops that read however late it lands', async () => {
    const active = gateway();
    const session = await connected(active);
    const first = deferred<Timeline>();
    const second = deferred<Timeline>();
    const reads = [first, second];
    active.loadTimeline = () => reads.shift()!.promise;
    await session.react(note({ id: 'x' }), 'like', true);
    expect(session.getSnapshot().refreshing).toBe(true);
    // The second write is not refused: nothing is busy, only refreshing.
    await session.react(note({ id: 'y' }), 'share', true);
    expect(active.react).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({ notice: 'shared', refreshing: true });
    // The stale read lands after the newer one and is dropped: the screen keeps the newer.
    second.resolve(withNotes('x', 'y'));
    await session.settled();
    expect(noteIds(session)).toEqual(['x', 'y']);
    expect(session.getSnapshot().refreshing).toBe(false);
    first.resolve(withNotes('x'));
    await session.settled();
    expect(noteIds(session)).toEqual(['x', 'y']);
    expect(session.getSnapshot()).toMatchObject({ refreshing: false, notice: 'shared' });
  });

  it('drops a stale read that lands during the newer write, and a stale failure too', async () => {
    const active = gateway();
    const session = await connected(active);
    const first = deferred<Timeline>();
    const second = deferred<Timeline>();
    const posting = deferred<unknown>();
    const reads = [first, second];
    active.loadTimeline = () => reads.shift()!.promise;
    await session.publish(post('one'));
    active.publishNote = () => posting.promise;
    const publishing = session.publish(post('two'));
    expect(session.getSnapshot()).toMatchObject({ refreshing: false });
    // The older read comes back while the POST is out: it is older than that POST.
    first.reject(new Error('stale failure'));
    await Promise.resolve();
    expect(session.getSnapshot().error).toBeUndefined();
    posting.resolve(undefined);
    await publishing;
    expect(session.getSnapshot()).toMatchObject({ connecting: false, refreshing: true });
    second.resolve(withNotes('one', 'two'));
    await session.settled();
    expect(noteIds(session)).toEqual(['one', 'two']);
    expect(session.getSnapshot()).toMatchObject({
      notice: 'published',
      error: undefined,
      refreshing: false,
    });
  });

  it('queues a second POST behind the one that is out, in order, with one read for both', async () => {
    const active = gateway();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const posts = [first, second];
    const sent: string[] = [];
    active.react = vi.fn((_kind, target: TimelineNote) => {
      sent.push(target.id);
      return posts.shift()!.promise;
    });
    const session = await connected(active);
    const reading = deferred<Timeline>();
    active.loadTimeline = vi.fn(() => reading.promise);
    const notices: Array<string | undefined> = [];
    session.subscribe((s) => notices.push(s.notice));
    const liking = session.react(note({ id: 'x' }), 'like', true);
    const sharing = session.react(note({ id: 'y' }), 'share', true);
    // The second write waits for the first POST alone; it is not refused.
    expect(sent).toEqual(['x']);
    expect(active.loadTimeline).not.toHaveBeenCalled();
    first.resolve(undefined);
    await liking;
    // The first was confirmed at its POST; a write is waiting, so no read is started under
    // it - the second write's read covers both.
    expect(notices).toContain('liked');
    expect(session.getSnapshot().refreshing).toBe(false);
    expect(active.loadTimeline).not.toHaveBeenCalled();
    expect(sent).toEqual(['x', 'y']);
    second.resolve(undefined);
    await sharing;
    expect(session.getSnapshot()).toMatchObject({ notice: 'shared', refreshing: true });
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    reading.resolve(withNotes('x', 'y'));
    await session.settled();
    expect(noteIds(session)).toEqual(['x', 'y']);
    expect(session.getSnapshot()).toMatchObject({ notice: 'shared', refreshing: false });
  });

  it('reads twice when the second write comes during the first read, and lands the newer', async () => {
    const active = gateway();
    const firstRead = deferred<Timeline>();
    const secondRead = deferred<Timeline>();
    const reads = [firstRead, secondRead];
    const session = await connected(active);
    active.loadTimeline = vi.fn(() => reads.shift()!.promise);
    await session.react(note({ id: 'x' }), 'like', true);
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    await session.react(note({ id: 'y' }), 'share', true);
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    firstRead.resolve(withNotes('x'));
    secondRead.resolve(withNotes('x', 'y'));
    await session.settled();
    expect(noteIds(session)).toEqual(['x', 'y']);
  });

  it('keeps writes in order when the first fails, and the next starts as soon as it is refused', async () => {
    const active = gateway();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const posts = [first, second];
    const sent: string[] = [];
    active.react = vi.fn((_kind, target: TimelineNote) => {
      sent.push(target.id);
      return posts.shift()!.promise;
    });
    const session = await connected(active);
    const liking = session.react(note({ id: 'x' }), 'like', true);
    const sharing = session.react(note({ id: 'y' }), 'share', true);
    first.reject(new GatewayRejected(422));
    await expect(liking).rejects.toMatchObject({ failure: { kind: 'http', status: 422 } });
    expect(sent).toEqual(['x', 'y']);
    // The waiting write cleared the failure of the one before it when it started.
    expect(session.getSnapshot().error).toBeUndefined();
    second.resolve(undefined);
    await sharing;
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({ notice: 'shared', error: undefined });
  });

  it('still reads after the first write when the second POST fails during the first read', async () => {
    const active = gateway();
    const slowRead = deferred<Timeline>();
    const replacement = deferred<Timeline>();
    const reads = [slowRead, replacement];
    const session = await connected(active);
    active.loadTimeline = vi.fn(() => reads.shift()!.promise);
    await session.publish(post('hello'));
    expect(session.getSnapshot().refreshing).toBe(true);
    active.react = vi.fn().mockRejectedValue(new GatewayRejected(422));
    await expect(session.react(note(), 'like', true)).rejects.toMatchObject({
      failure: { kind: 'http', status: 422 },
    });
    // The read the publish started was dropped for the like; the like failed at the POST,
    // so a read is started for what the publish confirmed - the like's failure stays.
    expect(session.getSnapshot()).toMatchObject({
      refreshing: true,
      error: { kind: 'http', status: 422 },
    });
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    slowRead.resolve(withNotes('stale'));
    replacement.resolve(withNotes('new'));
    await session.settled();
    expect(noteIds(session)).toEqual(['new']);
    expect(session.getSnapshot()).toMatchObject({
      refreshing: false,
      error: { kind: 'http', status: 422 },
      // The publish confirmation is not shown over the failure that came after it.
      notice: undefined,
    });
  });

  it('keeps the POST failure when the read started for an earlier write fails too', async () => {
    const active = gateway();
    const slowRead = deferred<Timeline>();
    const session = await connected(active);
    active.loadTimeline = vi.fn(() => slowRead.promise);
    await session.react(note({ id: 'x' }), 'like', true);
    active.loadTimeline = vi.fn().mockRejectedValue(new Error('Offline'));
    active.react = vi.fn().mockRejectedValue(new GatewayRejected(422));
    await expect(session.react(note({ id: 'y' }), 'share', true)).rejects.toBeDefined();
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({
      refreshing: false,
      error: { kind: 'http', status: 422 },
    });
  });

  it('does not start a read for a failed POST when nothing was owed', async () => {
    const active = gateway();
    const session = await connected(active);
    active.react = vi.fn().mockRejectedValue(new GatewayRejected(422));
    await expect(session.react(note(), 'like', true)).rejects.toBeDefined();
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().refreshing).toBe(false);
  });

  it('drops the confirmation when the read after an on-write notice fails', async () => {
    const active = gateway();
    const session = await connected(active);
    const reading = deferred<Timeline>();
    active.loadTimeline = vi.fn(() => reading.promise);
    await session.react(note(), 'like', true);
    expect(session.getSnapshot().notice).toBe('liked');
    reading.reject(new Error('Offline'));
    await session.settled();
    // Only the per-action failure is left; its words carry that the like went through.
    expect(session.getSnapshot()).toMatchObject({
      notice: undefined,
      error: { kind: 'reload-failed', action: 'like' },
    });
  });

  it('says whether a refresh request started a read', async () => {
    const active = gateway();
    const session = await connected(active);
    const reading = deferred<Timeline>();
    active.loadTimeline = vi.fn(() => reading.promise);
    const first = session.refresh();
    // One is already in flight: this request starts none.
    await expect(session.refresh()).resolves.toBe(false);
    reading.resolve(withNotes('a'));
    await expect(first).resolves.toBe(true);
    // A POST is out: its own read follows, so a request now starts none either.
    const posting = deferred<unknown>();
    active.react = () => posting.promise;
    const liking = session.react(note(), 'like', true);
    await expect(session.refresh()).resolves.toBe(false);
    posting.resolve(undefined);
    await liking;
    await session.settled();
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    session.disconnect();
    await expect(session.refresh()).resolves.toBe(false);
  });

  it('keeps a confirmed write successful when the read after it fails, without a stale reload', async () => {
    const active = gateway();
    const session = await connected(active);
    let reads = 0;
    active.loadRecent = async () => {
      throw new Error('Offline');
    };
    active.loadTimeline = async () => {
      reads++;
      throw new Error('Offline');
    };
    await expect(session.react(note(), 'like', true)).resolves.toBeUndefined();
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({
      notice: undefined,
      refreshing: false,
      error: { kind: 'reload-failed', action: 'like' },
    });
    // The next write clears that failure; the one full read was the fallback for the failed
    // incremental one, and nothing retried on its own after it.
    expect(reads).toBe(1);
    active.loadTimeline = async () => withNotes('a');
    await session.react(note(), 'share', true);
    expect(session.getSnapshot().error).toBeUndefined();
    await session.settled();
    expect(noteIds(session)).toEqual(['a']);
  });

  it('refreshes on request without going busy, and yields to a write that begins meanwhile', async () => {
    const active = gateway();
    const session = await connected(active);
    const requested = deferred<Timeline>();
    const afterWrite = deferred<Timeline>();
    const reads = [requested, afterWrite];
    active.loadTimeline = vi.fn(() => reads.shift()!.promise);
    const refreshing = session.refresh();
    expect(session.getSnapshot()).toMatchObject({ connecting: false, refreshing: true });
    // A second request while one read is out does not start another.
    await session.refresh();
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    await session.react(note({ id: 'x' }), 'like', true);
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    requested.resolve(withNotes('old'));
    await refreshing;
    expect(noteIds(session)).toEqual([]);
    afterWrite.resolve(withNotes('x'));
    await session.settled();
    expect(noteIds(session)).toEqual(['x']);
    expect(session.getSnapshot()).toMatchObject({ refreshing: false, notice: 'liked' });
  });

  it('applies nothing from a read that lands after disconnect', async () => {
    const active = gateway();
    const session = await connected(active);
    const reading = deferred<Timeline>();
    active.loadTimeline = () => reading.promise;
    await session.publish(post('hello'));
    session.disconnect();
    reading.resolve(withNotes('late'));
    await session.settled();
    expect(session.getSnapshot()).toMatchObject({
      timeline: undefined,
      refreshing: false,
      notice: undefined,
    });
  });
});

describe('round 14: the read after a write is incremental', () => {
  const connected = async (active: TimelineGateway) => {
    const session = createSession(() => active);
    await session.connect(credentials);
    return session;
  };
  const withNotes = (...ids: string[]): Timeline => ({
    ...timeline(),
    notes: ids.map((id) => note({ id })),
  });
  const noteIds = (session: ReturnType<typeof createSession>) =>
    session.getSnapshot().timeline?.notes.map((n) => n.id);

  it('reads the first pages over the loaded timeline after a write, never the full walk', async () => {
    const active = gateway();
    active.loadTimeline = vi.fn(async () => withNotes('held'));
    const session = await connected(active);
    const before = session.getSnapshot().timeline!;
    active.loadRecent = vi.fn(async (previous: Timeline) => ({
      ...withNotes('held', 'new'),
      reach: previous.reach,
      partial: true,
    }));
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenCalledTimes(1);
    expect(active.loadRecent).toHaveBeenCalledWith(before, []);
    // Connecting was the one full read; the write added none.
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(noteIds(session)).toEqual(['held', 'new']);
    expect(session.getSnapshot()).toMatchObject({ notice: 'published', refreshing: false });
  });

  it('moves loadedAt but not lastFullLoadAt for a partial read; a refresh moves both', async () => {
    const active = gateway();
    const session = await connected(active);
    const connectedAt = session.getSnapshot();
    expect(connectedAt.lastFullLoadAt).toBe(connectedAt.loadedAt);
    active.loadRecent = vi.fn(async () => ({ ...withNotes('x'), partial: true }));
    await session.react(note({ id: 'x' }), 'like', true);
    await session.settled();
    const partial = session.getSnapshot();
    expect(partial.loadedAt).not.toBe(connectedAt.loadedAt);
    expect(partial.lastFullLoadAt).toBe(connectedAt.lastFullLoadAt);
    expect(partial.timeline?.partial).toBe(true);
    active.loadTimeline = vi.fn(async () => withNotes('x', 'y'));
    expect(await session.refresh()).toBe(true);
    const full = session.getSnapshot();
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(active.loadRecent).toHaveBeenCalledTimes(1);
    expect(full.lastFullLoadAt).not.toBe(partial.lastFullLoadAt);
    expect(full.lastFullLoadAt).toBe(full.loadedAt);
    expect(full.timeline?.partial).toBeUndefined();
  });

  it('falls back to one full read when the incremental read fails, and lands it', async () => {
    const active = gateway();
    const session = await connected(active);
    active.loadRecent = vi.fn().mockRejectedValue(new GatewayUnreachable('flaky'));
    active.loadTimeline = vi.fn(async () => withNotes('full'));
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenCalledTimes(1);
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(noteIds(session)).toEqual(['full']);
    expect(session.getSnapshot()).toMatchObject({
      notice: 'published',
      error: undefined,
      refreshing: false,
    });
  });

  it('reports the write as unreloaded only when the fallback full read fails too', async () => {
    const active = gateway();
    const session = await connected(active);
    active.loadRecent = vi.fn().mockRejectedValue(new GatewayUnreachable('flaky'));
    active.loadTimeline = vi.fn().mockRejectedValue(new GatewayUnreachable('offline'));
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenCalledTimes(1);
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      error: { kind: 'reload-failed', action: 'publish' },
      notice: undefined,
      refreshing: false,
    });
  });

  it('does not fall back to a full read for an incremental read that was superseded', async () => {
    const active = gateway();
    const session = await connected(active);
    const first = deferred<Timeline>();
    active.loadRecent = vi.fn(() => first.promise);
    active.loadTimeline = vi.fn(async () => withNotes('never'));
    await session.publish(post('one'));
    // A newer write starts its own read; the first read's failure is stale, not a reason to walk.
    active.loadRecent = vi.fn(async () => ({ ...withNotes('two'), partial: true }));
    await session.publish(post('two'));
    first.reject(new GatewayUnreachable('late'));
    await session.settled();
    expect(active.loadTimeline).not.toHaveBeenCalled();
    expect(noteIds(session)).toEqual(['two']);
  });

  it('lets go of a withdrawn reaction before the recent read, so a dropped row cannot linger', async () => {
    const active = gateway();
    const like = { id: 'https://example.test/likes/1', type: 'Like', actor: credentials.actorUrl };
    const create = { id: 'https://example.test/creates/1', type: 'Create' };
    active.loadTimeline = vi.fn(async () => ({
      ...withNotes('x'),
      activities: [create, like],
    }));
    const session = await connected(active);
    active.loadRecent = vi.fn(async (previous: Timeline) => ({ ...previous, partial: true }));
    const liked = note({
      id: 'x',
      likedBy: [credentials.actorUrl],
      reactions: [{ kind: 'like', actor: credentials.actorUrl, activity: like.id }],
    });
    await session.react(liked, 'like', false);
    await session.settled();
    expect(active.withdrawReaction).toHaveBeenCalledWith(liked, like.id);
    // The Create stays held (it only fell off the page); the deleted Like is gone for good.
    expect(active.loadRecent).toHaveBeenCalledWith(
      expect.objectContaining({ activities: [create] }),
      [],
    );
    // A refused withdrawal lets go of nothing.
    active.withdrawReaction = vi.fn().mockRejectedValue(new GatewayRejected(400, 'no'));
    await expect(session.react(liked, 'like', false)).rejects.toMatchObject({
      failure: { kind: 'withdraw-rejected' },
    });
  });

  it('names the edited or deleted note to the recent read, and nothing for a post or a reaction', async () => {
    const active = gateway();
    const session = await connected(active);
    active.loadRecent = vi.fn(async (previous: Timeline) => ({ ...previous, partial: true }));
    const mine = note({ id: 'https://example.test/mine', author: credentials.actorUrl });
    await session.editNote(mine, post('new words'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(expect.anything(), [mine.id]);
    await session.deleteNote(mine);
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(expect.anything(), [mine.id]);
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(expect.anything(), []);
    await session.react(note(), 'like', true);
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(expect.anything(), []);
    // A refused write touched nothing.
    active.updateNote = vi.fn().mockRejectedValue(new GatewayRejected(400, 'no'));
    await expect(session.editNote(mine, post('refused'))).rejects.toBeTruthy();
    await session.refresh();
    expect(active.loadRecent).toHaveBeenCalledTimes(4);
  });

  it('carries a touched note into the read a later write owes, until a read lands', async () => {
    const active = gateway();
    const session = await connected(active);
    const first = deferred<Timeline>();
    active.loadRecent = vi.fn(() => first.promise);
    const mine = note({ id: 'https://example.test/mine', author: credentials.actorUrl });
    await session.editNote(mine, post('new words'));
    // A like fails while the edit's read is still out: that read is dropped, and the one
    // owed for it must still re-read the edited note.
    active.react = vi.fn().mockRejectedValue(new GatewayUnreachable('offline'));
    active.loadRecent = vi.fn(async (previous: Timeline) => ({ ...previous, partial: true }));
    await expect(session.react(note(), 'like', true)).rejects.toBeTruthy();
    await session.settled();
    expect(active.loadRecent).toHaveBeenCalledWith(expect.anything(), [mine.id]);
    // Once a read landed, the next write starts clean.
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(expect.anything(), []);
    first.resolve(timeline());
  });

  it('forgets withdrawn reactions when a full read lands, and never after the session ended', async () => {
    const active = gateway();
    const like = { id: 'https://example.test/likes/1', type: 'Like', actor: credentials.actorUrl };
    const full = { ...withNotes('x'), activities: [like] };
    active.loadTimeline = vi.fn(async () => full);
    const session = await connected(active);
    active.loadRecent = vi.fn(async (previous: Timeline) => ({ ...previous, partial: true }));
    const liked = note({
      id: 'x',
      likedBy: [credentials.actorUrl],
      reactions: [{ kind: 'like', actor: credentials.actorUrl, activity: like.id }],
    });
    await session.react(liked, 'like', false);
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(
      expect.objectContaining({ activities: [] }),
      [],
    );
    // A full read is the truth about the server again; what it lists is not let go of.
    await session.refresh();
    await session.publish(post('hello'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(
      expect.objectContaining({ activities: [like] }),
      [],
    );
    // A withdrawal confirmed after disconnect belongs to a session that is over: it must
    // not let go of anything in the session that replaced it.
    const late = deferred<unknown>();
    active.withdrawReaction = vi.fn(() => late.promise);
    const withdrawing = session.react(liked, 'like', false);
    session.disconnect();
    await session.connect(credentials);
    late.resolve(undefined);
    await withdrawing.catch(() => undefined);
    await session.publish(post('again'));
    await session.settled();
    expect(active.loadRecent).toHaveBeenLastCalledWith(
      expect.objectContaining({ activities: [like] }),
      [],
    );
  });

  it('refuses a queued write that disconnect dropped instead of reporting it sent', async () => {
    const active = gateway();
    const out = deferred<unknown>();
    active.react = vi.fn(() => out.promise);
    active.publishNote = vi.fn();
    const session = await connected(active);
    const liking = session.react(note({ id: 'x' }), 'like', true);
    const posting = session.publish(post('waiting'));
    session.disconnect();
    out.resolve(undefined);
    await expect(liking).resolves.toBeUndefined();
    // The waiting POST never went out, and its caller is told so: the draft stays.
    await expect(posting).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    expect(active.publishNote).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ timeline: undefined, error: undefined });
  });

  it('refuses a queued write that a reconnect left behind, and sends nothing for it', async () => {
    const active = gateway();
    const out = deferred<unknown>();
    active.react = vi.fn(() => out.promise);
    active.publishNote = vi.fn();
    const session = await connected(active);
    void session.react(note({ id: 'x' }), 'like', true);
    const posting = session.publish(post('waiting'));
    const reconnecting = session.connect(credentials);
    out.resolve(undefined);
    await expect(posting).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    await reconnecting;
    expect(active.publishNote).not.toHaveBeenCalled();
  });
});
