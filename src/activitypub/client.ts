import { getLogger } from '@logtape/logtape';
import type { ASObject, Actor, TimelineNote, ClientOptions, ReactionKind } from './types';
import type { CollectionReach, NoteDraft, Timeline } from '../domain/social';
import type { Addressing } from '../domain/note-content';
import {
  buildAddressing,
  htmlFromPlain,
  reactionAddressing,
  withdrawalAddressing,
} from '../domain/note-content';
import { record, str, iri, isType, kind, safeUrl, sameOrigin } from '../domain/activitystreams';
import { evaluateActivities, isTombstone, mergeActivities } from '../domain/evaluate';
import { GatewayHttpError, GatewayUnreachable } from '../application/gateway-errors';
import { ActivityRejectedError, HttpStatusError, protocol, unexpected } from './errors';
import { createCollectionReader, type CollectionRead } from './collection-reader';
const logger = getLogger(['kimino', 'activitypub']);
/**
 * What the read actually reached: distinct activities (pages overlap on some servers, and a
 * repeated IRI is one activity), and per collection the shortfall against the `totalItems`
 * it declared. Shortfalls are counted per collection so one collection over-delivering
 * cannot hide another that came up short.
 */
function combineReach(parts: CollectionRead[]): CollectionReach {
  let fetched = 0,
    missing = 0;
  for (const part of parts) {
    const ids = new Set<string>();
    let anonymous = 0;
    for (const item of part.items) {
      const id = iri(item);
      if (id) ids.add(id);
      else anonymous++;
    }
    const read = ids.size + anonymous;
    fetched += read;
    if (part.declared !== undefined) missing += Math.max(0, part.declared - read);
  }
  return { fetched, missing };
}
export class ActivityPubClient {
  private readonly actorUrl: string;
  private readonly signal?: AbortSignal;
  private readonly token?: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly maxPages: number;
  constructor(options: ClientOptions) {
    this.actorUrl = safeUrl(options.actorUrl);
    this.signal = options.signal;
    this.token = options.token;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1)
      throw new Error('Page limit must be a positive integer.');
  }
  /**
   * `gone` is set by the one call that sends a Delete: a server may report a successful
   * deletion as 410 Gone, and only that call may read a 410 as success. Every other path
   * (reads, Create, Like/Announce, Update) still fails on it.
   */
  private async request(url: string, init: RequestInit = {}, gone = false): Promise<Response> {
    this.signal?.throwIfAborted();
    const target = safeUrl(url);
    const headers: Record<string, string> = {
      Accept:
        'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    };
    if (this.token && sameOrigin(target, this.actorUrl))
      headers.Authorization = `Bearer ${this.token}`;
    if (init.method === 'POST') headers['Content-Type'] = 'application/activity+json';
    // Do not log URLs, credentials, response bodies, or note text.
    logger.debug('ActivityPub request started', { method: init.method ?? 'GET' });
    let response: Response;
    try {
      response = await this.fetcher(target, {
        ...init,
        headers,
        credentials: 'omit',
        redirect: 'error',
        signal: this.signal
          ? AbortSignal.any([this.signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      });
    } catch (error) {
      // Cancellation by the session is not a server problem and passes through unchanged.
      if (this.signal?.aborted) throw error;
      logger.warn('ActivityPub request did not reach the server', {
        name: error instanceof Error ? error.name : typeof error,
      });
      throw new GatewayUnreachable(
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
    }
    if (!response.ok && !(gone && response.status === 410)) {
      logger.warn('ActivityPub request failed', { status: response.status });
      throw new HttpStatusError(response.status);
    }
    return response;
  }
  private async json(url: string): Promise<ASObject> {
    const response = await this.request(url);
    const value: unknown = await response.json();
    if (!record(value)) throw unexpected('Expected an ActivityStreams JSON object.');
    return value;
  }
  /**
   * The actor as last read. A full timeline read always reads it again (a renamed profile
   * shows on refresh); writes and the incremental read after them reuse it, so that read
   * costs one request per collection and nothing more.
   */
  private known?: Promise<Actor>;
  private actor(fresh = false): Promise<Actor> {
    if (fresh || !this.known)
      this.known = this.readActor().catch((error: unknown) => {
        this.known = undefined;
        throw error;
      });
    return this.known;
  }
  private async readActor(): Promise<Actor> {
    const a = await this.json(this.actorUrl),
      id = iri(a),
      inbox = iri(a.inbox),
      outbox = iri(a.outbox);
    if (!id || !inbox || !outbox || !sameOrigin(id, this.actorUrl))
      throw unexpected('Actor must have an id, inbox, and outbox on a trusted actor origin.');
    return {
      id: safeUrl(id),
      inbox: safeUrl(inbox, this.actorUrl),
      outbox: safeUrl(outbox, this.actorUrl),
      name: str(a.name),
      preferredUsername: str(a.preferredUsername),
      summary: str(a.summary),
      icon: record(a.icon) ? iri(a.icon.url) : iri(a.icon),
      followers: iri(a.followers),
    };
  }
  /** The full walk of both collections, to the end of every `next` chain. */
  async loadTimeline(): Promise<Timeline> {
    const actor = await this.actor(true);
    const collection = this.reader();
    const inbox = await collection(actor.inbox);
    const outbox = await collection(actor.outbox);
    const activities = [...inbox.items, ...outbox.items];
    return this.evaluate(actor, activities, combineReach([inbox, outbox]));
  }
  /**
   * The read after a confirmed write: the first page of each collection - where the tested
   * server lists the newest activity - laid over `previous`. Activities `previous` already
   * holds are neither re-read nor re-resolved. The reach is the last full read's, unchanged:
   * this read has not looked at how far the collections go, and says so with `partial`.
   *
   * `touched` names the objects the write changed (the edited note, the deleted note). Each
   * is read back with the session's credentials, whatever the first pages list: a server
   * that answers an Update by rewriting the object in place, with no new row, would
   * otherwise leave a note whose Create lies beyond page one showing its old words. The
   * answer is merged as an Update by this actor carrying the object as read - or, on 404,
   * 410 or a Tombstone body, carrying a Tombstone, which the evaluator reads as a
   * deletion. Keyed by the object IRI, a later read of the same object replaces an earlier
   * one instead of standing beside it.
   */
  async loadRecent(previous: Timeline, touched: readonly string[] = []): Promise<Timeline> {
    const actor = await this.actor();
    const held = new Map<string, ASObject>();
    for (const activity of previous.activities) {
      const id = iri(activity);
      if (id) held.set(id, activity);
    }
    const readBack: ASObject[] = [];
    for (const target of new Set(touched.map((t) => safeUrl(t))))
      readBack.push({
        id: `${target}#read-back`,
        type: 'Update',
        actor: actor.id,
        object: await this.readObject(target),
      });
    const collection = this.reader(held);
    const inbox = await collection(actor.inbox);
    const outbox = await collection(actor.outbox);
    const activities = mergeActivities(previous.activities, [
      ...inbox.items,
      ...outbox.items,
      ...readBack,
    ]);
    return { ...this.evaluate(actor, activities, previous.reach), partial: true };
  }
  /** A collection reader over this client's requests; see `createCollectionReader`. */
  private reader(held?: Map<string, ASObject>) {
    return createCollectionReader({
      fetch: (url) => this.json(url),
      maxPages: this.maxPages,
      held,
    });
  }
  private evaluate(actor: Actor, activities: ASObject[], reach?: CollectionReach): Timeline {
    const evaluation = evaluateActivities(activities, {
      followersOf: (author) => (author === actor.id ? actor.followers : undefined),
      self: actor.id,
    });
    logger.info('Timeline evaluated', {
      notes: evaluation.notes.length,
      ...evaluation.diagnostics,
      ...reach,
    });
    return { actor, activities, reach, ...evaluation };
  }
  async publishNote(
    draft: NoteDraft,
    replyTo?: TimelineNote,
  ): Promise<{
    location: string;
    activity: ASObject | null;
  }> {
    const actor = await this.actor();
    const { to, cc } = buildAddressing(draft.visibility, actor, replyTo);
    const content = htmlFromPlain(draft.content);
    const object: ASObject = {
      type: 'Note',
      attributedTo: actor.id,
      content,
      mediaType: 'text/html',
      to,
      cc,
    };
    // Servers drop `sensitive`; a non-empty summary is the interoperable content warning.
    const summary = draft.summary?.trim();
    if (summary) object.summary = summary;
    if (replyTo) object.inReplyTo = safeUrl(replyTo.id);
    const response = await this.request(actor.outbox, {
      method: 'POST',
      body: JSON.stringify({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Create',
        actor: actor.id,
        to,
        cc,
        object,
      }),
    });
    if (response.status !== 201)
      throw protocol(
        'unconfirmed-write',
        `Server returned ${response.status}; ActivityPub creation requires 201 Created. Check the outbox before retrying.`,
      );
    const raw = response.headers.get('Location');
    if (!raw)
      throw protocol(
        'unconfirmed-write',
        'Post may have been accepted, but Location is unavailable. The server must expose Location through CORS. Check the outbox before retrying.',
      );
    const location = safeUrl(raw, actor.outbox);
    let activity: ASObject | null = null;
    try {
      activity = await this.json(location);
    } catch {
      logger.info('Post accepted; created object is not readable yet');
    }
    return { location, activity };
  }
  /**
   * POST a Like or Announce for `note`, addressed no wider than `note` itself. Servers may
   * accept without a Location header (ONI does), so the resulting activity IRI is only known
   * after the next timeline load.
   */
  async react(kind: ReactionKind, note: TimelineNote): Promise<{ location: string | null }> {
    const actor = await this.actor();
    // Addressing comes from the note itself: a reaction never reaches further than what it
    // reacts to, and a scope this server cannot honour is refused before anything is sent.
    const { to, cc } = reactionAddressing(note, actor);
    return this.write(actor, {
      type: kind === 'like' ? 'Like' : 'Announce',
      actor: actor.id,
      object: safeUrl(note.id),
      to,
      cc,
    });
  }
  /**
   * Withdraw one of this actor's own Like or Announce activities by deleting it. Undo is not
   * used: servers that keep C2S reactions in the outbox (ONI among them) refuse an Undo of a
   * Like or Announce and take the reaction back only through a Delete of the activity itself.
   */
  async withdrawReaction(
    note: TimelineNote,
    activity: string,
  ): Promise<{ location: string | null }> {
    const actor = await this.actor();
    return this.remove(actor, safeUrl(activity), withdrawalAddressing(note, actor));
  }
  /**
   * Whether the server still holds `note`, read with this session's credentials. A 404 or a
   * 410, and a body that is a Tombstone, all mean gone; every other failure (offline, 401,
   * a malformed answer) rejects, so an unreachable server is never read as a deletion.
   */
  async noteExists(note: TimelineNote): Promise<boolean> {
    return !isTombstone(await this.readObject(safeUrl(note.id)));
  }
  /**
   * One object as the server holds it now, read with this session's credentials. A 404 or a
   * 410 becomes a Tombstone placeholder for that IRI; a Tombstone body is returned as is.
   * A body that names some other IRI as its id is refused, as `resolve` refuses it. Every
   * other failure rejects, so an unreachable server is never read as a deletion.
   */
  private async readObject(target: string): Promise<ASObject> {
    try {
      const object = await this.json(target);
      if (iri(object) && safeUrl(iri(object)!, target) !== target)
        throw unexpected('Resolved object ID does not match its requested IRI.');
      return object;
    } catch (error) {
      if (error instanceof GatewayHttpError && [404, 410].includes(error.status)) {
        logger.info('Touched object is unavailable', { status: error.status });
        return { id: target, type: 'Tombstone' };
      }
      throw error;
    }
  }
  /** POST a Delete of one of this actor's own notes, addressed no wider than the note. */
  async deleteNote(note: TimelineNote): Promise<{ location: string | null }> {
    const actor = await this.actor();
    return this.remove(actor, safeUrl(note.id), withdrawalAddressing(note, actor));
  }
  /**
   * POST an Update carrying the note's new content and content warning. The object is
   * embedded **with its id**: a bare IRI is accepted by servers that then change nothing.
   * Addressing is left out of the patch on purpose, so the note keeps exactly the audience
   * it was published to; this client never rewrites a published note's scope.
   */
  async updateNote(note: TimelineNote, draft: NoteDraft): Promise<{ location: string | null }> {
    const actor = await this.actor();
    return this.write(actor, {
      type: 'Update',
      actor: actor.id,
      object: {
        id: safeUrl(note.id),
        type: 'Note',
        attributedTo: actor.id,
        content: htmlFromPlain(draft.content),
        mediaType: 'text/html',
        // Always present: an omitted summary would leave the old warning in place, while an
        // empty one is how a warning is taken off again.
        summary: draft.summary?.trim() ?? '',
      },
    });
  }
  /** A Delete; its success status may be 410 Gone, which only this path accepts. */
  private remove(actor: Actor, target: string, addressing: Addressing) {
    return this.write(
      actor,
      { type: 'Delete', actor: actor.id, object: target, ...addressing },
      true,
    );
  }
  private async write(
    actor: Actor,
    activity: ASObject,
    gone = false,
  ): Promise<{ location: string | null }> {
    let response: Response;
    try {
      response = await this.request(
        actor.outbox,
        {
          method: 'POST',
          body: JSON.stringify({
            '@context': 'https://www.w3.org/ns/activitystreams',
            ...activity,
          }),
        },
        gone,
      );
    } catch (error) {
      if (error instanceof HttpStatusError)
        throw new ActivityRejectedError(error.status, String(activity.type));
      throw error;
    }
    // 410 Gone is a confirmed deletion, and is accepted for nothing but a Delete.
    if (![200, 201, 202, ...(gone ? [410] : [])].includes(response.status))
      throw protocol(
        'unconfirmed-write',
        `Server returned ${response.status} for the ${String(activity.type)} activity; expected 201 Created. Check the outbox before retrying.`,
      );
    const raw = response.headers.get('Location');
    return { location: raw ? safeUrl(raw, actor.outbox) : null };
  }
}
