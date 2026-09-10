import type {
  Actor,
  ComposeVisibility,
  ReactionKind,
  Timeline,
  TimelineNote,
} from '../domain/social';
import type { SocialSessionSnapshot } from '../application/social-session';
import { actorLabelOf } from './actor-name';
import { copy, feedFoot, pageTitle, viewTitles } from './copy';
import { actorProfile, type ActorProfile } from './note-display';
import type { Density } from './ports';
import { failureMessage, noticeText, type FailureMessage } from './copy-failures';
import { indexById, parentChain, scopeNotes, selectNotes, type FeedView } from './feed';
export { parentOf } from './feed';

/** How many nesting levels a conversation shows before deeper replies flatten. */
export const MAX_THREAD_DEPTH = 4;
/** The indent level a reply is drawn at: its depth, capped at the last visual level. */
export const visualDepth = (node: Pick<ConversationNode, 'depth'>): number =>
  Math.min(node.depth, MAX_THREAD_DEPTH - 1);

/** One reply below the focused note, in reading order (depth-first, oldest first). */
export interface ConversationNode {
  readonly note: TimelineNote;
  /** 0 for a direct reply to the focused note, +1 per level below. */
  readonly depth: number;
  /** Author of the note this one answers, when that is not the focused note. */
  readonly parentAuthor?: string;
  /** Deeper than the last visual level: shown flat under it with a "…에게" cue. */
  readonly flattened: boolean;
}

/** A conversation around one note as far as the loaded timeline can tell it. */
export interface Conversation {
  /** Loaded ancestors, oldest first. */
  readonly ancestors: TimelineNote[];
  /** IRI of the first ancestor that is not loaded, where the chain above breaks. */
  readonly missingAncestor?: string;
  readonly focused: TimelineNote;
  readonly descendants: ConversationNode[];
}

export interface FeedState {
  readonly actor?: Actor;
  readonly timeline?: Timeline;
  readonly demo: boolean;
  readonly loadedAt?: string;
  /**
   * A connection is being made. The connect form waits on it; nothing else ever does. A
   * write in flight is visible only on the control that sent it (`pending`, `deleting`, the
   * composer's own submitting state) - writes queue up behind one another in the session.
   */
  readonly connecting: boolean;
  /**
   * The timeline is being read again after a write or on request. Nothing is disabled by
   * it; the header may show a quiet indicator. The list stays usable and a new write may
   * begin during it.
   */
  readonly refreshing: boolean;
  /** True while the first timeline is loading (skeleton cards). */
  readonly loading: boolean;
  /**
   * Page-level failures (loading, or a publish whose composer is not on screen).
   * Reaction failures live in `actionError`, publish failures in `composeError`.
   */
  readonly error: string;
  /** Developer detail for `error`, shown behind a disclosure; empty when there is none. */
  readonly errorDetail: string;
  /** A rejected publish, shown inline by the composer that sent it while that composer is visible. */
  readonly composeError?: ComposeError;
  /** Reaction failures keyed by note id, shown inline under that note's action row. */
  readonly actionError: Record<string, string>;
  /** Reactions sent and not yet answered, by note id, so each button alone shows its pending state. */
  readonly pending: ReadonlyMap<string, ReactionKind>;
  /** Notes whose confirmed deletion is out; each confirmation button alone waits on its own. */
  readonly deleting: ReadonlySet<string>;
  /**
   * Notes behind a content warning whose text the reader chose to see. Kept here, not in the
   * card, so a re-read of the timeline or another page of it does not close them again.
   */
  readonly revealed: ReadonlySet<string>;
  /** Only the most recent notice, whether from the session or from a local save. */
  readonly notice: string;
  /**
   * The one-line reminder that this connection ends on reload, offered after a connect that
   * did not opt into tab persistence. Nothing is stored for it, either way.
   */
  readonly sessionHint: boolean;
  /** Bumped every time a notice is produced, so an identical message re-announces. */
  readonly noticeId: number;
  /** The shortcut help dialog is open. */
  readonly helpOpen: boolean;
  /** Desktop reading density; phones ignore it. */
  readonly density: Density;
  /** Browser preference: every content-warned note opens by itself. */
  readonly revealWarned: boolean;
  /**
   * Every loaded note is the reader's own: the "내 글" badge and the `@user@host` handle
   * would then say the same thing on every card, so the cards leave both out.
   */
  readonly soloAuthor: boolean;
  /** The person whose in-app sheet is open, described from loaded data only. */
  readonly actorSheet?: ActorProfile;
  /** Client-side "only this person" filter over the loaded notes, or nothing. */
  readonly authorFilter?: ActorProfile;
  readonly view: FeedView;
  readonly query: string;
  readonly saved: string[];
  readonly reply?: TimelineNote;
  /** The note whose delete confirmation is open; nothing is sent until it is confirmed. */
  readonly confirmDelete?: string;
  /** The note reopened in the composer for editing, as currently loaded. */
  readonly editing?: TimelineNote;
  /**
   * The note a conversation was opened on, whether or not it is still loaded. The note
   * itself, when it is, is `conversation.focused`.
   */
  readonly focusedNoteId?: string;
  /** True when a conversation was selected but its note is no longer in the timeline. */
  readonly threadMissing: boolean;
  readonly drafts: Record<string, string>;
  /** Unsent warning/visibility choices per composer key, kept beside the text drafts. */
  readonly composeOptions: Record<string, ComposeOptions>;
  readonly all: TimelineNote[];
  /** Every note in `all` by id, so a card finds its parent without scanning the list. */
  readonly byId: ReadonlyMap<string, TimelineNote>;
  /**
   * How many loaded replies sit below each note, at any depth - what a card's "대화 N"
   * count means. Computed once per projection for every note; absent means zero.
   */
  readonly replyCounts: ReadonlyMap<string, number>;
  /**
   * Notes known to be gone: deleted from here and not yet re-read, or deletions the
   * evaluator accepted from what the server sent (the author's own Delete, a tombstone). A
   * Delete relayed from anyone else is refused and hides nothing. A reply whose parent is
   * one of these says so.
   */
  readonly gone: ReadonlySet<string>;
  /** Every loaded note this list holds, after the view, search and author filters. */
  readonly notes: TimelineNote[];
  /**
   * How many loaded notes the view and author filter hold before the search: what a search
   * in a scoped list actually looked through, so the foot can count against it.
   */
  readonly scope: number;
  /** The part of `notes` currently on screen; the rest waits behind "더 보기". */
  readonly visibleNotes: TimelineNote[];
  /** Loaded notes in this list that are not on screen yet; 0 when everything is shown. */
  readonly remaining: number;
  /** The next page asked for would be the last: nothing would remain behind it. */
  readonly lastPage: boolean;
  /** The focused note with everything loaded above and below it. */
  readonly conversation?: Conversation;
  readonly missingSaved: string[];
  readonly title: string;
}

/** The composer key of the edit form for one note; `'new'` and note ids are the other two. */
export const editKey = (id: string): string => `edit:${id}`;

/** Reactions the server confirmed for the reading actor, by note id, until a load shows them. */
type ConfirmedReactions = Record<string, Partial<Record<ReactionKind, boolean>>>;

/**
 * A confirmed like/share is a fact about the server even when the read that should have
 * carried it back failed, so the control shows the state that was written rather than the
 * one the last successful load happened to hold. Pure: the loaded notes are not mutated.
 * A withdrawal drops the actor's own reaction entry with it; a new one carries no activity
 * IRI, because only a load can say what the server called it.
 */
export function withConfirmedReactions(
  notes: TimelineNote[],
  actor: string | undefined,
  confirmed: ConfirmedReactions,
): TimelineNote[] {
  if (!actor || Object.keys(confirmed).length === 0) return notes;
  const kinds: ReactionKind[] = ['like', 'share'];
  return notes.map((note) => {
    const states = confirmed[note.id];
    if (!states) return note;
    let next = note;
    for (const kind of kinds) {
      const active = states[kind];
      if (active === undefined) continue;
      const list = kind === 'like' ? next.likedBy : next.announcedBy;
      if (list.includes(actor) === active) continue;
      const people = active ? [...list, actor].sort() : list.filter((id) => id !== actor);
      next = {
        ...next,
        ...(kind === 'like' ? { likedBy: people } : { announcedBy: people }),
        reactions: active
          ? next.reactions
          : next.reactions.filter((r) => !(r.kind === kind && r.actor === actor)),
      };
    }
    return next;
  });
}

/** A publish failure and the composer (`'new'` or the parent note id) it belongs to. */
export interface ComposeError extends FailureMessage {
  key: string;
}

/** The non-text part of a composer draft: content warning and visibility. */
export interface ComposeOptions {
  summary: string;
  visibility: ComposeVisibility;
}

/** View-local state the feed keeps beside the session snapshot. */
export interface FeedLocalState {
  view: FeedView;
  query: string;
  saved: string[];
  reply?: TimelineNote;
  /** Note id whose delete confirmation is open; one at a time, cleared by any navigation. */
  confirmDelete?: string;
  /** Note id currently open in the edit composer. */
  editing?: string;
  /** Note id the conversation is open on; undefined when nothing is selected. */
  focusedNoteId?: string;
  drafts: Record<string, string>;
  composeOptions: Record<string, ComposeOptions>;
  saveNotice: string;
  /**
   * A session notice that a newer write has superseded: it is not shown again, so a
   * confirmation never stands over the action that came after it. Reset when the session
   * reports a notice of its own.
   */
  noticeSuperseded: boolean;
  /** The session-persistence reminder is on screen (offered at most once per page session). */
  sessionHint: boolean;
  /** The last rejected publish, kept until the next request or an explicit dismiss. */
  composeError?: ComposeError;
  actionError: Record<string, string>;
  /** The reaction out for each note that has one; a note has at most one out at a time. */
  pending: Record<string, ReactionKind>;
  /** Note ids whose confirmed deletion is out. */
  deleting: string[];
  /** Note ids whose content-warning body is shown; reset with everything else on disconnect. */
  revealed: string[];
  /** A session error already shown inline (or dismissed) so the page alert stays quiet. */
  hiddenError: string;
  /**
   * Notes the server reported gone: deleted from here, or found missing before a write.
   * They leave the list at once, whether or not the read that follows succeeds.
   */
  gone: string[];
  /** Like/share writes the server confirmed but the last load has not caught up with. */
  confirmed: ConfirmedReactions;
  noticeId: number;
  helpOpen: boolean;
  density: Density;
  revealWarned: boolean;
  actorSheet?: string;
  authorFilter?: string;
  /** How many pages of the current list are on screen; reset whenever the list changes. */
  pages: number;
}
export const initialLocalState = (): FeedLocalState => ({
  view: 'all',
  query: '',
  noticeId: 0,
  helpOpen: false,
  density: 'comfortable',
  revealWarned: false,
  actorSheet: undefined,
  authorFilter: undefined,
  pages: 1,
  saved: [],
  reply: undefined,
  confirmDelete: undefined,
  editing: undefined,
  focusedNoteId: undefined,
  drafts: {},
  composeOptions: {},
  saveNotice: '',
  noticeSuperseded: false,
  sessionHint: false,
  composeError: undefined,
  actionError: {},
  pending: {},
  deleting: [],
  revealed: [],
  hiddenError: '',
  gone: [],
  confirmed: {},
});

/**
 * What the notice bar shows. A local notice wins; a notice the session reported is dropped
 * once a newer write has begun, so a confirmation is never left standing over the action
 * that follows it.
 */
export function currentNotice(
  saveNotice: string,
  notice: SocialSessionSnapshot['notice'],
  superseded: boolean,
): string {
  return saveNotice || (superseded ? '' : noticeText(notice));
}

/**
 * How many notes one page of a list shows. Paging here is purely client-side over notes the
 * timeline already loaded: it never asks the server for more, and never hides a note that
 * cannot be reached by asking for the next page.
 */
export const PAGE_SIZE = 50;
/**
 * The first `pages` pages of `notes`, how many loaded notes are still behind them, and
 * whether one more page would be the last (nothing left behind it) - a list rule, so a
 * view that moves focus to the foot on the last page does not count for itself.
 */
export function pageNotes<T>(
  notes: readonly T[],
  pages: number,
  size = PAGE_SIZE,
): { visible: T[]; remaining: number; lastPage: boolean } {
  const shown = Math.max(1, Math.floor(pages)) * size;
  const remaining = Math.max(0, notes.length - shown);
  return { visible: notes.slice(0, shown), remaining, lastPage: remaining <= size };
}

/**
 * Whether the reader is the only author the timeline holds. On a one-person server that is
 * the usual case, and marking every card "내 글" with the same handle is noise; one note by
 * someone else brings both marks back on every card, so the two can be told apart.
 */
export function isSoloAuthor(notes: readonly Pick<TimelineNote, 'author'>[], actor: string) {
  return !!actor && notes.length > 0 && notes.every((note) => note.author === actor);
}

/**
 * What a reply's cue can honestly say about its parent: the parent is loaded, it is known
 * to be gone (so no link is offered to a 410), or the client has simply never seen it.
 */
type ParentState = 'loaded' | 'gone' | 'unknown';
export function parentState(
  all: TimelineNote[] | ReadonlyMap<string, TimelineNote>,
  note: TimelineNote,
  gone: ReadonlySet<string>,
): ParentState {
  if (!note.inReplyTo) return 'unknown';
  const loaded = Array.isArray(all)
    ? all.some((item) => item.id === note.inReplyTo)
    : (all as ReadonlyMap<string, TimelineNote>).has(note.inReplyTo);
  if (loaded) return 'loaded';
  return gone.has(note.inReplyTo) ? 'gone' : 'unknown';
}

/**
 * The cue drawn over a reply that sits deeper than the view indents: whom it answers, or
 * "이어서" when it continues its own author's note - the same rule as the card's cue.
 */
export function threadCue(
  node: Pick<ConversationNode, 'parentAuthor'> & { note: Pick<TimelineNote, 'author'> },
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
): string {
  if (!node.parentAuthor) return '';
  return node.parentAuthor === node.note.author
    ? copy.replyCueSelf
    : copy.replyCue(actorLabelOf(node.parentAuthor, self));
}

/**
 * The foot's count: under a search, how many notes matched - against everything loaded on
 * the timeline, or against the scope a narrower view or an author filter searched; in the
 * saved list, how many saved notes are loaded; otherwise how much of the loaded list is on
 * screen. A paged result adds how many of it are shown. Empty when there is nothing to count.
 */
export function feedFootLine(
  state: Pick<
    FeedState,
    'view' | 'query' | 'all' | 'notes' | 'visibleNotes' | 'scope' | 'authorFilter'
  >,
): string {
  if (!state.notes.length) return '';
  const paged = state.visibleNotes.length < state.notes.length;
  const searching = !!state.query.trim();
  const scope =
    state.view !== 'all'
      ? viewTitles[state.view]
      : state.authorFilter
        ? feedFoot.authorScope(state.authorFilter.name)
        : undefined;
  const line = searching
    ? scope
      ? feedFoot.searchedIn(scope, state.notes.length, state.scope)
      : feedFoot.searched(state.notes.length, state.all.length)
    : state.view === 'saved'
      ? feedFoot.savedShown(state.notes.length, state.all.length)
      : feedFoot.shown(state.visibleNotes.length, state.notes.length);
  const own = !searching && state.view !== 'saved';
  return paged && !own ? `${line} · ${feedFoot.onScreen(state.visibleNotes.length)}` : line;
}

/** Pure projection of session snapshot + local state into what the views render. */
export function deriveFeedState(remote: SocialSessionSnapshot, local: FeedLocalState): FeedState {
  const actor = remote.actor?.id || '';
  const gone = new Set([...local.gone, ...(remote.timeline?.deleted ?? [])]);
  const all = withConfirmedReactions(
    (remote.timeline?.notes || []).filter((note) => !gone.has(note.id)),
    actor || undefined,
    local.confirmed,
  );
  const byId = indexById(all);
  const thread = local.focusedNoteId ? byId.get(local.focusedNoteId) : undefined;
  const conversation = thread ? projectConversation(all, thread) : undefined;
  const remoteError = failureMessage(remote.error);
  const compose = local.composeError;
  // The main composer is on screen whenever no thread is open; a reply composer while its
  // reply is chosen, and an edit composer while that note is the one being edited.
  const owned =
    !!compose &&
    (compose.key === 'new'
      ? !local.focusedNoteId
      : !!local.editing && compose.key === editKey(local.editing)
        ? true
        : local.reply?.id === compose.key);
  const page =
    remoteError.text && remoteError.text !== local.hiddenError
      ? remoteError
      : compose && !owned
        ? compose
        : { text: '', detail: '' };
  const { notes, scope } = scopeNotes(
    all,
    local.view,
    actor,
    local.query,
    local.saved,
    local.authorFilter,
    remote.actor,
  );
  const onScreen = pageNotes(notes, local.pages);
  return {
    actor: remote.actor,
    timeline: remote.timeline,
    demo: remote.demo,
    loadedAt: remote.loadedAt,
    connecting: remote.connecting,
    refreshing: remote.refreshing,
    loading: remote.connecting && !remote.timeline,
    error: page.text,
    errorDetail: page.detail,
    composeError: owned ? compose : undefined,
    actionError: local.actionError,
    pending: new Map(Object.entries(local.pending)),
    deleting: new Set(local.deleting),
    revealed: new Set(local.revealed),
    notice: currentNotice(local.saveNotice, remote.notice, local.noticeSuperseded),
    noticeId: local.noticeId,
    sessionHint: local.sessionHint,
    helpOpen: local.helpOpen,
    density: local.density,
    revealWarned: local.revealWarned,
    soloAuthor: isSoloAuthor(all, actor),
    actorSheet: local.actorSheet ? actorProfile(all, local.actorSheet, remote.actor) : undefined,
    authorFilter: local.authorFilter
      ? actorProfile(all, local.authorFilter, remote.actor)
      : undefined,
    view: local.view,
    query: local.query,
    saved: local.saved,
    reply: local.reply,
    confirmDelete: local.confirmDelete,
    editing: local.editing ? byId.get(local.editing) : undefined,
    focusedNoteId: local.focusedNoteId,
    threadMissing: !!local.focusedNoteId && !thread,
    drafts: local.drafts,
    composeOptions: local.composeOptions,
    all,
    byId,
    replyCounts: descendantCounts(all),
    gone,
    notes,
    scope,
    visibleNotes: onScreen.visible,
    remaining: onScreen.remaining,
    lastPage: onScreen.lastPage,
    conversation,
    missingSaved: local.saved.filter((id) => !byId.has(id)),
    title: pageTitle(local.view, !!local.focusedNoteId),
  };
}

/**
 * Everything the timeline holds around `focused`: the ancestor chain (walked up through
 * `inReplyTo` until a note is missing or a cycle closes) and the reply tree below, flattened
 * into reading order with each node's depth. Pure and deterministic.
 */
export function projectConversation(
  all: TimelineNote[],
  focused: TimelineNote,
  maxDepth = MAX_THREAD_DEPTH,
): Conversation {
  const ancestors = parentChain(all, focused);
  const top = ancestors[0] ?? focused;
  const missingAncestor =
    top.inReplyTo && !all.some((note) => note.id === top.inReplyTo) ? top.inReplyTo : undefined;
  const descendants: ConversationNode[] = [];
  const children = childrenByParent(all);
  const visited = new Set([focused.id, ...ancestors.map((note) => note.id)]);
  const walk = (parent: TimelineNote, depth: number) => {
    for (const note of sortOldestFirst(children.get(parent.id) ?? [])) {
      if (visited.has(note.id)) continue;
      visited.add(note.id);
      descendants.push({
        note,
        depth,
        parentAuthor: depth > 0 ? parent.author : undefined,
        flattened: depth >= maxDepth,
      });
      walk(note, depth + 1);
    }
  };
  walk(focused, 0);
  return { ancestors, missingAncestor, focused, descendants };
}

/** Conversation replies read in posting order; notes without a parseable date keep their timeline position. */
export function sortOldestFirst(notes: TimelineNote[]): TimelineNote[] {
  const at = (note: TimelineNote) => (note.published ? Date.parse(note.published) : NaN);
  return notes
    .map((note, index) => ({ note, index, time: at(note) }))
    .sort((a, b) =>
      Number.isNaN(a.time) || Number.isNaN(b.time) ? a.index - b.index : a.time - b.time,
    )
    .map((entry) => entry.note);
}

/** Loaded replies grouped under the id they answer, in timeline order. */
function childrenByParent(all: readonly TimelineNote[]): Map<string, TimelineNote[]> {
  const children = new Map<string, TimelineNote[]>();
  for (const note of all) {
    if (!note.inReplyTo) continue;
    const list = children.get(note.inReplyTo);
    if (list) list.push(note);
    else children.set(note.inReplyTo, [note]);
  }
  return children;
}

/**
 * How many loaded replies sit below every note at once, at any depth: the same number
 * `projectConversation(all, note).descendants.length` gives, in one pass over the timeline
 * instead of one walk per card. A reply whose `inReplyTo` chain loops back onto itself
 * (which a conversation lists as an ancestor, never as a reply) is left out of the count
 * just as the conversation leaves it out. Iterative, so a very deep chain cannot overflow.
 */
export function descendantCounts(all: readonly TimelineNote[]): ReadonlyMap<string, number> {
  const byId = indexById(all);
  const children = childrenByParent(all);
  // Every note has at most one parent, so a loop in `inReplyTo` is a plain cycle: a note on
  // one is an ancestor of every other note on it, and is never counted as anyone's reply.
  const onCycle = new Set<string>();
  const state = new Map<string, 'walking' | 'done'>();
  for (const start of all) {
    if (state.has(start.id)) continue;
    const path: string[] = [];
    let current: TimelineNote | undefined = start;
    while (current && !state.has(current.id)) {
      state.set(current.id, 'walking');
      path.push(current.id);
      current = current.inReplyTo ? byId.get(current.inReplyTo) : undefined;
    }
    if (current && state.get(current.id) === 'walking')
      for (const id of path.slice(path.indexOf(current.id))) onCycle.add(id);
    for (const id of path) state.set(id, 'done');
  }
  const counts = new Map<string, number>();
  const countOf = (id: string) => counts.get(id) ?? 0;
  const replies = (id: string) =>
    (children.get(id) ?? []).filter((note) => !onCycle.has(note.id) && byId.get(note.id) === note);
  // Post-order over each tree: a note's count is ready once every reply below it is.
  const done = new Set<string>();
  for (const root of all) {
    if (done.has(root.id)) continue;
    const stack: { id: string; expanded: boolean }[] = [{ id: root.id, expanded: false }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (done.has(top.id)) {
        stack.pop();
        continue;
      }
      if (!top.expanded) {
        top.expanded = true;
        for (const note of replies(top.id))
          if (!done.has(note.id)) stack.push({ id: note.id, expanded: false });
        continue;
      }
      stack.pop();
      done.add(top.id);
      let total = 0;
      for (const note of replies(top.id)) total += 1 + countOf(note.id);
      if (total > 0) counts.set(top.id, total);
    }
  }
  return counts;
}

/** Every loaded reply below `note`, at any depth: what the "대화 N" count on a card means. */
export function descendantCount(notes: TimelineNote[], note: TimelineNote): number {
  return descendantCounts(notes).get(note.id) ?? 0;
}

/** The skip link's destination: the timeline list, or the main column around it. */
export type SkipTarget = 'list' | 'main';

/** Where the selected conversation is drawn and what that means for the list beside it. */
interface ThreadPlacement {
  /** Desktop: the conversation opens in the right column and the timeline stays put. */
  readonly aside: boolean;
  /** The list is on screen (nothing selected, or the conversation sits aside). */
  readonly listVisible: boolean;
  /** Notes whose reply composer belongs to the thread column while it is open aside. */
  readonly inConversation: ReadonlySet<string>;
  /** The skip link target: the list when it is visible and something is loaded. */
  readonly skipTarget: SkipTarget;
  /** The page heading: the list name while the conversation sits aside. */
  readonly title: string;
}
export function threadPlacement(state: FeedState, wide: boolean): ThreadPlacement {
  const selected = !!state.focusedNoteId;
  const aside = wide && selected;
  const conversation = aside ? state.conversation : undefined;
  const inConversation = new Set<string>(
    conversation
      ? [
          conversation.focused.id,
          ...conversation.ancestors.map((note) => note.id),
          ...conversation.descendants.map((node) => node.note.id),
        ]
      : [],
  );
  const listVisible = aside || !selected;
  return {
    aside,
    listVisible,
    inConversation,
    skipTarget: state.actor && listVisible ? 'list' : 'main',
    title: aside ? viewTitles[state.view] : state.title,
  };
}

/** Replies addressed to me for the desktop right column: newest first, the open one left out. */
export function repliesPeek(state: FeedState, limit = 8): TimelineNote[] {
  return selectNotes(state.all, 'replies', state.actor?.id || '', '', state.saved)
    .filter((note) => note.id !== state.focusedNoteId)
    .slice(0, limit);
}
