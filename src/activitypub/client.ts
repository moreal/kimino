import { getLogger } from '@logtape/logtape';
import type {
  ASObject,
  Actor,
  TimelineNote,
  Evaluation,
  ClientOptions,
  ReactionKind,
} from './types';
import { NS, record, str, iri, isType, kind, safeUrl, sameOrigin } from './values';
import { evaluateActivities } from './evaluate';
const logger = getLogger(['kimino', 'activitypub']);
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message = `ActivityPub request failed (${status}). Check server access, CORS, and token permissions.`,
  ) {
    super(message);
  }
}
/** The outbox refused a Like/Announce/Undo; `status` lets callers classify without parsing text. */
class ActivityRejectedError extends HttpStatusError {
  constructor(status: number, type: string) {
    super(
      status,
      `Server rejected the ${type} activity (${status}). Check the outbox before retrying.`,
    );
  }
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
  private async request(url: string, init: RequestInit = {}): Promise<Response> {
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
    const response = await this.fetcher(target, {
      ...init,
      headers,
      credentials: 'omit',
      redirect: 'error',
      signal: this.signal
        ? AbortSignal.any([this.signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      logger.warn('ActivityPub request failed', { status: response.status });
      throw new HttpStatusError(response.status);
    }
    return response;
  }
  private async json(url: string): Promise<ASObject> {
    const response = await this.request(url);
    const value: unknown = await response.json();
    if (!record(value)) throw new Error('Expected an ActivityStreams JSON object.');
    return value;
  }
  private async actor(): Promise<Actor> {
    const a = await this.json(this.actorUrl),
      id = iri(a),
      inbox = iri(a.inbox),
      outbox = iri(a.outbox);
    if (!id || !inbox || !outbox || !sameOrigin(id, this.actorUrl))
      throw new Error('Actor must have an id, inbox, and outbox on a trusted actor origin.');
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
  async loadTimeline(): Promise<
    Evaluation & {
      actor: Actor;
      activities: ASObject[];
    }
  > {
    const actor = await this.actor();
    const cache = new Map<string, Promise<ASObject>>();
    const read = (url: string) => {
      const key = safeUrl(url);
      if (!cache.has(key)) cache.set(key, this.json(key));
      return cache.get(key)!;
    };
    let resolved = 0;
    const resolve = async (
      value: unknown,
      base: string,
      path = new Set<string>(),
      depth = 0,
    ): Promise<ASObject> => {
      if (depth > 8 || ++resolved > 10000)
        throw new Error('Object resolution limit exceeded; timeline would be truncated.');
      let object: ASObject;
      if (typeof value === 'string' || (record(value) && !value.type && (value.id || value.href))) {
        const url = safeUrl(iri(value)!, base);
        if (path.has(url)) throw new Error('Activity object reference cycle detected.');
        path = new Set(path).add(url);
        try {
          object = await read(url);
        } catch (error) {
          // Only absent nested objects are optional. Missing activity/page endpoints,
          // access failures, and network failures still fail the load explicitly.
          if (depth > 0 && error instanceof HttpStatusError && [404, 410].includes(error.status)) {
            logger.info('Referenced activity object is unavailable', { status: error.status });
            return { id: url, type: 'Tombstone' };
          }
          throw error;
        }
        base = url;
        if (iri(object) && safeUrl(iri(object)!, base) !== url)
          throw new Error('Resolved object ID does not match its requested IRI.');
      } else if (record(value)) object = value;
      else throw new Error('Invalid ActivityStreams collection item.');
      const type = kind(object);
      // Delete and Undo need only the target ID; fetching a deleted object may return 410.
      if (
        ['Create', 'Update', 'Announce', 'Like'].includes(type ?? '') &&
        object.object !== undefined
      )
        return { ...object, object: await resolve(object.object, base, path, depth + 1) };
      return object;
    };
    const collection = async (start: string): Promise<ASObject[]> => {
      const result: ASObject[] = [],
        seen = new Set<string>();
      let page: unknown = start,
        base = start,
        count = 0;
      while (page) {
        if (++count > this.maxPages)
          throw new Error('Collection page limit exceeded; timeline would be truncated.');
        let object: ASObject;
        if (
          typeof page === 'string' ||
          (record(page) &&
            !page.orderedItems &&
            !page.items &&
            !page.first &&
            !page.next &&
            iri(page))
        ) {
          const url = safeUrl(iri(page)!, base);
          if (seen.has(url)) throw new Error('Collection pagination cycle detected.');
          seen.add(url);
          base = url;
          object = await read(url);
        } else if (record(page)) {
          object = page;
          const key = iri(page);
          if (key) {
            if (seen.has(key)) throw new Error('Collection pagination cycle detected.');
            seen.add(key);
          }
        } else throw new Error('Invalid collection page.');
        if (
          !['Collection', 'OrderedCollection', 'CollectionPage', 'OrderedCollectionPage'].some(
            (t) => isType(object, t),
          ) &&
          object.orderedItems === undefined &&
          object.items === undefined &&
          object.first === undefined
        )
          throw new Error('Expected an ActivityStreams collection.');
        const items = object.orderedItems ?? object.items;
        if (items !== undefined && !Array.isArray(items))
          throw new Error('Collection items must be an array.');
        if (Array.isArray(items)) for (const item of items) result.push(await resolve(item, base));
        page = object.next ?? (count === 1 ? object.first : undefined);
      }
      return result;
    };
    const activities = [...(await collection(actor.inbox)), ...(await collection(actor.outbox))];
    const evaluation = evaluateActivities(activities);
    logger.info('Timeline evaluated', {
      notes: evaluation.notes.length,
      ...evaluation.diagnostics,
    });
    return { actor, activities, ...evaluation };
  }
  async publishNote(
    text: string,
    replyTo?: TimelineNote,
  ): Promise<{
    location: string;
    activity: ASObject | null;
  }> {
    if (!text.trim()) throw new Error('Write a note before publishing.');
    const actor = await this.actor();
    const to = [NS + 'Public'],
      cc = [
        ...new Set(
          [actor.followers, replyTo?.author].filter((v): v is string => !!v).map((v) => safeUrl(v)),
        ),
      ];
    const content = text
      .replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
      )
      .replace(/\r?\n/g, '<br>');
    const object: ASObject = {
      type: 'Note',
      attributedTo: actor.id,
      content,
      mediaType: 'text/html',
      to,
      cc,
    };
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
      throw new Error(
        `Server returned ${response.status}; ActivityPub creation requires 201 Created. Check the outbox before retrying.`,
      );
    const raw = response.headers.get('Location');
    if (!raw)
      throw new Error(
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
   * POST a Like or Announce for `note`. Servers may accept without a Location header
   * (ONI does), so the resulting activity IRI is only known after the next timeline load.
   */
  async react(kind: ReactionKind, note: TimelineNote): Promise<{ location: string | null }> {
    const actor = await this.actor();
    const cc = [
      ...new Set(
        [actor.followers, note.author]
          .filter((v): v is string => !!v)
          .map((v) => safeUrl(v))
          .filter((v) => v !== actor.id),
      ),
    ];
    return this.write(actor, {
      type: kind === 'like' ? 'Like' : 'Announce',
      actor: actor.id,
      object: safeUrl(note.id),
      to: [NS + 'Public'],
      cc,
    });
  }
  /** POST an Undo of one of this actor's own Like/Announce activities. Some servers reject this. */
  async undoReaction(activity: string): Promise<{ location: string | null }> {
    const actor = await this.actor();
    return this.write(actor, {
      type: 'Undo',
      actor: actor.id,
      object: safeUrl(activity),
      to: [NS + 'Public'],
    });
  }
  private async write(actor: Actor, activity: ASObject): Promise<{ location: string | null }> {
    let response: Response;
    try {
      response = await this.request(actor.outbox, {
        method: 'POST',
        body: JSON.stringify({ '@context': 'https://www.w3.org/ns/activitystreams', ...activity }),
      });
    } catch (error) {
      if (error instanceof HttpStatusError)
        throw new ActivityRejectedError(error.status, String(activity.type));
      throw error;
    }
    if (![200, 201, 202].includes(response.status))
      throw new Error(
        `Server returned ${response.status} for the ${String(activity.type)} activity; expected 201 Created. Check the outbox before retrying.`,
      );
    const raw = response.headers.get('Location');
    return { location: raw ? safeUrl(raw, actor.outbox) : null };
  }
}
