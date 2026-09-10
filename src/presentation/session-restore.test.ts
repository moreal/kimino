import { describe, expect, it, vi } from 'vitest';
import type { TimelineNote } from '../domain/social';
import type { FeedView } from './feed';
import { DEMO_ACTOR } from '../application/social-session';
import {
  createPersistence,
  parseStoredSession,
  restoredAccount,
  shouldOfferSessionHint,
  type PersistedFeed,
  type SessionStore,
  type StoredSession,
} from './session-restore';

describe('parseStoredSession', () => {
  it('accepts a complete record and falls back to the timeline for unknown views', () => {
    expect(
      parseStoredSession({ actorUrl: 'https://a.example/u', token: 't', view: 'mine' }),
    ).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'mine' });
    expect(parseStoredSession({ actorUrl: 'https://a.example/u', token: 't', view: 'x' })).toEqual({
      actorUrl: 'https://a.example/u',
      token: 't',
      view: 'all',
    });
  });
  it('keeps saved note ids only when they are a list of strings', () => {
    expect(
      parseStoredSession({ actorUrl: 'demo', token: '', view: 'all', saved: ['a', 1] }),
    ).toEqual({ actorUrl: 'demo', token: '', view: 'all', saved: ['a'] });
    expect(parseStoredSession({ actorUrl: 'demo', token: '', view: 'all', saved: 'a' })).toEqual({
      actorUrl: 'demo',
      token: '',
      view: 'all',
    });
  });
  it('keeps the open conversation only as a non-empty string', () => {
    expect(
      parseStoredSession({
        actorUrl: 'https://a.example/u',
        token: 't',
        view: 'all',
        thread: 'n1',
      }),
    ).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'all', thread: 'n1' });
    expect(
      parseStoredSession({ actorUrl: 'https://a.example/u', token: 't', view: 'all', thread: 3 }),
    ).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'all' });
  });
  it('rejects malformed values', () => {
    expect(parseStoredSession(undefined)).toBeUndefined();
    expect(parseStoredSession('token')).toBeUndefined();
    expect(parseStoredSession({ actorUrl: '', token: 't' })).toBeUndefined();
    expect(parseStoredSession({ actorUrl: 'https://a.example', token: 3 })).toBeUndefined();
  });
});

describe('shouldOfferSessionHint', () => {
  const base = { connected: true, demo: false, remembered: false, offered: false };
  it('offers the reminder once, and only for an account that did not opt in', () => {
    expect(shouldOfferSessionHint(base)).toBe(true);
    // Nothing to remind about: the tab already keeps this session.
    expect(shouldOfferSessionHint({ ...base, remembered: true })).toBe(false);
    // The preview has no token to lose.
    expect(shouldOfferSessionHint({ ...base, demo: true })).toBe(false);
    // A failed connect says nothing about reloads.
    expect(shouldOfferSessionHint({ ...base, connected: false })).toBe(false);
    // Said once per page session, however often the reader reconnects.
    expect(shouldOfferSessionHint({ ...base, offered: true })).toBe(false);
  });
});

describe('createPersistence', () => {
  const note = { id: 'n1' } as TimelineNote;
  function fakeStore(initial?: StoredSession) {
    let record = initial;
    const store: SessionStore & { record: () => StoredSession | undefined } = {
      record: () => record,
      read: () => record,
      write: vi.fn((next: StoredSession) => {
        record = next;
        return true;
      }),
      clear: vi.fn(() => {
        record = undefined;
      }),
    };
    return store;
  }
  /** A feed double: connect/explore succeed unless `fail`; saves toggle in memory. */
  function fakeFeed(fail = false) {
    const all = [note, { id: 'n2' } as TimelineNote];
    let snapshot = {
      actor: undefined as unknown,
      demo: false,
      saved: [] as string[],
      view: 'all' as FeedView,
      all,
    };
    const feed: PersistedFeed & { calls: string[] } = {
      calls: [],
      getSnapshot: () => snapshot,
      async connect(url) {
        feed.calls.push(`connect ${url}`);
        if (!fail) snapshot = { actor: { id: url }, demo: false, saved: [], view: 'all', all };
      },
      async explore() {
        feed.calls.push('explore');
        if (!fail) snapshot = { actor: { id: 'demo' }, demo: true, saved: [], view: 'all', all };
      },
      openThread(target, scrollY) {
        feed.calls.push(`openThread ${target.id}${scrollY === undefined ? '' : ` ${scrollY}`}`);
      },
      closeThread() {
        feed.calls.push('closeThread');
      },
      leaveThread() {
        feed.calls.push('leaveThread');
      },
      navigate(view) {
        feed.calls.push(`navigate ${view}`);
        snapshot = { ...snapshot, view };
      },
      setSaved(ids) {
        feed.calls.push(`setSaved ${ids.join(',')}`);
        snapshot = { ...snapshot, saved: ids };
      },
      toggleSave(target) {
        snapshot = {
          ...snapshot,
          saved: snapshot.saved.includes(target.id)
            ? snapshot.saved.filter((id) => id !== target.id)
            : [...snapshot.saved, target.id],
        };
      },
      removeSaved(id) {
        snapshot = { ...snapshot, saved: snapshot.saved.filter((saved) => saved !== id) };
      },
      disconnect() {
        feed.calls.push('disconnect');
        snapshot = { actor: undefined, demo: false, saved: [], view: 'all', all };
      },
    };
    return feed;
  }

  it('writes nothing for an account unless the person opted in', async () => {
    const store = fakeStore();
    const feed = fakeFeed();
    const persistence = createPersistence(feed, store);
    await persistence.connect('https://a.example/u', 't', false);
    persistence.navigate('mine');
    expect(store.record()).toBeUndefined();
    await persistence.connect('https://a.example/u', 't', true);
    expect(store.record()).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'all' });
    persistence.navigate('saved');
    expect(store.record()?.view).toBe('saved');
    // An account's saves never enter the tab record.
    persistence.toggleSave(note);
    expect(store.record()?.saved).toBeUndefined();
    persistence.disconnect();
    expect(store.record()).toBeUndefined();
    expect(feed.calls).toContain('disconnect');
  });

  it('does not remember a connection that failed', async () => {
    const store = fakeStore();
    const persistence = createPersistence(fakeFeed(true), store);
    await persistence.connect('https://a.example/u', 't', true);
    expect(store.record()).toBeUndefined();
  });

  it('always remembers the preview with its list and saves, and forgets on exit', async () => {
    const store = fakeStore();
    const persistence = createPersistence(fakeFeed(), store);
    await persistence.explore();
    expect(store.record()).toEqual({ actorUrl: 'demo', token: '', view: 'all' });
    persistence.toggleSave(note);
    expect(store.record()?.saved).toEqual(['n1']);
    persistence.navigate('saved');
    expect(store.record()).toEqual({ actorUrl: 'demo', token: '', view: 'saved', saved: ['n1'] });
    persistence.removeSaved('n1');
    expect(store.record()?.saved).toBeUndefined();
    persistence.disconnect();
    expect(store.record()).toBeUndefined();
  });

  it('restores a remembered account with its view, and a remembered preview with its saves', async () => {
    const account = fakeFeed();
    await createPersistence(
      account,
      fakeStore({ actorUrl: 'https://a.example/u', token: 't', view: 'replies' }),
    ).restore();
    expect(account.calls).toEqual(['connect https://a.example/u', 'navigate replies']);
    const preview = fakeFeed();
    await createPersistence(
      preview,
      fakeStore({ actorUrl: 'demo', token: '', view: 'all', saved: ['n1', 'n2'] }),
    ).restore();
    expect(preview.calls).toEqual(['explore', 'setSaved n1,n2']);
    expect(preview.getSnapshot().saved).toEqual(['n1', 'n2']);
    const nothing = fakeFeed();
    await createPersistence(nothing, fakeStore()).restore();
    expect(nothing.calls).toEqual([]);
    const failed = fakeFeed(true);
    await createPersistence(
      failed,
      fakeStore({ actorUrl: 'https://a.example/u', token: 't', view: 'mine' }),
    ).restore();
    expect(failed.calls).toEqual(['connect https://a.example/u']);
  });

  describe('the open conversation across a reload', () => {
    it('writes the open note into the record, clears it on leaving, and hands the scroll through', async () => {
      const store = fakeStore();
      const feed = fakeFeed();
      const persistence = createPersistence(feed, store);
      await persistence.connect('https://a.example/u', 't', true);
      persistence.openThread(note, 120);
      expect(feed.calls.at(-1)).toBe('openThread n1 120');
      expect(store.record()).toMatchObject({ view: 'all', thread: 'n1' });
      // Switching lists closes the conversation, so the record drops it with the list change.
      persistence.navigate('mine');
      expect(store.record()).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'mine' });
      persistence.openThread(note);
      persistence.closeThread();
      expect(store.record()?.thread).toBeUndefined();
      persistence.openThread(note);
      persistence.leaveThread();
      expect(store.record()?.thread).toBeUndefined();
      expect(feed.calls.filter((call) => call.startsWith('openThread'))).toHaveLength(3);
    });
    it('writes nothing for a tab that did not opt in', async () => {
      const store = fakeStore();
      const persistence = createPersistence(fakeFeed(), store);
      await persistence.connect('https://a.example/u', 't', false);
      persistence.openThread(note);
      expect(store.record()).toBeUndefined();
    });
    it('reopens the conversation after a restore only while its note is loaded', async () => {
      const loaded = fakeFeed();
      const kept = fakeStore({
        actorUrl: 'https://a.example/u',
        token: 't',
        view: 'mine',
        thread: 'n2',
      });
      await createPersistence(loaded, kept).restore();
      expect(loaded.calls).toEqual([
        'connect https://a.example/u',
        'navigate mine',
        'openThread n2',
      ]);
      expect(kept.record()?.thread).toBe('n2');
      const gone = fakeFeed();
      const stale = fakeStore({
        actorUrl: 'https://a.example/u',
        token: 't',
        view: 'all',
        thread: 'lost',
      });
      await createPersistence(gone, stale).restore();
      expect(gone.calls).toEqual(['connect https://a.example/u']);
      // A note that is no longer loaded is forgotten rather than asked for on every reload.
      expect(stale.record()).toEqual({ actorUrl: 'https://a.example/u', token: 't', view: 'all' });
      // The preview keeps its conversation the same way.
      const preview = fakeFeed();
      await createPersistence(
        preview,
        fakeStore({ actorUrl: 'demo', token: '', view: 'all', saved: ['n1'], thread: 'n1' }),
      ).restore();
      expect(preview.calls).toEqual(['explore', 'setSaved n1', 'openThread n1']);
    });
  });
});

describe('restoredAccount', () => {
  it('names the account a remembered tab is reconnecting, so the shell can draw it early', () => {
    expect(
      restoredAccount({ actorUrl: 'https://a.example/users/alice', token: 't', view: 'mine' }),
    ).toEqual({ id: 'https://a.example/users/alice', view: 'mine' });
  });
  it('is nothing for an empty tab or a remembered preview, which has no account', () => {
    expect(restoredAccount(undefined)).toBeUndefined();
    expect(restoredAccount({ actorUrl: DEMO_ACTOR, token: '', view: 'all' })).toBeUndefined();
  });
});
