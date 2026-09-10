import type { NoteDraft, ReactionKind, Timeline, TimelineNote } from '../domain/social';
import { clampVisibility } from '../domain/note-content';
import { ownReaction } from '../domain/evaluate';
import { createGuard } from './guard';
import {
  GatewayGone,
  GatewayRejected,
  SessionError,
  toFailure,
  type SessionFailure,
  type WriteAction,
} from './gateway-errors';
import {
  createWriteQueue,
  landed,
  noticeTiming,
  type ReadState,
  type SessionNotice,
  type WriteOptions,
} from './write-queue';

export { SessionError, noticeTiming, type SessionFailure, type SessionNotice, type WriteAction };

/** The actor URL that selects the read-only sample gateway instead of a server. */
export const DEMO_ACTOR = 'demo';

/** Transport boundary: a fulfilled publish means the server accepted the write. */
export interface TimelineGateway {
  /** The full walk of both collections: what connecting and an explicit refresh do. */
  loadTimeline(): Promise<Timeline>;
  /**
   * The read after a confirmed write: the first page of each collection, merged over
   * `previous` so nothing it held is lost. The result carries `previous.reach` and
   * `partial: true` - it claims nothing about how far the server's collections go.
   * `touched` names the objects the write changed (an edited or deleted note); each is
   * read back as the server holds it now, so the read is honest about them whether or not
   * the first pages list a row for the write.
   */
  loadRecent(previous: Timeline, touched: readonly string[]): Promise<Timeline>;
  /** POST a Create/Note; the gateway derives addressing from `draft.visibility`. */
  publishNote(draft: NoteDraft, replyTo?: TimelineNote): Promise<unknown>;
  /** POST a Like or Announce for `note` to the outbox. Servers may return no Location. */
  react(kind: ReactionKind, note: TimelineNote): Promise<unknown>;
  /** POST a Delete of one of this actor's own reaction activities on `note`. */
  withdrawReaction(note: TimelineNote, activity: string): Promise<unknown>;
  /** POST a Delete of one of this actor's own notes. */
  deleteNote(note: TimelineNote): Promise<unknown>;
  /**
   * Authenticated read of `note` answering whether the server still holds it. False for a
   * server that reports it gone (404, 410, or a Tombstone); a read that fails for any other
   * reason rejects, so "gone" is never inferred from a network problem.
   */
  noteExists(note: TimelineNote): Promise<boolean>;
  /** POST an Update replacing the content and content warning of one of this actor's notes. */
  updateNote(note: TimelineNote, draft: NoteDraft): Promise<unknown>;
  /** True for read-only sample content that never reaches a server. */
  readonly demo?: boolean;
}
export interface ConnectionCredentials {
  actorUrl: string;
  token?: string;
}
export interface SocialSessionSnapshot extends ReadState {
  /** Read-only sample mode: writes are impossible, nothing is persisted. */
  readonly demo: boolean;
  /**
   * A connection is being made: the first timeline is loading. The only state that waits
   * on anything page-wide; a write in flight disables nothing but the control that sent it.
   */
  readonly connecting: boolean;
}

const emptySnapshot = (): SocialSessionSnapshot => ({
  actor: undefined,
  timeline: undefined,
  demo: false,
  loadedAt: undefined,
  lastFullLoadAt: undefined,
  connecting: false,
  refreshing: false,
  error: undefined,
  notice: undefined,
});

const reactionNotice: Record<ReactionKind, Record<'on' | 'off', SessionNotice>> = {
  like: { on: 'liked', off: 'unliked' },
  share: { on: 'shared', off: 'unshared' },
};
/** A withdrawal is reported as a withdrawal, never in the words of the reaction it undoes. */
const reactionAction: Record<ReactionKind, Record<'on' | 'off', WriteAction>> = {
  like: { on: 'like', off: 'unlike' },
  share: { on: 'share', off: 'unshare' },
};

/**
 * Classifies an outright refusal as `kind`; network, abort and protocol failures keep their
 * own classification, so a refusal is never confused with a request that never arrived.
 */
const rejectedAs =
  (kind: 'withdraw-rejected' | 'delete-rejected') =>
  (error: unknown): SessionFailure =>
    error instanceof GatewayRejected ? { kind, code: error.code } : toFailure(error);

export interface SocialSessionOptions {
  /**
   * The clock `loadedAt` and `lastFullLoadAt` are stamped with (ISO 8601). The composition
   * root passes the wall clock; tests pass a fixed one.
   */
  now: () => string;
}

/** Owns use-case ordering and cancellation, independent of rendering and transport. */
export function createSocialSession(
  createGateway: (options: ConnectionCredentials & { signal: AbortSignal }) => TimelineGateway,
  { now }: SocialSessionOptions,
) {
  let snapshot = emptySnapshot();
  const listeners = new Set<(snapshot: SocialSessionSnapshot) => void>();
  let gateway: TimelineGateway | undefined;
  let cancellation: AbortController | undefined;
  const guard = createGuard();
  let connecting = false;

  function update(patch: Partial<SocialSessionSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }
  const queue = createWriteQueue({ guard, state: () => snapshot, update, now });

  /** A write against the connected gateway; refused before it is queued when there is none. */
  async function write(
    perform: (active: TimelineGateway) => Promise<SessionNotice | void>,
    options: WriteOptions,
  ) {
    if (connecting) throw new SessionError({ kind: 'busy' });
    if (!gateway) throw new SessionError({ kind: 'not-connected' });
    const active = gateway;
    return queue.enqueue(active, () => perform(active), options);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: (snapshot: SocialSessionSnapshot) => void) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    async connect(credentials: ConnectionCredentials) {
      if (connecting) return;
      const current = guard.next();
      connecting = true;
      cancellation?.abort();
      cancellation = new AbortController();
      gateway = undefined;
      queue.reset();
      update({ ...emptySnapshot(), connecting: true });
      try {
        const next = createGateway({
          actorUrl: credentials.actorUrl.trim(),
          token: credentials.token?.trim(),
          signal: cancellation.signal,
        });
        const timeline = await next.loadTimeline();
        if (!guard.isCurrent(current)) return;
        gateway = next;
        update({ ...landed(timeline, now()), demo: next.demo === true });
      } catch (error) {
        if (guard.isCurrent(current)) update({ error: toFailure(error) });
      } finally {
        if (guard.isCurrent(current)) {
          connecting = false;
          update({ connecting: false });
        }
      }
    },
    /**
     * Asks the server again on request. Nothing is disabled while it runs, and a write may
     * begin during it - that write's own read then takes the place of this one. A request
     * while a read is already in flight, or while a POST whose own read follows is out, is
     * not a second read; the one coming is enough. Resolves once the read has settled, with
     * whether one was started at all - a caller that clears what it holds about the server
     * (notes it saw reported gone) waits for that answer rather than assuming a read ran.
     */
    async refresh(): Promise<boolean> {
      if (!gateway || connecting || queue.writing() || snapshot.refreshing) return false;
      update({ error: undefined, notice: undefined });
      await queue.refresh(gateway, guard.current());
      return true;
    },
    /**
     * Resolves once no timeline read is in flight.
     * @internal For tests that wait for the read after a write; views observe the snapshot.
     */
    settled: () => queue.settled(),
    /** A reply is never addressed wider than its parent, whatever the caller asked for. */
    publish(draft: NoteDraft, replyTo?: TimelineNote) {
      const bounded: NoteDraft = {
        ...draft,
        visibility: clampVisibility(draft.visibility, replyTo?.visibility),
      };
      return write(
        async (active) => {
          await active.publishNote(bounded, replyTo);
        },
        { notice: 'published', action: replyTo ? 'reply' : 'publish' },
      );
    },
    /**
     * Like/share (`active`) or withdraw this actor's own reaction (`!active`). Withdrawing
     * deletes the reaction activity, so it needs the activity IRI the load carried: without
     * one the request is refused (`reaction-missing`) rather than aimed at a guessed IRI.
     */
    react(note: TimelineNote, kind: ReactionKind, active: boolean) {
      const own = ownReaction(note, kind, snapshot.actor?.id);
      if (!active && gateway && !own)
        return Promise.reject(new SessionError({ kind: 'reaction-missing' }));
      return write(
        async (gateway) => {
          if (active) await gateway.react(kind, note);
          else await gateway.withdrawReaction(note, own!.activity);
        },
        {
          notice: reactionNotice[kind][active ? 'on' : 'off'],
          action: reactionAction[kind][active ? 'on' : 'off'],
          classify: active ? toFailure : rejectedAs('withdraw-rejected'),
          changed: active ? {} : { withdrawn: [own!.activity] },
        },
      );
    },
    /**
     * Delete one of this actor's own notes. On this client a deletion is a request to the
     * reader's own server; it cannot recall copies other servers already hold.
     */
    deleteNote(note: TimelineNote) {
      if (gateway && note.author !== snapshot.actor?.id)
        return Promise.reject(new SessionError({ kind: 'not-own-note' }));
      return write(
        async (active) => {
          // A card can outlive the object it stands for: another tab, or another client,
          // may have deleted it already. Deleting it again is not a failure, it is done.
          if (!(await active.noteExists(note))) return 'already-gone';
          await active.deleteNote(note);
        },
        {
          notice: 'deleted',
          action: 'delete',
          classify: rejectedAs('delete-rejected'),
          changed: { touched: [note.id] },
        },
      );
    },
    /** Replace the content and content warning of one of this actor's own notes. */
    editNote(note: TimelineNote, draft: NoteDraft) {
      if (gateway && note.author !== snapshot.actor?.id)
        return Promise.reject(new SessionError({ kind: 'not-own-note' }));
      return write(
        async (active) => {
          // An Update aimed at an object the server no longer holds recreates it on servers
          // that treat an Update as an upsert, so a stale card would silently republish a
          // deleted note - readable by anyone - with no way back to it in the app. The
          // object is confirmed to still exist before the Update is sent.
          if (!(await active.noteExists(note))) throw new GatewayGone();
          await active.updateNote(note, draft);
        },
        { notice: 'edited', action: 'edit', changed: { touched: [note.id] } },
      );
    },
    disconnect() {
      cancellation?.abort();
      cancellation = undefined;
      guard.next();
      gateway = undefined;
      connecting = false;
      queue.reset({ owed: true });
      update(emptySnapshot());
    },
  };
}

export type SocialSession = ReturnType<typeof createSocialSession>;
