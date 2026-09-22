import type { NoteDraft, ReactionKind, Timeline, TimelineNote } from '../domain/social';
import { buildAddressing, clampVisibility } from '../domain/note-content';
import { ownReaction } from '../domain/evaluate';
import { createImagePublisher } from './image-publisher';
import { validateImages } from '../domain/images';
import type { ImageGateway, ImageUploadState } from './image-types';
import type { ImageReadGateway, ReadImage } from './image-reader';
import type { RelationshipGateway, RelationshipState } from './relationship-types';
import { createRelationshipSession } from './relationship-session';
import { createGuard } from './guard';
import {
  createTimelineReadController,
  TimelineReadCancelled,
  type TimelineReadOptions,
} from './timeline-read';
import {
  GatewayGone,
  GatewayReadOnly,
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
  readonly relationships?: RelationshipGateway;
  readonly images?: ImageGateway;
  readonly imageReader?: ImageReadGateway;
  /** The full walk of both collections: what connecting and an explicit refresh do. */
  loadTimeline(options?: TimelineReadOptions): Promise<Timeline>;
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
  mediaMode?: 'oni';
}
export interface SocialSessionSnapshot extends ReadState {
  readonly relationships?: RelationshipState;
  readonly mediaUploads?: Readonly<Record<string, ImageUploadState>>;
  readonly imageUploadEnabled?: boolean;
  readonly privateImageUploadEnabled?: boolean;
  readonly imageReadEnabled?: boolean;
  /** Read-only sample mode: writes are impossible, nothing is persisted. */
  readonly demo: boolean;
  /**
   * A connection is being made: the first timeline is loading. The only state that waits
   * on anything page-wide; a write in flight disables nothing but the control that sent it.
   */
  readonly connecting: boolean;
}

const emptySnapshot = (): SocialSessionSnapshot => ({
  readBudget: undefined,
  relationships: undefined,
  mediaUploads: {},
  imageUploadEnabled: false,
  privateImageUploadEnabled: false,
  imageReadEnabled: false,
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
  let images: ReturnType<typeof createImagePublisher> | undefined;

  let relationships: ReturnType<typeof createRelationshipSession> | undefined;
  let relationshipActor: string | undefined;

  function update(patch: Partial<SocialSessionSnapshot>) {
    if (patch.actor && relationshipActor && patch.actor.id !== relationshipActor) {
      relationships?.dispose();
      relationships = undefined;
      relationshipActor = undefined;
      patch = { ...patch, relationships: undefined };
    }
    if (patch.actor) {
      patch = {
        ...patch,
        privateImageUploadEnabled:
          !!(patch.imageUploadEnabled ?? snapshot.imageUploadEnabled) &&
          !(patch.demo ?? snapshot.demo) &&
          patch.actor.privateMedia === true,
      };
    }
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }
  const reads = createTimelineReadController((readBudget) => update({ readBudget }));
  const queue = createWriteQueue({ guard, state: () => snapshot, update, now, reads });

  function relationshipController() {
    if (connecting) throw new SessionError({ kind: 'busy' });
    if (!gateway || !snapshot.actor) throw new SessionError({ kind: 'not-connected' });
    if (!relationships) {
      const current = guard.current();
      const actor = snapshot.actor.id;
      relationshipActor = actor;
      const controller = createRelationshipSession(
        gateway.demo ? undefined : gateway.relationships,
        actor,
        {
          current: () =>
            guard.isCurrent(current) && snapshot.actor?.id === actor && relationshipActor === actor,
          update: (state) => update({ relationships: state }),
        },
      );
      relationships = controller;
      update({ relationships: controller.getSnapshot() });
      return controller;
    }
    return relationships;
  }

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
      images = undefined;
      relationships?.dispose();
      relationships = undefined;
      relationshipActor = undefined;
      queue.reset();
      update({ ...emptySnapshot(), connecting: true });
      try {
        const next = createGateway({
          actorUrl: credentials.actorUrl.trim(),
          token: credentials.token?.trim(),
          signal: cancellation.signal,
          ...(credentials.mediaMode ? { mediaMode: credentials.mediaMode } : {}),
        });
        const timeline = await reads.run(
          (options) => next.loadTimeline(options),
          () => guard.isCurrent(current),
        );
        if (!guard.isCurrent(current)) return;
        gateway = next;
        const enabled = credentials.mediaMode === 'oni' && !!next.images;
        if (enabled)
          images = createImagePublisher(
            next.images!,
            () => guard.isCurrent(current),
            (mediaUploads) => update({ mediaUploads }),
          );
        update({
          ...landed(timeline, now()),
          demo: next.demo === true,
          imageUploadEnabled: enabled || next.demo === true,
          privateImageUploadEnabled: enabled && timeline.actor.privateMedia === true,
          imageReadEnabled: credentials.mediaMode === 'oni' && !!next.imageReader && !next.demo,
        });
      } catch (error) {
        if (guard.isCurrent(current) && !(error instanceof TimelineReadCancelled))
          update({ error: toFailure(error) });
      } finally {
        if (guard.isCurrent(current)) {
          connecting = false;
          update({ connecting: false });
        }
      }
    },
    /** Authorizes exactly the current pending chunk; repeated clicks do nothing. */
    continueReading: () => reads.continueReading(),
    /** Cancels only a full timeline read, never a POST or relationship operation. */
    cancelReading: () => reads.cancel(),
    async loadRelationships() {
      await relationshipController().refresh();
    },
    continueRelationshipReading: () => relationships?.continueReading() ?? false,
    cancelRelationshipReading: () => relationships?.cancelReading(),
    async follow(target: string) {
      await relationshipController().follow(target);
    },
    async unfollow(target: string) {
      await relationshipController().unfollow(target);
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
      // Capture the submission before it waits in the write queue. A later edit to
      // the draft or its parent cannot change recipients between Image and Note.
      const parent = replyTo ? { ...replyTo, mentions: [...replyTo.mentions] } : undefined;
      const bounded: NoteDraft = {
        ...draft,
        ...(draft.images ? { images: draft.images.map((image) => ({ ...image })) } : {}),
        ...(draft.attachments
          ? {
              attachments: draft.attachments.map((attachment) => ({
                ...attachment,
                audience: { to: [...attachment.audience.to], cc: [...attachment.audience.cc] },
              })),
            }
          : {}),
        visibility: clampVisibility(draft.visibility, parent?.visibility),
      };
      return write(
        async (active) => {
          const current = guard.current();
          const { images: selected, ...outgoing } = bounded;
          if (selected?.length) {
            const problem = validateImages(selected);
            if (problem) throw new SessionError({ kind: 'media-invalid', reason: problem });
            if (active.demo) throw new GatewayReadOnly('publish');
            if (!images) throw new SessionError({ kind: 'media-unsupported' });
            if (
              bounded.visibility !== 'public' &&
              bounded.visibility !== 'unlisted' &&
              !snapshot.privateImageUploadEnabled
            )
              throw new SessionError({ kind: 'media-scope' });
            if (!snapshot.actor) throw new SessionError({ kind: 'not-connected' });
            const actor = { id: snapshot.actor.id, followers: snapshot.actor.followers };
            const audience = buildAddressing(bounded.visibility, actor, parent);
            outgoing.attachments = await images.prepare(selected, audience);
            if (!guard.isCurrent(current)) throw new SessionError({ kind: 'not-connected' });
          }
          await active.publishNote(outgoing, parent);
          if (guard.isCurrent(current))
            for (const image of selected ?? []) images?.discard(image.id);
        },
        { notice: 'published', action: replyTo ? 'reply' : 'publish' },
      );
    },
    /** Only an explicit request for an attachment in the current timeline may load bytes. */
    async loadImage(noteId: string, url: string, signal: AbortSignal): Promise<ReadImage> {
      if (connecting || !gateway || !snapshot.actor)
        throw new SessionError({ kind: 'not-connected' });
      const reader = gateway.imageReader;
      if (!snapshot.imageReadEnabled || !reader)
        throw new SessionError({ kind: 'media-unsupported' });
      const current = guard.current();
      const target = () =>
        snapshot.timeline?.notes
          .find((note) => note.id === noteId)
          ?.attachments.find((attachment) => attachment.kind === 'image' && attachment.url === url);
      const attachment = target();
      if (!attachment) throw new SessionError({ kind: 'media-unsupported' });
      const activeSignal = AbortSignal.any([
        signal,
        ...(cancellation ? [cancellation.signal] : []),
      ]);
      activeSignal.throwIfAborted();
      const result = await reader.load(
        { url: attachment.url, mediaType: attachment.mediaType },
        activeSignal,
      );
      activeSignal.throwIfAborted();
      if (!guard.isCurrent(current) || target()?.mediaType !== attachment.mediaType || !target())
        throw new SessionError({ kind: 'not-connected' });
      return result;
    },
    /** Drops local receipts only; uploaded server objects are never deleted here. */
    discardImage(id: string) {
      images?.discard(id);
    },
    async resolveImage(id: string) {
      if (connecting) throw new SessionError({ kind: 'busy' });
      if (!gateway) throw new SessionError({ kind: 'not-connected' });
      if (!images) throw new SessionError({ kind: 'media-unsupported' });
      const current = guard.current();
      try {
        await images.resolve(id);
        if (guard.isCurrent(current)) update({ error: undefined });
      } catch (error) {
        if (guard.isCurrent(current)) update({ error: toFailure(error) });
        throw error;
      }
    },
    /**
     * Like/share (`active`) or withdraw this actor's own reaction (`!active`). Withdrawing
     * deletes the reaction activity, so it needs the activity IRI the load carried: without
     * one the request is refused (`reaction-missing`) rather than aimed at a guessed IRI.
     */
    react(note: TimelineNote, kind: ReactionKind, active: boolean) {
      if (connecting) return Promise.reject(new SessionError({ kind: 'busy' }));
      if (!gateway) return Promise.reject(new SessionError({ kind: 'not-connected' }));
      const own = ownReaction(note, kind, snapshot.actor?.id);
      if (!active && !own) return Promise.reject(new SessionError({ kind: 'reaction-missing' }));
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
      images = undefined;
      relationships?.dispose();
      relationships = undefined;
      relationshipActor = undefined;
      connecting = false;
      queue.reset();
      update(emptySnapshot());
    },
  };
}

export type SocialSession = ReturnType<typeof createSocialSession>;
