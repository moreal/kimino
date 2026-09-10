import { describe, expect, it, vi } from 'vitest';
import { DEMO_ACTOR, type TimelineGateway } from './social-session';
import {
  GatewayHttpError,
  GatewayProtocolError,
  GatewayReadOnly,
  GatewayRejected,
  GatewayUnreachable,
  toFailure,
} from './gateway-errors';
import { AddressingError } from '../domain/note-content';
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

describe('social session', () => {
  it('publishes connected state to subscribers and releases subscriptions', async () => {
    const session = createSession(() => gateway());
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      actor: { id: credentials.actorUrl },
      connecting: false,
      error: undefined,
    });
    expect(listener).toHaveBeenLastCalledWith(session.getSnapshot());
    unsubscribe();
    listener.mockClear();
    session.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports failed connection without leaving a busy session', async () => {
    const active = gateway();
    active.loadTimeline = async () => {
      throw new Error('Connection failed');
    };
    const session = createSession(() => active);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      connecting: false,
      error: { kind: 'gateway', message: 'Connection failed' },
    });
    await expect(session.publish(post('draft'))).rejects.toMatchObject({
      failure: { kind: 'not-connected' },
    });
  });

  it('aborts disconnect and ignores a late connection after a new session starts', async () => {
    const old = deferred<Timeline>();
    let signal!: AbortSignal;
    const session = createSession((options) => {
      if (!signal) {
        signal = options.signal;
        return { ...gateway(), loadTimeline: () => old.promise };
      }
      return { ...gateway(), loadTimeline: async () => timeline('https://other.test/me') };
    });
    const connecting = session.connect(credentials);
    session.disconnect();
    expect(signal.aborted).toBe(true);
    await session.connect(credentials);
    old.resolve(timeline());
    await connecting;
    expect(session.getSnapshot().actor?.id).toBe('https://other.test/me');
  });

  it('retains a loaded timeline when refresh fails', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await session.refresh();
    expect(session.getSnapshot()).toMatchObject({
      actor: { id: credentials.actorUrl },
      connecting: false,
      error: { kind: 'gateway', message: 'Offline' },
    });
  });

  it('does not refresh after an unconfirmed failed post, and lets the next write go on', async () => {
    const posting = deferred<unknown>();
    const active = gateway();
    active.publishNote = () => posting.promise;
    const session = createSession(() => active);
    await session.connect(credentials);
    const first = session.publish(post('draft'));
    const second = session.publish(post('another'));
    posting.reject(new Error('Rejected'));
    await expect(first).rejects.toMatchObject({
      failure: { kind: 'gateway', message: 'Rejected' },
    });
    // The failed write is not read after; the one behind it goes out on its own.
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    await expect(second).rejects.toMatchObject({ failure: { kind: 'gateway' } });
    expect(session.getSnapshot().connecting).toBe(false);
  });

  it('keeps an accepted post successful when its subsequent timeline refresh fails', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await expect(session.publish(post('published'))).resolves.toBeUndefined();
    await session.settled();
    // The write went through and the failure says so; the confirmation itself waits for the
    // read that would put the post on screen, and that read never came.
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      refreshing: false,
      notice: undefined,
    });
    expect(session.getSnapshot().error).toEqual({ kind: 'reload-failed', action: 'publish' });
    expect(active.publishNote).toHaveBeenCalledTimes(1);
  });

  it('does not hydrate or update notices after disconnecting during publication', async () => {
    const posting = deferred<unknown>();
    const active = gateway();
    active.publishNote = () => posting.promise;
    const session = createSession(() => active);
    await session.connect(credentials);
    const publication = session.publish(post('draft'));
    session.disconnect();
    posting.resolve(undefined);
    await publication;
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      timeline: undefined,
      connecting: false,
      notice: undefined,
      error: undefined,
    });
  });
  it('does not release the new session lock when an old refresh fails late', async () => {
    const oldRefresh = deferred<Timeline>();
    const newConnection = deferred<Timeline>();
    const firstGateway = gateway();
    let connections = 0;
    const session = createSession(() =>
      ++connections === 1
        ? firstGateway
        : { ...gateway(), loadTimeline: () => newConnection.promise },
    );
    await session.connect(credentials);
    firstGateway.loadTimeline = () => oldRefresh.promise;
    const refreshing = session.refresh();
    session.disconnect();
    const connecting = session.connect(credentials);
    oldRefresh.reject(new Error('Old failure'));
    await refreshing;
    expect(session.getSnapshot()).toMatchObject({
      connecting: true,
      error: undefined,
      actor: undefined,
    });
    newConnection.resolve(timeline('https://new.test/me'));
    await connecting;
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      actor: { id: 'https://new.test/me' },
    });
  });

  it('recovers from gateway construction errors for a subsequent connection', async () => {
    let attempts = 0;
    const session = createSession(() => {
      if (++attempts === 1) throw new Error('Invalid actor URL');
      return gateway();
    });
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      error: { kind: 'gateway', message: 'Invalid actor URL' },
    });
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      error: undefined,
      actor: { id: credentials.actorUrl },
    });
  });

  it('forwards text and reply unchanged and updates the actor from refreshed state', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    const reply = note({ author: credentials.actorUrl });
    active.loadTimeline = async () => ({
      ...timeline(),
      actor: { ...timeline().actor, name: 'Updated name' },
    });
    await session.publish(post('  hello  '), reply);
    expect(active.publishNote).toHaveBeenCalledWith(post('  hello  '), reply);
    expect(session.getSnapshot().actor?.name).toBe('Updated name');
  });
  it('never publishes a reply wider than its parent, whatever the draft asked for', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    const sent = () => (active.publishNote as ReturnType<typeof vi.fn>).mock.lastCall![0];
    const direct = note({ visibility: 'direct' });
    for (const asked of ['public', 'unlisted', 'followers', 'direct'] as const) {
      await session.publish(post('reply', asked), direct);
      expect(sent().visibility).toBe('direct');
    }
    const followers = note({ visibility: 'followers' });
    await session.publish(post('reply', 'public'), followers);
    expect(sent().visibility).toBe('followers');
    await session.publish(post('reply', 'direct'), followers);
    expect(sent().visibility).toBe('direct');
    const open = note({ visibility: 'public' });
    for (const asked of ['public', 'unlisted', 'followers', 'direct'] as const) {
      await session.publish(post('reply', asked), open);
      expect(sent().visibility).toBe(asked);
    }
    // A parent of unknown scope could be a direct message: the reply is capped at direct.
    await session.publish(post('reply', 'public'), note({ visibility: 'unknown' }));
    expect(sent().visibility).toBe('direct');
    await session.publish(post('reply', 'followers'), note({ visibility: 'unknown' }));
    expect(sent().visibility).toBe('direct');
  });
  it('classifies transport failures by type and code, never by their text', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    const failing = async (error: Error) => {
      active.publishNote = async () => {
        throw error;
      };
      await session.publish(post('draft')).catch(() => {});
      return session.getSnapshot().error;
    };
    expect(await failing(new GatewayHttpError(500, 'ActivityPub request failed (500).'))).toEqual({
      kind: 'http',
      status: 500,
      detail: 'ActivityPub request failed (500).',
    });
    expect(await failing(new GatewayRejected(403, 'Server rejected the Create activity.'))).toEqual(
      { kind: 'http', status: 403, detail: 'Server rejected the Create activity.' },
    );
    expect(await failing(new GatewayUnreachable('TypeError: Failed to fetch'))).toEqual({
      kind: 'unreachable',
      detail: 'TypeError: Failed to fetch',
    });
    expect(await failing(new GatewayProtocolError('unconfirmed-write', 'No Location'))).toEqual({
      kind: 'protocol',
      reason: 'unconfirmed-write',
      detail: 'No Location',
    });
    expect(await failing(new AddressingError('no-followers'))).toEqual({ kind: 'no-followers' });
    expect(await failing(new Error('sample only'))).toEqual({
      kind: 'gateway',
      message: 'sample only',
    });
  });
  it('exposes failed publication globally and clears it on the next attempt', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.publishNote = async () => {
      throw new Error('Publication failed');
    };
    await expect(session.publish(post('draft'))).rejects.toMatchObject({
      failure: { kind: 'gateway', message: 'Publication failed' },
    });
    expect(session.getSnapshot()).toMatchObject({
      error: { kind: 'gateway', message: 'Publication failed' },
      connecting: false,
    });
    const retry = deferred<unknown>();
    active.publishNote = () => retry.promise;
    const publishing = session.publish(post('draft'));
    expect(session.getSnapshot()).toMatchObject({ error: undefined, connecting: false });
    retry.resolve(undefined);
    await publishing;
  });

  it('does not expose an old publication failure after disconnecting and reconnecting', async () => {
    const posting = deferred<unknown>();
    const old = gateway();
    old.publishNote = () => posting.promise;
    let connections = 0;
    const session = createSession(() => (++connections === 1 ? old : gateway()));
    await session.connect(credentials);
    const publication = session.publish(post('draft'));
    session.disconnect();
    await session.connect(credentials);
    posting.reject(new Error('Old publication failed'));
    await expect(publication).rejects.toMatchObject({
      failure: { kind: 'gateway', message: 'Old publication failed' },
    });
    expect(session.getSnapshot()).toMatchObject({
      error: undefined,
      connecting: false,
      actor: { id: credentials.actorUrl },
    });
  });

  it('reports demo mode and stamps each load with the injected clock', async () => {
    const stamps = ['2026-09-09T01:02:03.000Z', '2026-09-09T01:05:00.000Z'];
    const now = vi.fn(() => stamps.shift()!);
    const session = createSession(() => ({ ...gateway(), demo: true }), now);
    expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
    expect(now).not.toHaveBeenCalled();
    await session.connect({ actorUrl: DEMO_ACTOR });
    expect(session.getSnapshot()).toMatchObject({
      demo: true,
      loadedAt: '2026-09-09T01:02:03.000Z',
      lastFullLoadAt: '2026-09-09T01:02:03.000Z',
    });
    await session.refresh();
    expect(session.getSnapshot().loadedAt).toBe('2026-09-09T01:05:00.000Z');
    // The clock is read once per landed read, and never for a failed or dropped one.
    expect(now).toHaveBeenCalledTimes(2);
    session.disconnect();
    expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
  });

  it('does not read the clock for a read that fails', async () => {
    const now = vi.fn(clock());
    const active = gateway();
    const session = createSession(() => active, now);
    await session.connect(credentials);
    active.loadTimeline = vi.fn().mockRejectedValue(new GatewayUnreachable('offline'));
    await session.refresh();
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('walks both collections in full on refresh, never the first pages', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(await session.refresh()).toBe(true);
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    expect(active.loadRecent).not.toHaveBeenCalled();
    expect(session.getSnapshot().timeline?.partial).toBeUndefined();
  });

  it('does not set loadedAt or demo for a failed connection', async () => {
    const active = { ...gateway(), demo: true };
    active.loadTimeline = async () => {
      throw new Error('Connection failed');
    };
    const session = createSession(() => active);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
  });

  it('clears an earlier notice on refresh and connect', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    await session.publish(post('hello'));
    expect(session.getSnapshot().notice).toBe('published');
    await session.refresh();
    expect(session.getSnapshot().notice).toBeUndefined();
    await session.publish(post('again'));
    await session.connect(credentials);
    expect(session.getSnapshot().notice).toBeUndefined();
  });

  it('reacts, then reloads the timeline like publish', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    const target = note();
    await expect(session.react(target, 'like', true)).resolves.toBeUndefined();
    expect(active.react).toHaveBeenCalledWith('like', target);
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      error: undefined,
      notice: 'liked',
    });
    await session.react(target, 'share', true);
    expect(active.react).toHaveBeenLastCalledWith('share', target);
    expect(session.getSnapshot().notice).toBe('shared');
  });

  it('withdraws only this actor’s own reaction of that kind, by its activity IRI', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    const target = note({
      likedBy: ['https://other.test/them', credentials.actorUrl],
      announcedBy: [credentials.actorUrl],
      reactions: [
        { kind: 'like', actor: 'https://other.test/them', activity: 'https://other.test/l1' },
        { kind: 'share', actor: credentials.actorUrl, activity: 'https://example.test/a1' },
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l2' },
      ],
    });
    await session.react(target, 'like', false);
    expect(active.withdrawReaction).toHaveBeenCalledWith(target, 'https://example.test/l2');
    expect(session.getSnapshot().notice).toBe('unliked');
    await session.react(target, 'share', false);
    expect(active.withdrawReaction).toHaveBeenLastCalledWith(target, 'https://example.test/a1');
    await expect(session.react(note(), 'like', false)).rejects.toMatchObject({
      failure: { kind: 'reaction-missing' },
    });
    // An own reaction the load carried without an activity IRI cannot be aimed at: the
    // withdrawal is refused instead of guessing which activity to delete.
    const opaque = note({
      likedBy: [credentials.actorUrl],
      reactions: [{ kind: 'like', actor: credentials.actorUrl, activity: '{"type":"Like"}' }],
    });
    await expect(session.react(opaque, 'like', false)).rejects.toMatchObject({
      failure: { kind: 'reaction-missing' },
    });
    expect(active.withdrawReaction).toHaveBeenCalledTimes(2);
  });

  it('surfaces a rejected withdrawal as a typed failure and keeps the loaded state', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.withdrawReaction = async () => {
      // The transport signals refusals with a typed code; the message text is not parsed.
      throw new GatewayRejected(400, 'Server rejected the Delete activity.');
    };
    const target = note({
      likedBy: [credentials.actorUrl],
      reactions: [
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l' },
      ],
    });
    await expect(session.react(target, 'like', false)).rejects.toMatchObject({
      failure: { kind: 'withdraw-rejected', code: 400 },
    });
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      notice: undefined,
      actor: { id: credentials.actorUrl },
    });
    expect(session.getSnapshot().error).toEqual({ kind: 'withdraw-rejected', code: 400 });
    expect(session.getSnapshot().timeline).toBeDefined();
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
  });

  it('passes a non-HTTP withdrawal failure through even when its message contains a number', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.withdrawReaction = async () => {
      throw new Error('Request timed out after 30000 ms (code 503?)');
    };
    const target = note({
      likedBy: [credentials.actorUrl],
      reactions: [
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l' },
      ],
    });
    await expect(session.react(target, 'like', false)).rejects.toMatchObject({
      failure: { kind: 'gateway', message: 'Request timed out after 30000 ms (code 503?)' },
    });
    expect(session.getSnapshot().error).toEqual({
      kind: 'gateway',
      message: 'Request timed out after 30000 ms (code 503?)',
    });
  });

  it('keeps an accepted reaction successful when the reload fails', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await expect(session.react(note(), 'share', true)).resolves.toBeUndefined();
    await session.settled();
    // The failure's words carry that the share went through; no second message says it.
    expect(session.getSnapshot().notice).toBeUndefined();
    expect(session.getSnapshot().error).toEqual({ kind: 'reload-failed', action: 'share' });
  });

  it('rejects reactions without a connection, and as busy only while one is being made', async () => {
    const session = createSession(() => gateway());
    await expect(session.react(note(), 'like', true)).rejects.toMatchObject({
      failure: { kind: 'not-connected' },
    });
    const loading = deferred<Timeline>();
    const active = gateway();
    active.loadTimeline = () => loading.promise;
    const connectingSession = createSession(() => active);
    const connecting = connectingSession.connect(credentials);
    await expect(connectingSession.react(note(), 'like', true)).rejects.toMatchObject({
      failure: { kind: 'busy' },
    });
    expect(active.react).not.toHaveBeenCalled();
    loading.resolve(timeline());
    await connecting;
    await expect(connectingSession.react(note(), 'like', true)).resolves.toBeUndefined();
  });

  it('types a read-only refusal from the sample gateway instead of carrying its words', async () => {
    const active = { ...gateway(), demo: true };
    active.react = async () => {
      throw new GatewayReadOnly('react');
    };
    const session = createSession(() => active);
    await session.connect({ actorUrl: DEMO_ACTOR });
    await expect(session.react(note(), 'like', true)).rejects.toMatchObject({
      failure: { kind: 'read-only', action: 'react' },
    });
    expect(session.getSnapshot().error).toEqual({ kind: 'read-only', action: 'react' });
  });

  it('classifies each read-only action and keeps unknown errors as gateway failures', () => {
    for (const action of ['publish', 'react', 'manage'] as const)
      expect(toFailure(new GatewayReadOnly(action))).toEqual({ kind: 'read-only', action });
    expect(toFailure(new Error('Connection failed'))).toEqual({
      kind: 'gateway',
      message: 'Connection failed',
    });
    expect(toFailure('odd')).toEqual({ kind: 'unknown' });
  });

  it('does not reload or notify after disconnecting during a reaction', async () => {
    const reacting = deferred<unknown>();
    const active = gateway();
    active.react = () => reacting.promise;
    const session = createSession(() => active);
    await session.connect(credentials);
    const reaction = session.react(note(), 'like', true);
    session.disconnect();
    reacting.resolve(undefined);
    await reaction;
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      connecting: false,
      notice: undefined,
      error: undefined,
    });
  });
});

describe('reply visibility', () => {
  it('narrows a reply to its parent and keeps direct replies direct', async () => {
    const active = gateway();
    const session = createSession(() => active);
    await session.connect(credentials);
    await session.publish(post('hi'), note({ visibility: 'followers' }));
    expect(active.publishNote).toHaveBeenLastCalledWith(post('hi', 'followers'), expect.anything());
    await session.publish(post('hi', 'unlisted'), note({ visibility: 'direct' }));
    expect(active.publishNote).toHaveBeenLastCalledWith(post('hi', 'direct'), expect.anything());
    await session.publish(post('hi'), note({ visibility: 'unknown' }));
    expect(active.publishNote).toHaveBeenLastCalledWith(post('hi', 'direct'), expect.anything());
    await session.publish({ content: 'top', summary: '주의', visibility: 'unlisted' });
    expect(active.publishNote).toHaveBeenLastCalledWith(
      { content: 'top', summary: '주의', visibility: 'unlisted' },
      undefined,
    );
  });
});

describe('round 11: a card that outlived its object', () => {
  const mine = () => note({ id: 'https://example.test/mine', author: credentials.actorUrl });
  const connected = async (active: TimelineGateway) => {
    const session = createSession(() => active);
    await session.connect(credentials);
    return session;
  };

  it('refuses an edit of a note the server no longer holds, without sending an Update', async () => {
    const active = gateway();
    const session = await connected(active);
    active.noteExists = vi.fn().mockResolvedValue(false);
    await expect(session.editNote(mine(), post('rewritten'))).rejects.toMatchObject({
      failure: { kind: 'note-gone' },
    });
    expect(active.updateNote).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      connecting: false,
      notice: undefined,
      error: { kind: 'note-gone' },
    });
  });

  it('reports an already deleted note as gone rather than as a fresh deletion', async () => {
    const active = gateway();
    const session = await connected(active);
    active.noteExists = vi.fn().mockResolvedValue(false);
    await expect(session.deleteNote(mine())).resolves.toBeUndefined();
    expect(active.deleteNote).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ notice: 'already-gone', error: undefined });
  });

  it('still deletes and updates a note the server confirms it holds', async () => {
    const active = gateway();
    const session = await connected(active);
    await session.editNote(mine(), post('rewritten'));
    expect(active.updateNote).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().notice).toBe('edited');
    await session.deleteNote(mine());
    expect(active.deleteNote).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().notice).toBe('deleted');
  });

  it('lets a read failure fail the write instead of guessing that the note is gone', async () => {
    const active = gateway();
    const session = await connected(active);
    active.noteExists = vi.fn().mockRejectedValue(new GatewayUnreachable('offline'));
    await expect(session.editNote(mine(), post('rewritten'))).rejects.toMatchObject({
      failure: { kind: 'unreachable' },
    });
    expect(active.updateNote).not.toHaveBeenCalled();
  });

  it('names the write a failed reload followed, for every kind of write', async () => {
    const active = gateway();
    const session = await connected(active);
    const offline = async () => {
      throw new Error('Offline');
    };
    const reloadFailedAfter = async (run: () => Promise<unknown>) => {
      active.loadTimeline = async () => timeline();
      await run().catch(() => undefined);
      active.loadTimeline = offline;
      await run().catch(() => undefined);
      return session.getSnapshot().error;
    };
    const liked = note({
      reactions: [
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l1' },
      ],
    });
    expect(await reloadFailedAfter(() => session.publish(post('a')))).toEqual({
      kind: 'reload-failed',
      action: 'publish',
    });
    expect(await reloadFailedAfter(() => session.publish(post('a'), note()))).toEqual({
      kind: 'reload-failed',
      action: 'reply',
    });
    expect(await reloadFailedAfter(() => session.deleteNote(mine()))).toEqual({
      kind: 'reload-failed',
      action: 'delete',
    });
    expect(await reloadFailedAfter(() => session.editNote(mine(), post('a')))).toEqual({
      kind: 'reload-failed',
      action: 'edit',
    });
    expect(await reloadFailedAfter(() => session.react(note(), 'share', true))).toEqual({
      kind: 'reload-failed',
      action: 'share',
    });
    expect(await reloadFailedAfter(() => session.react(liked, 'like', false))).toEqual({
      kind: 'reload-failed',
      action: 'unlike',
    });
  });
});
