import { describe, expect, it, vi } from 'vitest';
import type { TimelineNote } from '../domain/social';
import type { SocialSessionSnapshot } from '../application/social-session';
import type { Preferences } from './ports';
import { createFeedViewModel, type FeedSession, type FocusPort } from './feed-view-model';

const me = 'https://social.example/users/me';
const base = { announcedBy: [], likedBy: [], reactions: [], mentions: [] };
const notes: TimelineNote[] = [
  { ...base, id: 'n1', author: me, content: '<p>mine</p>' },
  {
    ...base,
    id: 'n2',
    author: 'https://social.example/users/bob',
    content: 'reply',
    inReplyTo: 'n1',
    published: '2026-09-02T00:00:00Z',
  },
  { ...base, id: 'n3', author: 'https://social.example/users/cy', content: 'hi', mentions: [me] },
  {
    ...base,
    id: 'n4',
    author: 'https://social.example/users/cy',
    content: 'orphan',
    inReplyTo: 'gone',
  },
  {
    ...base,
    id: 'n5',
    author: me,
    content: 'self',
    inReplyTo: 'n1',
    published: '2026-09-01T00:00:00Z',
  },
];
const timeline = () => ({
  actor: { id: me, inbox: `${me}/inbox`, outbox: `${me}/outbox` },
  notes,
  diagnostics: { ignored: 0, rejected: 0 },
  activities: [],
});

/** Minimal session double: applies snapshot patches synchronously and records calls. */
function fakeSession(overrides: Partial<FeedSession> = {}) {
  let snapshot: SocialSessionSnapshot = { demo: false, busy: false, error: '', notice: '' };
  const listeners = new Set<(s: SocialSessionSnapshot) => void>();
  const update = (patch: Partial<SocialSessionSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  };
  const session: FeedSession & { update: typeof update } = {
    update,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    async connect(credentials) {
      const demo = credentials.actorUrl === 'demo';
      update({ busy: true, error: '', notice: '' });
      const loaded = timeline();
      update({
        actor: loaded.actor,
        timeline: loaded,
        demo,
        loadedAt: '2026-09-08T00:00:00Z',
        busy: false,
      });
    },
    async refresh() {
      update({ busy: true, notice: '' });
      update({ busy: false });
    },
    async publish() {
      update({ busy: true, notice: '', error: '' });
      update({ notice: '게시되었습니다.', busy: false });
    },
    async react() {
      update({ busy: true, notice: '', error: '' });
      update({ notice: '좋아요를 남겼습니다.', busy: false });
    },
    disconnect() {
      update({
        actor: undefined,
        timeline: undefined,
        demo: false,
        busy: false,
        error: '',
        notice: '',
      });
    },
    ...overrides,
  };
  return session;
}
function fakePreferences(
  store: Record<string, string> = {},
  writable = true,
): Preferences & { store: Record<string, string> } {
  return {
    store,
    read: (key) => store[key] || '',
    write(key, value) {
      if (!writable) return false;
      store[key] = value;
      return true;
    },
    saved(actor) {
      try {
        return JSON.parse(store[`saved.${actor}`] || '[]');
      } catch {
        return [];
      }
    },
  };
}
function focusPort() {
  return {
    focusReplyComposer: vi.fn<FocusPort['focusReplyComposer']>(),
    focusMainComposer: vi.fn<FocusPort['focusMainComposer']>(),
    focusHeading: vi.fn<FocusPort['focusHeading']>(),
    restore: vi.fn<FocusPort['restore']>(),
  } satisfies FocusPort;
}
async function connected(
  session = fakeSession(),
  preferences = fakePreferences(),
  focus = focusPort(),
) {
  const vm = createFeedViewModel(session, preferences, focus);
  await vm.connect(me, 'secret');
  return { vm, session, preferences, focus };
}

describe('feed view model', () => {
  it('connects, remembers the actor and restores saved links from preferences', async () => {
    const preferences = fakePreferences({ [`saved.${me}`]: JSON.stringify(['n2']) });
    const { vm } = await connected(fakeSession(), preferences);
    expect(preferences.store.actor).toBe(me);
    expect(vm.getSnapshot().saved).toEqual(['n2']);
    expect(vm.getSnapshot().title).toBe('타임라인');
    expect(vm.getSnapshot().notes).toHaveLength(5);
  });

  it('does not remember the demo actor as a real account preference', async () => {
    const preferences = fakePreferences();
    const vm = createFeedViewModel(fakeSession(), preferences, focusPort());
    await vm.connect('demo', '');
    expect(vm.getSnapshot().demo).toBe(true);
    expect(preferences.store).toEqual({});
  });

  it('derives the replies view from replies to my notes and mentions, excluding my own notes', async () => {
    const { vm } = await connected();
    vm.navigate('replies');
    expect(vm.getSnapshot().title).toBe('나에게 온 답글');
    expect(vm.getSnapshot().notes.map((note) => note.id)).toEqual(['n2', 'n3']);
    expect(vm.repliesCount('n1')).toBe(2);
  });

  it('navigate resets the thread and query and clears the save notice', async () => {
    const { vm } = await connected();
    vm.setQuery('reply');
    vm.openThread(notes[1], 120);
    vm.toggleSave(notes[1]);
    expect(vm.getSnapshot().notice).toContain('저장했습니다');
    vm.navigate('mine');
    expect(vm.getSnapshot()).toMatchObject({
      view: 'mine',
      query: '',
      thread: undefined,
      notice: '',
    });
    expect(vm.getSnapshot().notes.map((note) => note.id)).toEqual(['n1', 'n5']);
  });

  it('toggleSave persists under saved.<actor> and reports the right notice', async () => {
    const { vm, preferences } = await connected();
    vm.toggleSave(notes[0]);
    expect(preferences.store[`saved.${me}`]).toBe(JSON.stringify(['n1']));
    expect(vm.getSnapshot().notice).toBe(
      '글 링크를 이 브라우저에 저장했습니다. 본문은 보관하지 않습니다.',
    );
    vm.toggleSave(notes[0]);
    expect(preferences.store[`saved.${me}`]).toBe('[]');
    expect(vm.getSnapshot().notice).toBe('저장을 해제했습니다.');
  });

  it('explains when browser storage is unavailable', async () => {
    const { vm } = await connected(fakeSession(), fakePreferences({}, false));
    vm.toggleSave(notes[0]);
    expect(vm.getSnapshot().saved).toEqual(['n1']);
    expect(vm.getSnapshot().notice).toContain('브라우저 저장소를 사용할 수 없어');
  });

  it('keeps demo saves in memory with a 미리보기 notice and derives demo from the snapshot', async () => {
    const preferences = fakePreferences();
    const vm = createFeedViewModel(fakeSession(), preferences, focusPort());
    expect(vm.getSnapshot().demo).toBe(false);
    await vm.explore();
    expect(vm.getSnapshot().demo).toBe(true);
    vm.toggleSave(notes[0]);
    expect(preferences.store).toEqual({});
    expect(vm.getSnapshot().notice).toMatch(/^미리보기에서 저장을 체험했어요/);
    expect(vm.getSnapshot().saved).toEqual(['n1']);
  });

  it('lists saved links missing from the timeline', async () => {
    const preferences = fakePreferences({ [`saved.${me}`]: JSON.stringify(['old', 'n1']) });
    const { vm } = await connected(fakeSession(), preferences);
    expect(vm.getSnapshot().missingSaved).toEqual(['old']);
    vm.removeSaved('old');
    expect(vm.getSnapshot().missingSaved).toEqual([]);
    expect(preferences.store[`saved.${me}`]).toBe(JSON.stringify(['n1']));
  });

  it('closes the reply composer when publish resolves even if hydration set an error', async () => {
    const session = fakeSession({
      async publish() {
        session.update({ busy: true, notice: '', error: '' });
        session.update({
          notice: '게시되었습니다.',
          error: '게시되었지만 타임라인을 다시 불러오지 못했습니다.',
          busy: false,
        });
      },
    });
    const { vm, focus } = await connected(session);
    vm.chooseReply(notes[0]);
    expect(focus.focusReplyComposer).toHaveBeenCalledWith('n1');
    expect(vm.getSnapshot().reply?.id).toBe('n1');
    await vm.publish('hello', notes[0]);
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().error).toContain('게시되었지만');
  });

  it('keeps the reply composer open and surfaces the error when publish rejects', async () => {
    const session = fakeSession({
      async publish() {
        session.update({ error: '서버 오류 500' });
        throw new Error('서버 오류 500');
      },
    });
    const { vm } = await connected(session);
    vm.chooseReply(notes[0]);
    await expect(vm.publish('hello', notes[0])).rejects.toThrow('500');
    expect(vm.getSnapshot().reply?.id).toBe('n1');
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
  });

  it('ignores a publish rejection that arrives after disconnect and a new session', async () => {
    let reject: (error: Error) => void = () => {};
    const session = fakeSession({
      publish: () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    });
    const { vm } = await connected(session);
    const pending = vm.publish('hello');
    vm.disconnect();
    await vm.explore();
    reject(new Error('stale 500'));
    await expect(pending).rejects.toThrow('stale 500');
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().demo).toBe(true);
  });

  it('opens and closes threads through the focus port with the remembered scroll', async () => {
    const { vm, focus } = await connected();
    vm.openThread(notes[1], 340);
    expect(focus.focusHeading).toHaveBeenCalledTimes(1);
    expect(vm.getSnapshot()).toMatchObject({ title: '대화', thread: { id: 'n2' } });
    expect(vm.getSnapshot().parents.map((note) => note.id)).toEqual(['n1']);
    vm.openThread(notes[0], 900);
    // Conversation replies read oldest-first even though the timeline lists newest-first.
    expect(vm.getSnapshot().replies.map((note) => note.id)).toEqual(['n5', 'n2']);
    vm.closeThread();
    expect(focus.restore).toHaveBeenCalledWith('n2', 340);
    expect(vm.getSnapshot().thread).toBeUndefined();
  });

  it('reports a selected thread that disappeared and a parent that is not loaded', async () => {
    const { vm, session } = await connected();
    vm.openThread(notes[3]);
    expect(vm.getSnapshot().missingParent).toBe('gone');
    expect(vm.isParentLoaded(notes[3])).toBe(false);
    expect(vm.isParentLoaded(notes[1])).toBe(true);
    expect(vm.parentOf(notes[1])?.id).toBe('n1');
    session.update({ timeline: { ...timeline(), notes: notes.slice(0, 2) } });
    expect(vm.getSnapshot()).toMatchObject({
      thread: undefined,
      threadMissing: true,
      title: '대화',
    });
  });

  it('delegates reactions to the session with the toggled state and shows rejection errors', async () => {
    const react = vi.fn(async () => {
      throw new Error('서버가 취소 요청을 거절했습니다.');
    });
    const session = fakeSession({ react });
    const { vm } = await connected(session);
    const liked = { ...notes[0], likedBy: [me] };
    await vm.react(notes[0], 'like');
    expect(react).toHaveBeenCalledWith(notes[0], 'like', true);
    expect(vm.getSnapshot().actionError).toEqual({ n1: '서버가 취소 요청을 거절했습니다.' });
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().pending).toBeUndefined();
    await vm.react(liked, 'like');
    expect(react).toHaveBeenLastCalledWith(liked, 'like', false);
    await vm.react({ ...notes[0], announcedBy: [me] }, 'share');
    expect(react).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'n1' }), 'share', false);
    vm.navigate('all');
    expect(vm.getSnapshot().actionError).toEqual({});
  });

  it('keeps a reaction failure beside its note even when the session recorded it globally', async () => {
    const session = fakeSession({
      async react() {
        session.update({ busy: true, notice: '', error: '' });
        session.update({ busy: false, error: '미리보기에서는 좋아요·공유를 보낼 수 없어요.' });
        throw new Error('미리보기에서는 좋아요·공유를 보낼 수 없어요.');
      },
    });
    const { vm } = await connected(session);
    await vm.react(notes[0], 'like');
    expect(vm.getSnapshot().actionError.n1).toContain('미리보기');
    expect(vm.getSnapshot().error).toBe('');
    await vm.react(notes[1], 'share');
    expect(Object.keys(vm.getSnapshot().actionError)).toEqual(['n1', 'n2']);
    // Tapping the same note again clears its old message before the new attempt.
    await vm.react(notes[0], 'like');
    expect(vm.getSnapshot().actionError.n1).toContain('미리보기');
    await vm.refresh();
    expect(vm.getSnapshot().actionError).toEqual({});
  });

  it('marks the tapped reaction as pending while the session works', async () => {
    let release: () => void = () => {};
    const session = fakeSession({
      react: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const { vm } = await connected(session);
    const reacting = vm.react(notes[0], 'share');
    expect(vm.getSnapshot().pending).toEqual({ id: 'n1', kind: 'share' });
    release();
    await reacting;
    expect(vm.getSnapshot().pending).toBeUndefined();
  });

  it('dismisses a page-level error until the next request', async () => {
    const { vm, session } = await connected();
    session.update({ error: '서버 오류 500' });
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
    vm.dismissError();
    expect(vm.getSnapshot().error).toBe('');
    session.update({ busy: true, error: '' });
    session.update({ busy: false, error: '서버 오류 500' });
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
  });

  it('closes the inline reply when switching lists but keeps its draft', async () => {
    const { vm } = await connected();
    vm.chooseReply(notes[0]);
    vm.setDraft('n1', '초안');
    vm.navigate('saved');
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.draft('n1')).toBe('초안');
  });

  it('shows only the most recent notice', async () => {
    const { vm, session } = await connected();
    vm.toggleSave(notes[0]);
    expect(vm.getSnapshot().notice).toContain('저장했습니다');
    await vm.publish('new post');
    expect(vm.getSnapshot().notice).toBe('게시되었습니다.');
    vm.toggleSave(notes[1]);
    expect(vm.getSnapshot().notice).toContain('저장했습니다');
    await vm.refresh();
    expect(vm.getSnapshot().notice).toBe('');
    session.update({ notice: '좋아요를 남겼습니다.' });
    vm.toggleSave(notes[2]);
    session.update({ notice: '공유했습니다.' });
    expect(vm.getSnapshot().notice).toBe('공유했습니다.');
  });

  it('disconnect resets everything', async () => {
    const { vm, focus } = await connected();
    vm.navigate('saved');
    vm.setQuery('x');
    vm.setDraft('new', 'draft');
    vm.chooseReply(notes[0]);
    vm.openThread(notes[1], 50);
    vm.disconnect();
    expect(vm.getSnapshot()).toMatchObject({
      actor: undefined,
      view: 'all',
      query: '',
      saved: [],
      reply: undefined,
      thread: undefined,
      threadMissing: false,
      drafts: {},
      notice: '',
      title: '타임라인',
    });
    vm.closeThread();
    expect(focus.restore).toHaveBeenLastCalledWith(undefined, 0);
  });

  it('compose leaves the thread and focuses the main composer; drafts are keyed', async () => {
    const { vm, focus } = await connected();
    vm.openThread(notes[0]);
    vm.setDraft('n1', 'partial');
    vm.compose();
    expect(vm.getSnapshot().thread).toBeUndefined();
    expect(focus.focusMainComposer).toHaveBeenCalled();
    expect(vm.draft('n1')).toBe('partial');
    expect(vm.draft('new')).toBe('');
  });

  it('exposes loading while the first timeline is busy and stops notifying after dispose', () => {
    const session = fakeSession();
    const listener = vi.fn();
    const vm = createFeedViewModel(session, fakePreferences(), focusPort());
    vm.subscribe(listener);
    session.update({ busy: true });
    expect(vm.getSnapshot().loading).toBe(true);
    vm.dispose();
    session.update({ busy: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
