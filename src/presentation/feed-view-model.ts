import type { Actor, ReactionKind, Timeline, TimelineNote } from '../domain/social';
import type { ConnectionCredentials, SocialSessionSnapshot } from '../application/social-session';
import type { Preferences } from './ports';
import { notices, pageTitle } from './copy';
import { parentChain, selectNotes, type FeedView } from './feed';

/** The slice of the social session the feed depends on (structurally matches SocialSession). */
export interface FeedSession {
  getSnapshot(): SocialSessionSnapshot;
  subscribe(listener: (snapshot: SocialSessionSnapshot) => void): () => void;
  connect(credentials: ConnectionCredentials): Promise<void>;
  refresh(): Promise<void>;
  publish(text: string, replyTo?: TimelineNote): Promise<void>;
  react(note: TimelineNote, kind: ReactionKind, active: boolean): Promise<void>;
  disconnect(): void;
}

/** DOM concerns the view model needs but must not touch itself; implemented by the app shell. */
export interface FocusPort {
  focusReplyComposer(noteId: string): void;
  focusMainComposer(): void;
  focusHeading(): void;
  restore(noteId: string | undefined, scrollY: number): void;
}

export interface FeedState {
  readonly actor?: Actor;
  readonly timeline?: Timeline;
  readonly demo: boolean;
  readonly loadedAt?: string;
  readonly busy: boolean;
  /** True while the first timeline is loading (skeleton cards). */
  readonly loading: boolean;
  /** Page-level failures (publishing, loading). Reaction failures live in `actionError`. */
  readonly error: string;
  /** Reaction failures keyed by note id, shown inline under that note's action row. */
  readonly actionError: Record<string, string>;
  /** The reaction currently in flight, so only the tapped button shows a pending state. */
  readonly pending?: { id: string; kind: ReactionKind };
  /** Only the most recent notice, whether from the session or from a local save. */
  readonly notice: string;
  readonly view: FeedView;
  readonly query: string;
  readonly saved: string[];
  readonly reply?: TimelineNote;
  /** The selected conversation as currently loaded; undefined when nothing is selected. */
  readonly thread?: TimelineNote;
  /** True when a conversation was selected but its note is no longer in the timeline. */
  readonly threadMissing: boolean;
  readonly drafts: Record<string, string>;
  readonly all: TimelineNote[];
  readonly notes: TimelineNote[];
  readonly parents: TimelineNote[];
  /** IRI of the focused note's parent when that parent is not loaded. */
  readonly missingParent?: string;
  readonly replies: TimelineNote[];
  readonly missingSaved: string[];
  readonly title: string;
}

interface LocalState {
  view: FeedView;
  query: string;
  saved: string[];
  reply?: TimelineNote;
  selected?: string;
  drafts: Record<string, string>;
  saveNotice: string;
  /** Fallback page error for a rejected publish that the session did not record itself. */
  pageError: string;
  actionError: Record<string, string>;
  pending?: { id: string; kind: ReactionKind };
  /** A session error already shown inline (or dismissed) so the page alert stays quiet. */
  hiddenError: string;
}
const initialLocal = (): LocalState => ({
  view: 'all',
  query: '',
  saved: [],
  reply: undefined,
  selected: undefined,
  drafts: {},
  saveNotice: '',
  pageError: '',
  actionError: {},
  pending: undefined,
  hiddenError: '',
});

export function createFeedViewModel(
  session: FeedSession,
  preferences: Preferences,
  focus: FocusPort,
) {
  let local = initialLocal();
  let remote = session.getSnapshot();
  let returnId: string | undefined;
  let returnScroll = 0;
  /** Bumped by connect/explore/disconnect so a late POST rejection cannot mark a newer session. */
  let generation = 0;
  const listeners = new Set<(state: FeedState) => void>();

  function derive(): FeedState {
    const actor = remote.actor?.id || '';
    const all = remote.timeline?.notes || [];
    const thread = local.selected ? all.find((note) => note.id === local.selected) : undefined;
    const parents = thread ? parentChain(all, thread) : [];
    return {
      actor: remote.actor,
      timeline: remote.timeline,
      demo: remote.demo,
      loadedAt: remote.loadedAt,
      busy: remote.busy,
      loading: remote.busy && !remote.timeline,
      error: (remote.error !== local.hiddenError ? remote.error : '') || local.pageError,
      actionError: local.actionError,
      pending: local.pending,
      notice: local.saveNotice || remote.notice,
      view: local.view,
      query: local.query,
      saved: local.saved,
      reply: local.reply,
      thread,
      threadMissing: !!local.selected && !thread,
      drafts: local.drafts,
      all,
      notes: selectNotes(all, local.view, actor, local.query, local.saved),
      parents,
      missingParent:
        thread?.inReplyTo && !all.some((note) => note.id === thread.inReplyTo)
          ? thread.inReplyTo
          : undefined,
      replies: thread ? sortOldestFirst(all.filter((note) => note.inReplyTo === thread.id)) : [],
      missingSaved: local.saved.filter((id) => !all.some((note) => note.id === id)),
      title: pageTitle(local.view, !!thread || !!local.selected),
    };
  }
  let state = derive();

  function emit() {
    state = derive();
    for (const listener of listeners) listener(state);
  }
  function patch(next: Partial<LocalState>) {
    local = { ...local, ...next };
    emit();
  }
  const unsubscribe = session.subscribe((snapshot) => {
    const previous = remote;
    remote = snapshot;
    // A newer session notice or a fresh request supersedes an older local notice.
    if (snapshot.notice && snapshot.notice !== previous.notice) local.saveNotice = '';
    if (snapshot.busy && !previous.busy) {
      local.pageError = '';
      local.hiddenError = '';
    }
    emit();
  });

  function saveLinks(next: string[], adding: boolean) {
    const actor = remote.actor?.id;
    const persisted =
      !remote.demo && !!actor && preferences.write(`saved.${actor}`, JSON.stringify(next));
    patch({
      saved: next,
      saveNotice: remote.demo
        ? notices.demoSave
        : persisted
          ? adding
            ? notices.saved
            : notices.unsaved
          : notices.storageUnavailable,
    });
  }
  const describe = (error: unknown) =>
    error instanceof Error ? error.message : '요청을 완료하지 못했습니다. 다시 시도해주세요.';
  function fail(error: unknown, started: number) {
    if (started === generation && !remote.error) patch({ pageError: describe(error) });
  }
  function withoutError(id: string): Record<string, string> {
    const { [id]: _dropped, ...rest } = local.actionError;
    return rest;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: (state: FeedState) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Stops observing the session; the shell calls this when the view goes away. */
    dispose() {
      unsubscribe();
      listeners.clear();
    },
    repliesCount: (id: string) => state.all.filter((note) => note.inReplyTo === id).length,
    isParentLoaded: (note: TimelineNote) =>
      !!note.inReplyTo && state.all.some((item) => item.id === note.inReplyTo),
    parentOf: (note: TimelineNote) => state.all.find((item) => item.id === note.inReplyTo),
    draft: (key: string) => state.drafts[key] || '',
    async connect(url: string, token: string) {
      if (remote.busy) return;
      generation++;
      patch({ ...initialLocal() });
      await session.connect({ actorUrl: url, token });
      const actor = remote.actor;
      if (actor) {
        // "demo" typed as the URL lands on the sample gateway; that is never a remembered account.
        if (!remote.demo) preferences.write('actor', actor.id);
        patch({ saved: preferences.saved(actor.id) });
      }
    },
    async explore() {
      if (remote.busy) return;
      generation++;
      patch({ ...initialLocal() });
      await session.connect({ actorUrl: 'demo', token: '' });
    },
    disconnect() {
      generation++;
      session.disconnect();
      returnId = undefined;
      returnScroll = 0;
      patch(initialLocal());
    },
    /** Switching lists closes the inline reply (its draft stays) and drops per-note feedback. */
    navigate(view: FeedView) {
      patch({
        view,
        selected: undefined,
        reply: undefined,
        query: '',
        saveNotice: '',
        actionError: {},
      });
    },
    /** Hides the current page-level alert until a new request reports something. */
    dismissError() {
      patch({ pageError: '', hiddenError: remote.error });
    },
    setQuery(query: string) {
      patch({ query });
    },
    compose() {
      patch({ selected: undefined });
      focus.focusMainComposer();
    },
    chooseReply(note: TimelineNote) {
      if (remote.busy) return;
      patch({ reply: note });
      focus.focusReplyComposer(note.id);
    },
    cancelReply() {
      patch({ reply: undefined });
    },
    openThread(note: TimelineNote, scrollY = 0) {
      if (!local.selected) {
        returnId = note.id;
        returnScroll = scrollY;
      }
      patch({ selected: note.id });
      focus.focusHeading();
    },
    closeThread() {
      patch({ selected: undefined });
      focus.restore(returnId, returnScroll);
    },
    toggleSave(note: TimelineNote) {
      const adding = !local.saved.includes(note.id);
      saveLinks(
        adding ? [...local.saved, note.id] : local.saved.filter((id) => id !== note.id),
        adding,
      );
    },
    removeSaved(id: string) {
      saveLinks(
        local.saved.filter((savedId) => savedId !== id),
        false,
      );
    },
    setDraft(key: string, value: string) {
      patch({ drafts: { ...local.drafts, [key]: value } });
    },
    async refresh() {
      patch({ saveNotice: '', pageError: '', actionError: {} });
      await session.refresh();
    },
    /** Resolves when the server accepted the write; the reply composer closes even if re-load failed. */
    async publish(text: string, target?: TimelineNote) {
      patch({ saveNotice: '', pageError: '' });
      const started = generation;
      try {
        await session.publish(text, target);
      } catch (error) {
        fail(error, started);
        throw error;
      }
      if (target && local.reply?.id === target.id) patch({ reply: undefined });
    },
    async react(note: TimelineNote, kind: ReactionKind) {
      if (remote.busy) return;
      const actor = remote.actor?.id || '';
      const mine = kind === 'like' ? note.likedBy : note.announcedBy;
      patch({
        saveNotice: '',
        actionError: withoutError(note.id),
        pending: { id: note.id, kind },
      });
      const started = generation;
      try {
        await session.react(note, kind, !(mine ?? []).includes(actor));
      } catch (error) {
        if (started !== generation) return;
        const message = describe(error);
        // The session records the same failure globally; keep it beside the note instead.
        patch({
          actionError: { ...local.actionError, [note.id]: message },
          hiddenError: remote.error === message ? message : local.hiddenError,
        });
      } finally {
        if (started === generation && local.pending?.id === note.id) patch({ pending: undefined });
      }
    },
  };
}

export type FeedViewModel = ReturnType<typeof createFeedViewModel>;

/** Conversation replies read in posting order; notes without a parseable date keep their timeline position. */
function sortOldestFirst(notes: TimelineNote[]): TimelineNote[] {
  const at = (note: TimelineNote) => (note.published ? Date.parse(note.published) : NaN);
  return notes
    .map((note, index) => ({ note, index, time: at(note) }))
    .sort((a, b) =>
      Number.isNaN(a.time) || Number.isNaN(b.time) ? a.index - b.index : a.time - b.time,
    )
    .map((entry) => entry.note);
}
