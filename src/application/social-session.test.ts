import { describe, expect, it, vi } from 'vitest';
import { createSocialSession, type TimelineGateway } from './social-session';
import type { Timeline, TimelineNote } from '../domain/social';

const credentials = { actorUrl: 'https://example.test/me', token: 'secret' };
const timeline = (id = credentials.actorUrl): Timeline => ({
  actor: { id, inbox: `${id}/inbox`, outbox: `${id}/outbox` },
  notes: [],
  diagnostics: { ignored: 0, rejected: 0 },
  activities: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function gateway(): TimelineGateway {
  return {
    loadTimeline: vi.fn().mockResolvedValue(timeline()),
    publishNote: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    undoReaction: vi.fn().mockResolvedValue(undefined),
  };
}
const note = (extra: Partial<TimelineNote> = {}): TimelineNote => ({
  id: 'https://example.test/note',
  author: 'https://other.test/them',
  content: 'parent',
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
  ...extra,
});

describe('social session', () => {
  it('publishes connected state to subscribers and releases subscriptions', async () => {
    const session = createSocialSession(() => gateway());
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      actor: { id: credentials.actorUrl },
      busy: false,
      error: '',
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
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      busy: false,
      error: 'Connection failed',
    });
    await expect(session.publish('draft')).rejects.toThrow();
  });

  it('aborts disconnect and ignores a late connection after a new session starts', async () => {
    const old = deferred<Timeline>();
    let signal!: AbortSignal;
    const session = createSocialSession((options) => {
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
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await session.refresh();
    expect(session.getSnapshot()).toMatchObject({
      actor: { id: credentials.actorUrl },
      busy: false,
      error: 'Offline',
    });
  });

  it('rejects overlapping writes and does not refresh an unconfirmed failed post', async () => {
    const posting = deferred<unknown>();
    const active = gateway();
    active.publishNote = () => posting.promise;
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    const first = session.publish('draft');
    await expect(session.publish('duplicate')).rejects.toThrow();
    posting.reject(new Error('Rejected'));
    await expect(first).rejects.toThrow('Rejected');
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().busy).toBe(false);
  });

  it('keeps an accepted post successful when its subsequent timeline refresh fails', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await expect(session.publish('published')).resolves.toBeUndefined();
    expect(session.getSnapshot()).toMatchObject({ busy: false, notice: '게시되었습니다.' });
    expect(session.getSnapshot().error).not.toBe('');
    expect(active.publishNote).toHaveBeenCalledTimes(1);
  });

  it('does not hydrate or update notices after disconnecting during publication', async () => {
    const posting = deferred<unknown>();
    const active = gateway();
    active.publishNote = () => posting.promise;
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    const publication = session.publish('draft');
    session.disconnect();
    posting.resolve(undefined);
    await publication;
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      timeline: undefined,
      busy: false,
      notice: '',
      error: '',
    });
  });
  it('does not release the new session lock when an old refresh fails late', async () => {
    const oldRefresh = deferred<Timeline>();
    const newConnection = deferred<Timeline>();
    const firstGateway = gateway();
    let connections = 0;
    const session = createSocialSession(() =>
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
    expect(session.getSnapshot()).toMatchObject({ busy: true, error: '', actor: undefined });
    newConnection.resolve(timeline('https://new.test/me'));
    await connecting;
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      actor: { id: 'https://new.test/me' },
    });
  });

  it('recovers from gateway construction errors for a subsequent connection', async () => {
    let attempts = 0;
    const session = createSocialSession(() => {
      if (++attempts === 1) throw new Error('Invalid actor URL');
      return gateway();
    });
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({ busy: false, error: 'Invalid actor URL' });
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      error: '',
      actor: { id: credentials.actorUrl },
    });
  });

  it('forwards text and reply unchanged and updates the actor from refreshed state', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    const reply = note({ author: credentials.actorUrl });
    active.loadTimeline = async () => ({
      ...timeline(),
      actor: { ...timeline().actor, name: 'Updated name' },
    });
    await session.publish('  hello  ', reply);
    expect(active.publishNote).toHaveBeenCalledWith('  hello  ', reply);
    expect(session.getSnapshot().actor?.name).toBe('Updated name');
  });
  it('exposes failed publication globally and clears it on the next attempt', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.publishNote = async () => {
      throw new Error('Publication failed');
    };
    await expect(session.publish('draft')).rejects.toThrow('Publication failed');
    expect(session.getSnapshot()).toMatchObject({ error: 'Publication failed', busy: false });
    const retry = deferred<unknown>();
    active.publishNote = () => retry.promise;
    const publishing = session.publish('draft');
    expect(session.getSnapshot()).toMatchObject({ error: '', busy: true });
    retry.resolve(undefined);
    await publishing;
  });

  it('does not expose an old publication failure after disconnecting and reconnecting', async () => {
    const posting = deferred<unknown>();
    const old = gateway();
    old.publishNote = () => posting.promise;
    let connections = 0;
    const session = createSocialSession(() => (++connections === 1 ? old : gateway()));
    await session.connect(credentials);
    const publication = session.publish('draft');
    session.disconnect();
    await session.connect(credentials);
    posting.reject(new Error('Old publication failed'));
    await expect(publication).rejects.toThrow('Old publication failed');
    expect(session.getSnapshot()).toMatchObject({
      error: '',
      busy: false,
      actor: { id: credentials.actorUrl },
    });
  });

  it('reports demo mode and the last successful load time', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T01:02:03Z') });
    try {
      const session = createSocialSession(() => ({ ...gateway(), demo: true }));
      expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
      await session.connect({ actorUrl: 'demo' });
      expect(session.getSnapshot()).toMatchObject({
        demo: true,
        loadedAt: '2026-09-09T01:02:03.000Z',
      });
      vi.setSystemTime(new Date('2026-09-09T01:05:00Z'));
      await session.refresh();
      expect(session.getSnapshot().loadedAt).toBe('2026-09-09T01:05:00.000Z');
      session.disconnect();
      expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not set loadedAt or demo for a failed connection', async () => {
    const active = { ...gateway(), demo: true };
    active.loadTimeline = async () => {
      throw new Error('Connection failed');
    };
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    expect(session.getSnapshot()).toMatchObject({ demo: false, loadedAt: undefined });
  });

  it('clears an earlier notice on refresh and connect', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    await session.publish('hello');
    expect(session.getSnapshot().notice).toBe('게시되었습니다.');
    await session.refresh();
    expect(session.getSnapshot().notice).toBe('');
    await session.publish('again');
    await session.connect(credentials);
    expect(session.getSnapshot().notice).toBe('');
  });

  it('reacts, then reloads the timeline like publish', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    const target = note();
    await expect(session.react(target, 'like', true)).resolves.toBeUndefined();
    expect(active.react).toHaveBeenCalledWith('like', target);
    expect(active.loadTimeline).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      error: '',
      notice: '좋아요를 남겼습니다.',
    });
    await session.react(target, 'share', true);
    expect(active.react).toHaveBeenLastCalledWith('share', target);
    expect(session.getSnapshot().notice).toBe('공유했습니다.');
  });

  it('undoes only this actor’s own reaction of that kind', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
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
    expect(active.undoReaction).toHaveBeenCalledWith('https://example.test/l2');
    expect(session.getSnapshot().notice).toBe('좋아요를 취소했습니다.');
    await session.react(target, 'share', false);
    expect(active.undoReaction).toHaveBeenLastCalledWith('https://example.test/a1');
    await expect(session.react(note(), 'like', false)).rejects.toThrow();
    expect(active.undoReaction).toHaveBeenCalledTimes(2);
  });

  it('surfaces a rejected Undo as a plain message and keeps the loaded state', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.undoReaction = async () => {
      // Transport errors carry a typed status; the message text is not parsed.
      throw Object.assign(new Error('Server rejected the Undo activity.'), { status: 400 });
    };
    const target = note({
      likedBy: [credentials.actorUrl],
      reactions: [
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l' },
      ],
    });
    await expect(session.react(target, 'like', false)).rejects.toThrow('취소 요청을 거절');
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      notice: '',
      actor: { id: credentials.actorUrl },
    });
    expect(session.getSnapshot().error).toBe(
      '서버가 취소 요청을 거절했습니다. 이 서버는 좋아요/공유 취소를 지원하지 않을 수 있어요. (400)',
    );
    expect(session.getSnapshot().timeline).toBeDefined();
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
  });

  it('passes a non-HTTP Undo failure through even when its message contains a number', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.undoReaction = async () => {
      throw new Error('Request timed out after 30000 ms (code 503?)');
    };
    const target = note({
      likedBy: [credentials.actorUrl],
      reactions: [
        { kind: 'like', actor: credentials.actorUrl, activity: 'https://example.test/l' },
      ],
    });
    await expect(session.react(target, 'like', false)).rejects.toThrow('timed out');
    expect(session.getSnapshot().error).toBe('Request timed out after 30000 ms (code 503?)');
  });

  it('keeps an accepted reaction successful when the reload fails', async () => {
    const active = gateway();
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    active.loadTimeline = async () => {
      throw new Error('Offline');
    };
    await expect(session.react(note(), 'share', true)).resolves.toBeUndefined();
    expect(session.getSnapshot().notice).toBe('공유했습니다.');
    expect(session.getSnapshot().error).not.toBe('');
  });

  it('rejects reactions while another request is running or without a connection', async () => {
    const session = createSocialSession(() => gateway());
    await expect(session.react(note(), 'like', true)).rejects.toThrow('연결');
    const posting = deferred<unknown>();
    const active = gateway();
    active.publishNote = () => posting.promise;
    const busySession = createSocialSession(() => active);
    await busySession.connect(credentials);
    const publishing = busySession.publish('draft');
    await expect(busySession.react(note(), 'like', true)).rejects.toThrow('진행 중');
    expect(active.react).not.toHaveBeenCalled();
    posting.resolve(undefined);
    await publishing;
  });

  it('propagates the demo gateway error when reacting', async () => {
    const active = { ...gateway(), demo: true };
    active.react = async () => {
      throw new Error('예시 공간에서는 게시할 수 없습니다. 계정을 연결해주세요.');
    };
    const session = createSocialSession(() => active);
    await session.connect({ actorUrl: 'demo' });
    await expect(session.react(note(), 'like', true)).rejects.toThrow('예시 공간');
    expect(session.getSnapshot().error).toContain('예시 공간');
  });

  it('does not reload or notify after disconnecting during a reaction', async () => {
    const reacting = deferred<unknown>();
    const active = gateway();
    active.react = () => reacting.promise;
    const session = createSocialSession(() => active);
    await session.connect(credentials);
    const reaction = session.react(note(), 'like', true);
    session.disconnect();
    reacting.resolve(undefined);
    await reaction;
    expect(active.loadTimeline).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      actor: undefined,
      busy: false,
      notice: '',
      error: '',
    });
  });
});
