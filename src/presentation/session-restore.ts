import type { TimelineNote } from '../domain/social';
import { DEMO_ACTOR } from '../application/social-session';
import type { FeedView } from './feed';
import { savePreviewLinks } from './saved-links';

/** What an opted-in tab keeps across reloads; the adapter decides where (sessionStorage). */
export interface StoredSession {
  actorUrl: string;
  token: string;
  view: FeedView;
  /** Preview-only: saved note IRIs, so a reload keeps them and closing the tab clears them. */
  saved?: string[];
  /** The open conversation's note IRI, so a reload lands on it again if it is still loaded. */
  thread?: string;
}

/** Tab-scoped session persistence. Nothing is written unless the person opted in. */
export interface SessionStore {
  read(): StoredSession | undefined;
  write(session: StoredSession): boolean;
  clear(): void;
}

const views: FeedView[] = ['all', 'replies', 'mine', 'saved'];
const isFeedView = (value: unknown): value is FeedView =>
  typeof value === 'string' && (views as string[]).includes(value);

/** Validates a parsed JSON value into a stored session, or nothing. */
export function parseStoredSession(value: unknown): StoredSession | undefined {
  if (!value || typeof value !== 'object') return;
  const { actorUrl, token, view, saved, thread } = value as Record<string, unknown>;
  if (typeof actorUrl !== 'string' || !actorUrl || typeof token !== 'string') return;
  const ids = Array.isArray(saved)
    ? saved.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    actorUrl,
    token,
    view: isFeedView(view) ? view : 'all',
    ...(ids.length ? { saved: ids } : {}),
    ...(typeof thread === 'string' && thread ? { thread } : {}),
  };
}

/**
 * The account a remembered tab is about to reconnect, read before any request is made, so
 * the navigation and the account line can be drawn at once instead of after the timeline
 * arrives. The preview has no account and gets nothing here.
 */
export function restoredAccount(
  stored: StoredSession | undefined,
): { id: string; view: FeedView } | undefined {
  if (!stored || stored.actorUrl === DEMO_ACTOR) return;
  return { id: stored.actorUrl, view: stored.view };
}

/** A store that never persists: the default when persistence is unavailable. */
export const noSessionStore: SessionStore = {
  read: () => undefined,
  write: () => false,
  clear: () => {},
};

/**
 * Whether to offer the reminder that this connection ends on reload. Only after a real
 * account connect that did not opt in, and only once per page session: the default stays
 * memory-only either way, and neither the reminder nor its dismissal is stored anywhere.
 */
export function shouldOfferSessionHint(options: {
  connected: boolean;
  demo: boolean;
  remembered: boolean;
  offered: boolean;
}): boolean {
  return options.connected && !options.demo && !options.remembered && !options.offered;
}

/** The slice of the feed view model that persistence wraps. */
export interface PersistedFeed {
  getSnapshot(): {
    actor?: unknown;
    demo: boolean;
    saved: string[];
    view: FeedView;
    all: readonly TimelineNote[];
  };
  connect(url: string, token: string, remember?: boolean): Promise<void>;
  explore(): Promise<void>;
  navigate(view: FeedView): void;
  setSaved(ids: string[]): void;
  toggleSave(note: TimelineNote): void;
  removeSaved(id: string): void;
  openThread(note: TimelineNote, scrollY?: number): void;
  closeThread(): void;
  leaveThread(): void;
  disconnect(): void;
}

/**
 * Tab persistence around the feed: which actions write the record, what a reload restores,
 * and when the record is cleared. Opted in per connection for an account; always on for the
 * preview, whose record holds only the preview marker, a list name and saved links.
 */
export function createPersistence(feed: PersistedFeed, store: SessionStore) {
  let remembered = !!store.read();
  /** The list name and the open conversation share one record; nothing else of the view does. */
  const persistPlace = (place: { view?: FeedView; thread?: string }) => {
    const stored = store.read();
    if (!remembered || !stored || !feed.getSnapshot().actor) return;
    const { thread: _dropped, ...rest } = stored;
    store.write({
      ...rest,
      view: place.view ?? stored.view,
      ...(place.thread ? { thread: place.thread } : {}),
    });
  };
  /** Preview saves live in the tab record; an account's saves go through preferences. */
  const persistSaved = () => {
    const snapshot = feed.getSnapshot();
    if (remembered && snapshot.demo) savePreviewLinks(store, snapshot.saved);
  };
  return {
    /** Reconnects a remembered tab and brings back its list and preview saves. */
    async restore() {
      const stored = store.read();
      if (!stored) return;
      if (stored.actorUrl === DEMO_ACTOR) await feed.explore();
      // A restored tab already opted in, so it is never reminded that it did not.
      else await feed.connect(stored.actorUrl, stored.token, true);
      const snapshot = feed.getSnapshot();
      if (!snapshot.actor) return;
      if (snapshot.demo && stored.saved?.length) feed.setSaved(stored.saved);
      if (stored.view !== 'all') feed.navigate(stored.view);
      // The conversation comes back only while its note is still loaded; a note that left
      // the timeline meanwhile is not worth a "선택한 글은 현재 타임라인에 없습니다" on reload.
      const note = stored.thread && snapshot.all.find((item) => item.id === stored.thread);
      if (note) feed.openThread(note);
      else if (stored.thread) persistPlace({});
    },
    navigate(view: FeedView) {
      feed.navigate(view);
      persistPlace({ view });
    },
    openThread(note: TimelineNote, scrollY?: number) {
      feed.openThread(note, scrollY);
      persistPlace({ thread: note.id });
    },
    closeThread() {
      feed.closeThread();
      persistPlace({});
    },
    leaveThread() {
      feed.leaveThread();
      persistPlace({});
    },
    toggleSave(note: TimelineNote) {
      feed.toggleSave(note);
      persistSaved();
    },
    removeSaved(id: string) {
      feed.removeSaved(id);
      persistSaved();
    },
    disconnect() {
      remembered = false;
      store.clear();
      feed.disconnect();
    },
    async explore() {
      remembered = true;
      store.clear();
      await feed.explore();
      if (feed.getSnapshot().demo) store.write({ actorUrl: DEMO_ACTOR, token: '', view: 'all' });
    },
    /** `remember` opts this tab in; the record is written only once the account connected. */
    async connect(url: string, token: string, remember: boolean) {
      remembered = remember;
      store.clear();
      await feed.connect(url, token, remember);
      const snapshot = feed.getSnapshot();
      if (remember && snapshot.actor && !snapshot.demo)
        store.write({ actorUrl: url, token, view: snapshot.view });
    },
  };
}
