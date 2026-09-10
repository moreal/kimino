import { describe, expect, it, vi } from 'vitest';
import type { TimelineNote } from '../domain/social';
import {
  DEMO_ACTOR,
  SessionError,
  type SocialSessionSnapshot,
} from '../application/social-session';
import type { Preferences } from './ports';
import { createFeedViewModel, type FeedSession, type FocusPort } from './feed-view-model';
import { editKey } from './feed-selectors';

const me = 'https://social.example/users/me';
const base = {
  visibility: 'public' as const,
  attachments: [],
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
};
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
  deleted: [],
});

/** Minimal session double: applies snapshot patches synchronously and records calls. */
function fakeSession(overrides: Partial<FeedSession> = {}) {
  let snapshot: SocialSessionSnapshot = { demo: false, connecting: false, refreshing: false };
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
      const demo = credentials.actorUrl === DEMO_ACTOR;
      update({ connecting: true, error: undefined, notice: undefined });
      const loaded = timeline();
      update({
        actor: loaded.actor,
        timeline: loaded,
        demo,
        loadedAt: '2026-09-08T00:00:00Z',
        connecting: false,
      });
    },
    async refresh() {
      update({ notice: undefined, error: undefined, refreshing: true });
      update({ loadedAt: new Date().toISOString(), refreshing: false });
      return true;
    },
    async publish() {
      update({ notice: undefined, error: undefined });
      update({ notice: 'published' });
    },
    async react() {
      update({ notice: undefined, error: undefined });
      update({ notice: 'liked' });
    },
    async deleteNote(target) {
      update({ notice: undefined, error: undefined });
      const loaded = timeline();
      update({
        notice: 'deleted',
        timeline: { ...loaded, notes: loaded.notes.filter((n) => n.id !== target.id) },
      });
    },
    async editNote() {
      update({ notice: undefined, error: undefined });
      update({ notice: 'edited' });
    },
    disconnect() {
      update({
        actor: undefined,
        timeline: undefined,
        demo: false,
        connecting: false,
        error: undefined,
        notice: undefined,
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
    readSaved(actor) {
      try {
        return JSON.parse(store[`saved.${actor}`] || '[]');
      } catch {
        return [];
      }
    },
    writeSaved(actor, ids) {
      return this.write(`saved.${actor}`, JSON.stringify(ids));
    },
    readDensity() {
      return store.density === 'compact' ? 'compact' : 'comfortable';
    },
    writeDensity(density) {
      return this.write('density', density);
    },
    readRevealWarned() {
      return store.revealWarned === 'on';
    },
    writeRevealWarned(on) {
      return this.write('revealWarned', on ? 'on' : 'off');
    },
  };
}
function focusPort() {
  return {
    focusReplyComposer: vi.fn<FocusPort['focusReplyComposer']>(),
    focusEditComposer: vi.fn<FocusPort['focusEditComposer']>(),
    focusList: vi.fn<FocusPort['focusList']>(),
    focusReplyButton: vi.fn<FocusPort['focusReplyButton']>(),
    focusMainComposer: vi.fn<FocusPort['focusMainComposer']>(),
    focusHeading: vi.fn<FocusPort['focusHeading']>(),
    restore: vi.fn<FocusPort['restore']>(),
    focusCard: vi.fn<FocusPort['focusCard']>(),
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
    await vm.connect(DEMO_ACTOR, '');
    expect(vm.getSnapshot().demo).toBe(true);
    expect(preferences.store).toEqual({});
  });

  it('derives the replies view from replies to my notes and mentions, excluding my own notes', async () => {
    const { vm } = await connected();
    vm.navigate('replies');
    expect(vm.getSnapshot().title).toBe('받은 답글');
    expect(vm.getSnapshot().notes.map((note) => note.id)).toEqual(['n2', 'n3']);
  });

  it('navigate resets the thread and query and clears the save notice', async () => {
    const { vm } = await connected();
    vm.setQuery('reply');
    vm.openThread(notes[1], 120);
    vm.toggleSave(notes[1]);
    expect(vm.getSnapshot().notice).toContain('저장했어요');
    vm.navigate('mine');
    expect(vm.getSnapshot()).toMatchObject({
      view: 'mine',
      query: '',
      focusedNoteId: undefined,
      notice: '',
    });
    expect(vm.getSnapshot().notes.map((note) => note.id)).toEqual(['n1', 'n5']);
  });

  it('toggleSave persists under saved.<actor> and reports the right notice', async () => {
    const { vm, preferences } = await connected();
    vm.toggleSave(notes[0]);
    expect(preferences.store[`saved.${me}`]).toBe(JSON.stringify(['n1']));
    expect(vm.getSnapshot().notice).toBe(
      '글 링크를 이 브라우저에 저장했어요. 본문은 보관하지 않아요.',
    );
    vm.toggleSave(notes[0]);
    expect(preferences.store[`saved.${me}`]).toBe('[]');
    expect(vm.getSnapshot().notice).toBe('저장을 해제했어요.');
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
    expect(vm.getSnapshot().notice).toMatch(/이 탭을 닫으면 초기화돼요/);
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
        session.update({ notice: undefined, error: undefined });
        session.update({
          notice: 'published',
          error: { kind: 'reload-failed', action: 'reply' },
        });
      },
    });
    const { vm, focus } = await connected(session);
    vm.chooseReply(notes[0]);
    expect(focus.focusReplyComposer).toHaveBeenCalledWith('n1');
    expect(vm.getSnapshot().reply?.id).toBe('n1');
    await vm.publish({ content: 'hello', visibility: 'public' }, notes[0]);
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().error).toContain('답글은 게시되었지만');
  });

  it('keeps the reply composer open and hands the failure to that composer when publish rejects', async () => {
    const failure = { kind: 'http', status: 500, detail: 'HTTP 500' } as const;
    const session = fakeSession({
      async publish() {
        session.update({ error: failure });
        throw new SessionError(failure);
      },
    });
    const { vm } = await connected(session);
    vm.chooseReply(notes[0]);
    await expect(vm.publish({ content: 'hello', visibility: 'public' }, notes[0])).rejects.toThrow(
      'http',
    );
    expect(vm.getSnapshot().reply?.id).toBe('n1');
    expect(vm.getSnapshot().composeError).toEqual({
      key: 'n1',
      text: '서버가 요청을 거부했어요 (500). 잠시 후 다시 시도해 주세요.',
      detail: 'HTTP 500',
    });
    // The same failure is not repeated in the page alert while the composer shows it.
    expect(vm.getSnapshot().error).toBe('');
    // Closing the reply takes its composer off screen; the page alert takes over.
    vm.dismissReply();
    expect(vm.getSnapshot().composeError).toBeUndefined();
    expect(vm.getSnapshot().error).toContain('(500)');
    expect(vm.getSnapshot().errorDetail).toBe('HTTP 500');
  });

  it('falls back to the page alert for a main-composer failure while a thread is open', async () => {
    const session = fakeSession({
      async publish() {
        throw new SessionError({ kind: 'unreachable', detail: 'TypeError: Failed to fetch' });
      },
    });
    const { vm } = await connected(session);
    const pending = vm.publish({ content: 'hello', visibility: 'public' });
    vm.openThread(notes[0]);
    await expect(pending).rejects.toThrow('unreachable');
    expect(vm.getSnapshot().composeError).toBeUndefined();
    expect(vm.getSnapshot().error).toContain('연결하지 못했');
    // Leaving the conversation is a navigation: the alert it showed is dismissed with it.
    vm.closeThread();
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().composeError).toBeUndefined();
  });

  it('dismisses the page alert on every navigation, not only on dismiss', async () => {
    const { vm, session } = await connected();
    const failure = { kind: 'gateway', message: '서버 오류 500' } as const;
    session.update({ error: failure });
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
    vm.navigate('mine');
    expect(vm.getSnapshot().error).toBe('');
    session.update({ error: undefined });
    session.update({ error: failure });
    vm.openThread(notes[0]);
    expect(vm.getSnapshot().error).toBe('');
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
    const pending = vm.publish({ content: 'hello', visibility: 'public' });
    vm.disconnect();
    await vm.explore();
    reject(new Error('stale 500'));
    await expect(pending).rejects.toThrow('stale 500');
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().composeError).toBeUndefined();
    expect(vm.getSnapshot().demo).toBe(true);
  });

  it('opens and closes threads through the focus port with the remembered scroll', async () => {
    const { vm, focus } = await connected();
    vm.openThread(notes[1], 340);
    expect(focus.focusHeading).toHaveBeenCalledTimes(1);
    expect(vm.getSnapshot()).toMatchObject({
      title: '대화',
      focusedNoteId: 'n2',
      conversation: { focused: { id: 'n2' } },
    });
    expect(vm.getSnapshot().conversation?.ancestors.map((note) => note.id)).toEqual(['n1']);
    vm.openThread(notes[0], 900);
    // Conversation replies read oldest-first even though the timeline lists newest-first.
    expect(
      vm
        .getSnapshot()
        .conversation?.descendants.filter((node) => node.depth === 0)
        .map((node) => node.note.id),
    ).toEqual(['n5', 'n2']);
    vm.closeThread();
    expect(focus.restore).toHaveBeenCalledWith('n2', 340);
    expect(vm.getSnapshot().focusedNoteId).toBeUndefined();
  });

  it('reports a selected thread that disappeared and a parent that is not loaded', async () => {
    const { vm, session } = await connected();
    vm.openThread(notes[3]);
    expect(vm.getSnapshot().conversation?.missingAncestor).toBe('gone');
    session.update({ timeline: { ...timeline(), notes: notes.slice(0, 2) } });
    expect(vm.getSnapshot()).toMatchObject({
      focusedNoteId: 'n4',
      conversation: undefined,
      threadMissing: true,
      title: '대화',
    });
  });

  it('delegates reactions to the session with the toggled state and shows rejection errors', async () => {
    const react = vi.fn(async () => {
      throw new SessionError({ kind: 'withdraw-rejected', code: 400 });
    });
    const session = fakeSession({ react });
    const { vm } = await connected(session);
    const liked = { ...notes[0], likedBy: [me] };
    await vm.react(notes[0], 'like');
    expect(react).toHaveBeenCalledWith(notes[0], 'like', true);
    expect(vm.getSnapshot().actionError).toEqual({
      n1: '서버가 좋아요/공유 취소를 거절했어요 (400). 잠시 후 다시 시도해주세요.',
    });
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().pending.size).toBe(0);
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
        const failure = { kind: 'read-only', action: 'react' } as const;
        session.update({ notice: undefined, error: undefined });
        session.update({ error: failure });
        throw new SessionError(failure);
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
    expect(vm.getSnapshot().pending.get('n1')).toBe('share');
    release();
    await reacting;
    expect(vm.getSnapshot().pending.size).toBe(0);
  });

  it('dismisses a page-level error until the next request', async () => {
    const failure = { kind: 'gateway', message: '서버 오류 500' } as const;
    const session = fakeSession({
      async publish() {
        session.update({ error: undefined });
        session.update({ error: failure });
      },
    });
    const { vm } = await connected(session);
    session.update({ error: failure });
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
    vm.dismissError();
    expect(vm.getSnapshot().error).toBe('');
    // The same words from a new request are news again.
    vm.openThread(notes[0]);
    await vm.publish({ content: 'x', visibility: 'public' });
    expect(vm.getSnapshot().error).toBe('서버 오류 500');
  });

  it('clears notes reported gone only after a refresh that actually read the server', async () => {
    let ran = false;
    let loads = 0;
    const session = fakeSession({
      async deleteNote() {
        session.update({ notice: 'deleted' });
      },
      async refresh() {
        if (!ran) return false;
        session.update({ refreshing: true });
        session.update({ loadedAt: `2026-09-08T00:0${++loads}:00Z`, refreshing: false });
        return true;
      },
    });
    const { vm } = await connected(session);
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    expect(vm.getSnapshot().all.some((n) => n.id === 'n1')).toBe(false);
    // The session folded this request into a read already on its way: nothing is assumed.
    await vm.refresh();
    expect(vm.getSnapshot().all.some((n) => n.id === 'n1')).toBe(false);
    ran = true;
    await vm.refresh();
    expect(vm.getSnapshot().all.some((n) => n.id === 'n1')).toBe(true);
  });

  it('keeps notes reported gone when the refresh read ran but failed', async () => {
    const session = fakeSession({
      async deleteNote() {
        session.update({ notice: 'deleted' });
      },
      async refresh() {
        session.update({ refreshing: true, error: undefined });
        session.update({ refreshing: false, error: { kind: 'unreachable', detail: 'x' } });
        return true;
      },
    });
    const { vm } = await connected(session);
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    await vm.refresh();
    expect(vm.getSnapshot().all.some((n) => n.id === 'n1')).toBe(false);
    expect(vm.getSnapshot().error).toContain('연결하지 못했');
  });

  it('keeps a revealed content warning open across reloads and closes it on disconnect', async () => {
    const { vm, session } = await connected();
    const revealed = (id: string) => vm.getSnapshot().revealed.has(id);
    expect(revealed('n1')).toBe(false);
    vm.toggleReveal('n1');
    expect(revealed('n1')).toBe(true);
    // A re-read replaces the notes; the reader's choice about this one stands.
    session.update({ timeline: timeline(), loadedAt: '2026-09-08T00:01:00Z' });
    await vm.refresh();
    vm.showMore();
    vm.navigate('mine');
    expect(revealed('n1')).toBe(true);
    vm.toggleReveal('n1');
    expect(revealed('n1')).toBe(false);
    vm.toggleReveal('n1');
    vm.disconnect();
    expect(revealed('n1')).toBe(false);
    expect(vm.getSnapshot().revealed.size).toBe(0);
  });

  it('marks only the note whose deletion is out, and ignores a second confirm on it', async () => {
    let release: () => void = () => {};
    const deleteNote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const session = fakeSession({ deleteNote });
    const { vm } = await connected(session);
    vm.askDelete(notes[0]);
    const deleting = vm.deleteNote(notes[0]);
    expect(vm.getSnapshot().deleting.has('n1')).toBe(true);
    expect(vm.getSnapshot().connecting).toBe(false);
    void vm.deleteNote(notes[0]);
    expect(deleteNote).toHaveBeenCalledTimes(1);
    release();
    await deleting;
    expect(vm.getSnapshot().deleting.size).toBe(0);
  });

  it('ignores a second tap on a reaction still out, but not one on another note', async () => {
    const releases: Array<() => void> = [];
    const react = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const session = fakeSession({ react });
    const { vm } = await connected(session);
    const first = vm.react(notes[0], 'like');
    void vm.react(notes[0], 'like');
    const second = vm.react(notes[1], 'share');
    expect(react).toHaveBeenCalledTimes(2);
    releases.forEach((release) => release());
    await Promise.all([first, second]);
    expect(vm.getSnapshot().pending.size).toBe(0);
  });

  it('opens a reply, an edit or a delete confirmation while a write is out', async () => {
    const session = fakeSession({ react: () => new Promise<void>(() => {}) });
    const { vm } = await connected(session);
    void vm.react(notes[1], 'like');
    vm.chooseReply(notes[1]);
    expect(vm.getSnapshot().reply?.id).toBe('n2');
    vm.startEdit(notes[0]);
    expect(vm.getSnapshot().editing?.id).toBe('n1');
    vm.askDelete(notes[0]);
    expect(vm.getSnapshot().confirmDelete).toBe('n1');
  });

  it('closes the inline reply when switching lists but keeps its draft', async () => {
    const { vm } = await connected();
    vm.chooseReply(notes[0]);
    vm.setDraft('n1', '초안');
    vm.navigate('saved');
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().drafts.n1).toBe('초안');
  });

  it('shows only the most recent notice', async () => {
    const { vm, session } = await connected();
    vm.toggleSave(notes[0]);
    expect(vm.getSnapshot().notice).toContain('저장했어요');
    await vm.publish({ content: 'new post', visibility: 'public' });
    expect(vm.getSnapshot().notice).toBe('게시됐어요.');
    vm.toggleSave(notes[1]);
    expect(vm.getSnapshot().notice).toContain('저장했어요');
    await vm.refresh();
    expect(vm.getSnapshot().notice).toBe('');
    session.update({ notice: 'liked' });
    vm.toggleSave(notes[2]);
    session.update({ notice: 'shared' });
    expect(vm.getSnapshot().notice).toBe('공유했어요.');
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
      focusedNoteId: undefined,
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
    expect(vm.getSnapshot().focusedNoteId).toBeUndefined();
    expect(focus.focusMainComposer).toHaveBeenCalled();
    expect(vm.getSnapshot().drafts.n1).toBe('partial');
    expect(vm.getSnapshot().drafts.new).toBeUndefined();
  });

  it('exposes loading while the first timeline is busy and stops notifying after dispose', () => {
    const session = fakeSession();
    const listener = vi.fn();
    const vm = createFeedViewModel(session, fakePreferences(), focusPort());
    vm.subscribe(listener);
    session.update({ connecting: true });
    expect(vm.getSnapshot().loading).toBe(true);
    vm.dispose();
    session.update({ connecting: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('compose options', () => {
  it('keeps warning and visibility per composer key and clears them once sent', async () => {
    const { vm } = await connected();
    vm.setComposeOptions('n1', { summary: '주의', visibility: 'followers' });
    expect(vm.getSnapshot().composeOptions.n1).toEqual({
      summary: '주의',
      visibility: 'followers',
    });
    expect(vm.getSnapshot().composeOptions.new).toBeUndefined();
    vm.navigate('saved');
    expect(vm.getSnapshot().composeOptions.n1?.visibility).toBe('followers');
    await vm.publish({ content: 'x', summary: '주의', visibility: 'followers' }, notes[0]);
    expect(vm.getSnapshot().composeOptions.n1).toBeUndefined();
  });

  it('dismissReply closes the composer, keeps a typed draft and says so once', async () => {
    const { vm, focus } = await connected();
    vm.chooseReply(notes[0]);
    expect(vm.dismissReply()).toBe(false);
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().notice).toBe('');
    expect(focus.focusReplyButton).toHaveBeenCalledWith('n1');
    vm.chooseReply(notes[0]);
    vm.setDraft('n1', '남겨둘 답글');
    expect(vm.dismissReply()).toBe(true);
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().drafts.n1).toBe('남겨둘 답글');
    expect(vm.getSnapshot().notice).toContain('초안');
  });

  it('setSaved replaces the saved list silently for a restored preview tab', async () => {
    const { vm, preferences } = await connected();
    vm.setSaved(['n2', 'n1']);
    expect(vm.getSnapshot().saved).toEqual(['n2', 'n1']);
    expect(vm.getSnapshot().notice).toBe('');
    expect(preferences.store).toEqual({ actor: me });
  });
});

describe('round 6b view state', () => {
  it('bumps noticeId for every notice so the same words re-announce', async () => {
    const { vm, session } = await connected();
    const first = vm.getSnapshot().noticeId;
    vm.toggleSave(notes[0]);
    const second = vm.getSnapshot().noticeId;
    expect(second).toBeGreaterThan(first);
    vm.toggleSave(notes[0]);
    vm.toggleSave(notes[0]);
    expect(vm.getSnapshot().noticeId).toBe(second + 2);
    await vm.publish({ content: 'x', visibility: 'public' });
    const published = vm.getSnapshot().noticeId;
    expect(published).toBe(second + 3);
    // The session clears and re-sets the same notice: still a fresh announcement.
    session.update({ notice: undefined });
    session.update({ notice: 'published' });
    expect(vm.getSnapshot().noticeId).toBe(published + 1);
    vm.chooseReply(notes[0]);
    vm.setDraft('n1', '남김');
    vm.dismissReply();
    expect(vm.getSnapshot().noticeId).toBe(published + 2);
  });

  it('reveals one more page of loaded notes and starts over when the list changes', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      ...base,
      id: `p${index}`,
      author: me,
      content: `note ${index}`,
    }));
    const session = fakeSession();
    const { vm } = await connected(session);
    session.update({ timeline: { ...timeline(), notes: many } });
    expect(vm.getSnapshot().visibleNotes).toHaveLength(50);
    expect(vm.getSnapshot().remaining).toBe(10);
    vm.showMore();
    expect(vm.getSnapshot().visibleNotes).toHaveLength(60);
    expect(vm.getSnapshot().remaining).toBe(0);
    // Anything that changes which notes the list holds starts the list at its first page.
    vm.showMore();
    vm.setQuery('note');
    expect(vm.getSnapshot().visibleNotes).toHaveLength(50);
    vm.showMore();
    vm.navigate('mine');
    expect(vm.getSnapshot().visibleNotes).toHaveLength(50);
    vm.showMore();
    vm.filterAuthor(me);
    expect(vm.getSnapshot().visibleNotes).toHaveLength(50);
    vm.showMore();
    vm.clearAuthorFilter();
    expect(vm.getSnapshot().visibleNotes).toHaveLength(50);
    // A refresh of the same list keeps the reader where they had read to.
    vm.showMore();
    await vm.refresh();
    expect(vm.getSnapshot().visibleNotes).toHaveLength(60);
  });

  it('owns the help dialog state', async () => {
    const { vm } = await connected();
    expect(vm.getSnapshot().helpOpen).toBe(false);
    vm.toggleHelp();
    expect(vm.getSnapshot().helpOpen).toBe(true);
    vm.toggleHelp();
    expect(vm.getSnapshot().helpOpen).toBe(false);
    vm.toggleHelp();
    vm.closeHelp();
    expect(vm.getSnapshot().helpOpen).toBe(false);
  });

  it('reads the density from preferences, persists changes and keeps it across sessions', async () => {
    const preferences = fakePreferences({ density: 'compact' });
    const { vm } = await connected(fakeSession(), preferences);
    expect(vm.getSnapshot().density).toBe('compact');
    vm.setDensity('comfortable');
    expect(preferences.store.density).toBe('comfortable');
    expect(vm.getSnapshot().density).toBe('comfortable');
    vm.setDensity('compact');
    vm.disconnect();
    expect(vm.getSnapshot().density).toBe('compact');
    await vm.explore();
    expect(vm.getSnapshot().density).toBe('compact');
  });

  it('keeps the warned-notes preference beside the density: written, read back, kept across sessions', async () => {
    const preferences = fakePreferences({ revealWarned: 'on' });
    const { vm } = await connected(fakeSession(), preferences);
    expect(vm.getSnapshot().revealWarned).toBe(true);
    vm.setRevealWarned(false);
    expect(preferences.store.revealWarned).toBe('off');
    expect(vm.getSnapshot().revealWarned).toBe(false);
    vm.setRevealWarned(true);
    vm.disconnect();
    expect(vm.getSnapshot().revealWarned).toBe(true);
    await vm.explore();
    expect(vm.getSnapshot().revealWarned).toBe(true);
  });

  it('describes an author from loaded notes and filters the list client-side', async () => {
    const { vm } = await connected();
    const cy = 'https://social.example/users/cy';
    vm.openThread(notes[0]);
    vm.openActor(cy);
    expect(vm.getSnapshot().actorSheet).toMatchObject({
      name: 'cy',
      handle: '@cy@social.example',
      host: 'social.example',
      loaded: 2,
      url: cy,
    });
    vm.openActor(me);
    expect(vm.getSnapshot().actorSheet?.name).toBe('me');
    vm.closeActor();
    expect(vm.getSnapshot().actorSheet).toBeUndefined();
    vm.openActor(cy);
    vm.filterAuthor(cy);
    expect(vm.getSnapshot().actorSheet).toBeUndefined();
    expect(vm.getSnapshot().focusedNoteId).toBeUndefined();
    expect(vm.getSnapshot().authorFilter?.handle).toBe('@cy@social.example');
    expect(vm.getSnapshot().notes.map((note) => note.id)).toEqual(['n3', 'n4']);
    vm.clearAuthorFilter();
    expect(vm.getSnapshot().notes).toHaveLength(5);
    vm.filterAuthor(cy);
    vm.navigate('mine');
    expect(vm.getSnapshot().authorFilter).toBeUndefined();
  });

  it('deletes only after an explicit confirmation, and never from the action row alone', async () => {
    const session = fakeSession();
    const deleteNote = vi.fn(session.deleteNote);
    session.deleteNote = deleteNote;
    const { vm, focus } = await connected(session);
    vm.askDelete(notes[0]);
    // Asking is not doing: nothing has been sent yet.
    expect(vm.getSnapshot().confirmDelete).toBe('n1');
    expect(deleteNote).not.toHaveBeenCalled();
    vm.cancelDelete();
    expect(vm.getSnapshot().confirmDelete).toBeUndefined();
    expect(deleteNote).not.toHaveBeenCalled();
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    expect(deleteNote).toHaveBeenCalledWith(notes[0]);
    expect(vm.getSnapshot().confirmDelete).toBeUndefined();
    expect(vm.getSnapshot().notes.map((note) => note.id)).not.toContain('n1');
    expect(vm.getSnapshot().notice).toContain('지웠어요');
    // The card that held focus is gone with it.
    expect(focus.focusList).toHaveBeenCalled();
  });

  it('closes the conversation of a deleted note with a reason and drops its drafts', async () => {
    const session = fakeSession();
    const { vm } = await connected(session);
    vm.setDraft('n1', '보내지 않은 답글');
    vm.setDraft(editKey('n1'), '보내지 않은 수정');
    vm.openThread(notes[0], 100);
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    expect(vm.getSnapshot().focusedNoteId).toBeUndefined();
    expect(vm.getSnapshot().threadMissing).toBe(false);
    expect(vm.getSnapshot().notice).toContain('대화를 닫았어요');
    expect(vm.getSnapshot().drafts.n1).toBeUndefined();
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBeUndefined();
  });

  it('keeps the note and explains beside it when the server refuses the deletion', async () => {
    const deleteNote = vi.fn(async () => {
      throw new SessionError({ kind: 'delete-rejected', code: 403 });
    });
    const { vm } = await connected(fakeSession({ deleteNote }));
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    expect(vm.getSnapshot().actionError).toEqual({
      n1: '서버가 삭제를 거절했어요 (403). 잠시 후 다시 시도해주세요.',
    });
    expect(vm.getSnapshot().notes.map((note) => note.id)).toContain('n1');
  });

  it('reopens the composer on my note with its stored words, warning and fixed scope', async () => {
    const session = fakeSession();
    const editNote = vi.fn(session.editNote);
    session.editNote = editNote;
    const { vm, focus } = await connected(session);
    const mine = { ...notes[0], content: '<p>첫 줄<br>둘째 줄</p>', summary: '경고' };
    vm.startEdit(mine);
    expect(vm.getSnapshot().editing?.id).toBe('n1');
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBe('첫 줄\n둘째 줄');
    expect(vm.getSnapshot().composeOptions[editKey('n1')]).toEqual({
      summary: '경고',
      visibility: 'public',
    });
    expect(focus.focusEditComposer).toHaveBeenCalledWith('n1');
    // An edit left unsent keeps its own words when the form is reopened.
    vm.setDraft(editKey('n1'), '고치는 중');
    vm.cancelEdit();
    expect(vm.getSnapshot().editing).toBeUndefined();
    vm.startEdit(mine);
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBe('고치는 중');
    await vm.submitEdit(mine, { content: '고친 글', summary: '새 경고', visibility: 'public' });
    expect(editNote).toHaveBeenCalledWith(mine, {
      content: '고친 글',
      summary: '새 경고',
      visibility: 'public',
    });
    expect(vm.getSnapshot().editing).toBeUndefined();
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBeUndefined();
    expect(vm.getSnapshot().composeOptions[editKey('n1')]).toBeUndefined();
    expect(vm.getSnapshot().notice).toBe('글을 수정했어요.');
  });

  it('keeps a rejected edit in its own composer with the draft intact', async () => {
    const editNote = vi.fn(async () => {
      throw new SessionError({ kind: 'http', status: 400, detail: 'why' });
    });
    const { vm } = await connected(fakeSession({ editNote }));
    vm.startEdit(notes[0]);
    await expect(
      vm.submitEdit(notes[0], { content: '고친 글', visibility: 'public' }),
    ).rejects.toBeInstanceOf(SessionError);
    expect(vm.getSnapshot().composeError).toMatchObject({ key: editKey('n1'), detail: 'why' });
    expect(vm.getSnapshot().error).toBe('');
    expect(vm.getSnapshot().editing?.id).toBe('n1');
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBe('mine');
  });

  it('leaveThread returns focus to the timeline card the conversation was opened from', async () => {
    const { vm, focus } = await connected();
    vm.openThread(notes[1], 200);
    vm.openThread(notes[0]);
    vm.leaveThread();
    expect(vm.getSnapshot().focusedNoteId).toBeUndefined();
    expect(focus.focusCard).toHaveBeenCalledWith('n2', 200);
    expect(focus.restore).not.toHaveBeenCalled();
  });
});

describe('round 11: stale cards, reopened edits and confirmed reactions', () => {
  const mine = { ...notes[0], content: '<p>서버가 가진 글</p>' };

  it('reopens the edit form with the stored words after a saved edit cleared the draft', async () => {
    const { vm } = await connected();
    vm.startEdit(mine);
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBe('서버가 가진 글');
    await vm.submitEdit(mine, { content: '고친 글', visibility: 'public' });
    // What the composer does on a successful submit: it writes its cleared value back.
    vm.setDraft(editKey('n1'), '');
    vm.startEdit(mine);
    expect(vm.getSnapshot().editing?.id).toBe('n1');
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBe('서버가 가진 글');
    expect(vm.getSnapshot().composeOptions[editKey('n1')]).toEqual({
      summary: '',
      visibility: 'public',
    });
  });

  it('closes the edit form and drops the card when the server no longer holds the note', async () => {
    const editNote = vi.fn(async () => {
      throw new SessionError({ kind: 'note-gone' });
    });
    const { vm } = await connected(fakeSession({ editNote }));
    vm.openThread(notes[0]);
    vm.startEdit(notes[0]);
    vm.setDraft(editKey('n1'), '고치는 중');
    await expect(
      vm.submitEdit(notes[0], { content: '고치는 중', visibility: 'public' }),
    ).rejects.toBeInstanceOf(SessionError);
    expect(vm.getSnapshot().editing).toBeUndefined();
    expect(vm.getSnapshot().drafts[editKey('n1')]).toBeUndefined();
    expect(vm.getSnapshot().all.map((note) => note.id)).not.toContain('n1');
    expect(vm.getSnapshot().notice).toBe('');
    // The explanation is a page alert now that the composer it belonged to is gone.
    expect(vm.getSnapshot().error).toContain('서버에 더 이상 없어요');
    // An explicit reload asks the server about it again.
    await vm.refresh();
    expect(vm.getSnapshot().all.map((note) => note.id)).toContain('n1');
  });

  it('keeps a deleted card off the list even when the read after the delete fails', async () => {
    const session = fakeSession({
      async deleteNote() {
        session.update({ notice: undefined, error: undefined });
        session.update({
          notice: 'deleted',
          error: { kind: 'reload-failed', action: 'delete' },
        });
      },
    });
    const { vm } = await connected(session);
    vm.askDelete(notes[0]);
    await vm.deleteNote(notes[0]);
    expect(vm.getSnapshot().all.map((note) => note.id)).not.toContain('n1');
    expect(vm.getSnapshot().error).toContain('글은 지워졌지만');
  });

  it('shows a confirmed reaction on its own control when the read after it fails', async () => {
    const session = fakeSession({
      async react() {
        session.update({ notice: undefined, error: undefined });
        session.update({
          notice: 'shared',
          error: { kind: 'reload-failed', action: 'share' },
        });
      },
    });
    const { vm } = await connected(session);
    await vm.react(notes[0], 'share');
    const shared = vm.getSnapshot().all.find((note) => note.id === 'n1')!;
    expect(shared.announcedBy).toEqual([me]);
    expect(vm.getSnapshot().error).toContain('공유는 되었지만');
    // A later successful read is newer than the confirmation and takes over from it.
    await vm.refresh();
    session.update({ timeline: timeline(), loadedAt: '2026-09-08T00:01:00Z' });
    expect(vm.getSnapshot().all.find((note) => note.id === 'n1')!.announcedBy).toEqual([]);
  });
});

describe('round 12: a stale confirmation and the persistence reminder', () => {
  it('takes the last confirmation off screen as soon as the next write begins', async () => {
    const { vm, session } = await connected();
    await vm.submitEdit(notes[0], { content: 'first edit', visibility: 'public' });
    expect(vm.getSnapshot().notice).toBe('글을 수정했어요.');
    // Opening the next edit is the start of the next write: the words that confirmed the
    // last one go with it rather than standing over the composer that replaced it.
    vm.startEdit(notes[4]);
    expect(vm.getSnapshot().notice).toBe('');
    // The write that follows still gets its own confirmation.
    await vm.submitEdit(notes[4], { content: 'second edit', visibility: 'public' });
    expect(vm.getSnapshot().notice).toBe('글을 수정했어요.');
    // Every other beginning does the same: a reply, a deletion, a reaction, a reload.
    for (const begin of [
      () => vm.chooseReply(notes[1]),
      () => vm.askDelete(notes[0]),
      () => void vm.react(notes[1], 'like'),
      () => void vm.refresh(),
    ]) {
      // As a real write does: the session clears its notice, then reports the new one.
      session.update({ notice: undefined });
      session.update({ notice: 'published' });
      const stale = vm.getSnapshot().notice;
      expect(stale).not.toBe('');
      begin();
      // Cleared, or replaced by what this action itself reports - never left standing.
      expect(vm.getSnapshot().notice).not.toBe(stale);
    }
  });

  it('offers the persistence reminder once per session, and never for the preview', async () => {
    const session = fakeSession();
    const vm = createFeedViewModel(session, fakePreferences(), focusPort());
    await vm.connect(me, 'secret');
    expect(vm.getSnapshot().sessionHint).toBe(true);
    vm.dismissSessionHint();
    expect(vm.getSnapshot().sessionHint).toBe(false);
    // Not again in this page session, however often the reader reconnects.
    vm.disconnect();
    await vm.connect(me, 'secret');
    expect(vm.getSnapshot().sessionHint).toBe(false);
  });

  it('stays quiet when the reader opted in, and for the preview', async () => {
    const opted = createFeedViewModel(fakeSession(), fakePreferences(), focusPort());
    await opted.connect(me, 'secret', true);
    expect(opted.getSnapshot().sessionHint).toBe(false);
    const preview = createFeedViewModel(fakeSession(), fakePreferences(), focusPort());
    await preview.explore();
    expect(preview.getSnapshot().sessionHint).toBe(false);
  });
});

describe('round 13: writes that keep the page responsive', () => {
  const liked = () => {
    const loaded = timeline();
    return {
      ...loaded,
      notes: loaded.notes.map((n) =>
        n.id === 'n1'
          ? {
              ...n,
              likedBy: [me],
              reactions: [
                { kind: 'like' as const, actor: me, activity: 'https://social.example/l1' },
              ],
            }
          : n,
      ),
    };
  };
  /** A session whose writes resolve at the 201 and leave the read after them in flight. */
  const responsive = () => {
    const session = fakeSession({
      async react() {
        session.update({ refreshing: false, notice: undefined, error: undefined });
        session.update({ notice: 'liked', refreshing: true });
      },
      async publish() {
        session.update({ refreshing: false, notice: undefined, error: undefined });
        session.update({ refreshing: true });
      },
      async editNote() {
        session.update({ refreshing: false, notice: undefined, error: undefined });
        session.update({ refreshing: true });
      },
    });
    return session;
  };

  it('exposes refreshing apart from connecting, and never as loading', async () => {
    const { vm, session } = await connected();
    session.update({ refreshing: true });
    expect(vm.getSnapshot()).toMatchObject({ connecting: false, refreshing: true, loading: false });
  });

  it('shows a confirmed like on its control at the 201, before any read carries it', async () => {
    const session = responsive();
    const { vm } = await connected(session);
    await vm.react(notes[0], 'like');
    const state = vm.getSnapshot();
    expect(state.refreshing).toBe(true);
    expect(state.pending.size).toBe(0);
    expect(state.all.find((n) => n.id === 'n1')!.likedBy).toEqual([me]);
    expect(state.notice).toBe('좋아요를 남겼어요.');
    // The read that follows carries the like; the local confirmation yields to it.
    session.update({ timeline: liked(), loadedAt: '2026-09-08T00:01:00Z', refreshing: false });
    expect(vm.getSnapshot().all.find((n) => n.id === 'n1')!.likedBy).toEqual([me]);
    expect(vm.getSnapshot().all.find((n) => n.id === 'n1')!.reactions).toHaveLength(1);
  });

  it('lets a second reaction begin on another card while the last read is still out', async () => {
    const session = responsive();
    const react = vi.spyOn(session, 'react');
    const { vm } = await connected(session);
    await vm.react(notes[0], 'like');
    expect(vm.getSnapshot().refreshing).toBe(true);
    await vm.react(notes[1], 'like');
    expect(react).toHaveBeenCalledTimes(2);
    expect(vm.getSnapshot().all.find((n) => n.id === 'n2')!.likedBy).toEqual([me]);
    expect(vm.getSnapshot().all.find((n) => n.id === 'n1')!.likedBy).toEqual([me]);
  });

  it('closes the reply composer at the 201 and confirms the post only once the read lands', async () => {
    const session = responsive();
    const { vm } = await connected(session);
    vm.chooseReply(notes[1]);
    vm.setDraft('n2', '답글');
    await vm.publish({ content: '답글', visibility: 'public' }, notes[1]);
    expect(vm.getSnapshot().reply).toBeUndefined();
    expect(vm.getSnapshot().refreshing).toBe(true);
    expect(vm.getSnapshot().notice).toBe('');
    session.update({
      timeline: timeline(),
      loadedAt: '2026-09-08T00:01:00Z',
      refreshing: false,
      notice: 'published',
    });
    expect(vm.getSnapshot().notice).toBe('게시됐어요.');
    // A read that fails instead leaves the per-action failure, and no confirmation.
    await vm.publish({ content: '또', visibility: 'public' });
    session.update({ refreshing: false, error: { kind: 'reload-failed', action: 'publish' } });
    expect(vm.getSnapshot().notice).toBe('');
    expect(vm.getSnapshot().error).toContain('게시되었지만');
  });

  it('closes the edit form at the 201 and says 수정했어요 only with the edited words on screen', async () => {
    const session = responsive();
    const { vm } = await connected(session);
    vm.startEdit(notes[0]);
    await vm.submitEdit(notes[0], { content: '고친 글', visibility: 'public' });
    expect(vm.getSnapshot().editing).toBeUndefined();
    expect(vm.getSnapshot().notice).toBe('');
    const loaded = timeline();
    session.update({
      timeline: {
        ...loaded,
        notes: loaded.notes.map((n) => (n.id === 'n1' ? { ...n, content: '고친 글' } : n)),
      },
      loadedAt: '2026-09-08T00:01:00Z',
      refreshing: false,
      notice: 'edited',
    });
    expect(vm.getSnapshot().all.find((n) => n.id === 'n1')!.content).toBe('고친 글');
    expect(vm.getSnapshot().notice).toBe('글을 수정했어요.');
  });
});

describe('round 14: per-note write state and a refresh that did not land', () => {
  const deferredVoid = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  };

  it('keeps each note’s deletion waiting on its own, and a failure clears only its own', async () => {
    const outs: Array<ReturnType<typeof deferredVoid>> = [];
    const session = fakeSession({
      deleteNote: () => {
        const out = deferredVoid();
        outs.push(out);
        return out.promise;
      },
    });
    const { vm } = await connected(session);
    const first = vm.deleteNote(notes[0]);
    const second = vm.deleteNote(notes[4]);
    expect([...vm.getSnapshot().deleting].sort()).toEqual(['n1', 'n5']);
    // The second deletion fails: its button comes back, the first stays waiting.
    outs[1].reject(new SessionError({ kind: 'unreachable', detail: 'x' }));
    await second;
    expect([...vm.getSnapshot().deleting]).toEqual(['n1']);
    expect(Object.keys(vm.getSnapshot().actionError)).toEqual(['n5']);
    outs[0].resolve();
    await first;
    expect(vm.getSnapshot().deleting.size).toBe(0);
    expect(vm.getSnapshot().all.some((n) => n.id === 'n1')).toBe(false);
  });

  it('marks a reaction pending per note, so one answered does not clear another still out', async () => {
    const outs: Array<ReturnType<typeof deferredVoid>> = [];
    const session = fakeSession({
      react: () => {
        const out = deferredVoid();
        outs.push(out);
        return out.promise;
      },
    });
    const { vm } = await connected(session);
    const like = vm.react(notes[0], 'like');
    const share = vm.react(notes[1], 'share');
    expect(vm.getSnapshot().pending.get('n1')).toBe('like');
    expect(vm.getSnapshot().pending.get('n2')).toBe('share');
    outs[0].resolve();
    await like;
    expect(vm.getSnapshot().pending.has('n1')).toBe(false);
    expect(vm.getSnapshot().pending.get('n2')).toBe('share');
    outs[1].reject(new SessionError({ kind: 'unreachable', detail: 'x' }));
    await share;
    expect(vm.getSnapshot().pending.size).toBe(0);
    expect(Object.keys(vm.getSnapshot().actionError)).toEqual(['n2']);
  });

  it('keeps inline errors that a write put there while a refresh was out and superseded', async () => {
    // The refresh starts a read; a reaction fails during it and the session drops that read
    // for the write's own. loadedAt never moved, so the failure beside the note stays.
    let release!: () => void;
    const session = fakeSession({
      refresh: () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
      async react() {
        const failure = { kind: 'unreachable', detail: 'x' } as const;
        session.update({ notice: undefined, error: undefined, refreshing: false });
        session.update({ error: failure });
        throw new SessionError(failure);
      },
    });
    const { vm } = await connected(session);
    const refreshing = vm.refresh();
    await vm.react(notes[0], 'like');
    expect(vm.getSnapshot().actionError.n1).toBeTruthy();
    release();
    await refreshing;
    expect(vm.getSnapshot().actionError.n1).toBeTruthy();
    // A refresh whose read did land clears them: the screen is newer than the failure.
    const landed = fakeSession({
      async refresh() {
        landed.update({ loadedAt: new Date().toISOString() });
        return true;
      },
      react: session.react,
    });
    const other = await connected(landed);
    await other.vm.react(notes[0], 'like');
    expect(other.vm.getSnapshot().actionError.n1).toBeTruthy();
    await other.vm.refresh();
    expect(other.vm.getSnapshot().actionError).toEqual({});
  });
});
