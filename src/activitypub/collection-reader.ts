import { awaitReadBudget } from './read-budget';
import { getLogger } from '@logtape/logtape';
import type { ASObject } from '../domain/social';
import { record, iri, isType, kind, safeUrl, sameOrigin } from '../domain/activitystreams';
import { GatewayHttpError, GatewayReadLimit } from '../application/gateway-errors';
import { unexpected } from './errors';
const logger = getLogger(['kimino', 'activitypub']);

export interface CollectionReaderOptions {
  /** Reads one ActivityStreams object by IRI, with the session's credentials and checks. */
  fetch: (url: string) => Promise<ASObject>;
  /** Pages per explicit read chunk; no partial result is returned at the boundary. */
  maxPages: number;
  onReadBudget?: (progress: { pages: number; items: number }) => Promise<void>;
  signal?: AbortSignal;
  /** Activities already loaded, by IRI: a recent read that spends no request on them. */
  held?: Map<string, ASObject>;
  /** Relationship reads keep nested actor/object references as data. */
  resolveObjects?: boolean;
  /** Strict complete relationship evidence, with local collection pages only. */
  trustedOrigin?: string;
}
/** Every item this client could read from one collection, plus what the collection said it holds. */
export type CollectionRead = { items: ASObject[]; declared?: number };

/**
 * A collection reader with a fresh per-read resolution cache. `fetch` reads one ActivityStreams
 * object; `maxPages` bounds each collection's `next` chain. With `held`, it reads only
 * the first page of each collection and spends no request on an activity `held` already
 * has: a bare IRI of one is left out unread (the held copy stands), and an inline record
 * of one is taken fresh - a server may rewrite an activity's object in place, an edit or
 * a Tombstone, with no new activity - but its object is not fetched again when it only
 * points at what the held copy already resolved. A page of mostly known activities thus
 * costs one request.
 */
export function createCollectionReader({
  fetch,
  maxPages,
  held,
  resolveObjects = true,
  trustedOrigin,
  onReadBudget,
  signal,
}: CollectionReaderOptions) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1)
    throw unexpected('Page budget must be a positive integer.');
  const recent = held !== undefined;
  const cache = new Map<string, Promise<ASObject>>();
  const read = async (url: string) => {
    signal?.throwIfAborted();
    const key = safeUrl(url);
    if (!cache.has(key)) cache.set(key, fetch(key));
    const object = await cache.get(key)!;
    signal?.throwIfAborted();
    return object;
  };
  let resolved = 0;
  const resolve = async (
    value: unknown,
    base: string,
    path = new Set<string>(),
    depth = 0,
  ): Promise<ASObject> => {
    signal?.throwIfAborted();
    if (depth > 8) throw unexpected('Object resolution depth exceeded.');
    if (++resolved > 10000) throw new GatewayReadLimit('objects', 10000);
    let object: ASObject;
    if (typeof value === 'string' || (record(value) && !value.type && (value.id || value.href))) {
      const url = safeUrl(iri(value)!, base);
      if (path.has(url)) throw unexpected('Activity object reference cycle detected.');
      path = new Set(path).add(url);
      try {
        object = await read(url);
      } catch (error) {
        // Only absent nested objects are optional. Missing activity/page endpoints,
        // access failures, and network failures still fail the load explicitly.
        if (depth > 0 && error instanceof GatewayHttpError && [404, 410].includes(error.status)) {
          logger.info('Referenced activity object is unavailable', { status: error.status });
          return { id: url, type: 'Tombstone' };
        }
        throw error;
      }
      base = url;
      if (iri(object) && safeUrl(iri(object)!, base) !== url)
        throw unexpected('Resolved object ID does not match its requested IRI.');
    } else if (record(value)) object = value;
    else throw unexpected('Invalid ActivityStreams collection item.');
    const type = kind(object);
    // Delete and Undo need only the target ID; fetching a deleted object may return 410.
    if (
      resolveObjects &&
      ['Create', 'Update', 'Announce', 'Like'].includes(type ?? '') &&
      object.object !== undefined
    )
      return { ...object, object: await resolve(object.object, base, path, depth + 1) };
    return object;
  };
  /**
   * Every item this client could read from one collection, plus what the collection said
   * it holds. `declared` is only taken from the first object read, and only when it is a
   * plain non-negative count: a server that declares nothing is never assumed complete.
   */
  const collection = async (start: string): Promise<{ items: ASObject[]; declared?: number }> => {
    const localPage = (value: unknown, base: string) => {
      const reference = iri(value);
      if (!reference?.trim()) throw unexpected('Collection page reference must contain an IRI.');
      const url = safeUrl(reference, base);
      if (trustedOrigin && (!sameOrigin(url, trustedOrigin) || new URL(url).hash))
        throw unexpected('Relationship collection pages must stay on the actor origin.');
      return url;
    };
    const result: ASObject[] = [],
      seen = new Set<string>();
    let page: unknown = start,
      base = start,
      count = 0,
      declared: number | undefined;
    while (page) {
      signal?.throwIfAborted();
      if (count > 0 && count % maxPages === 0)
        await awaitReadBudget(
          maxPages,
          { pages: count, items: result.length },
          { signal, onReadBudget: recent ? undefined : onReadBudget },
        );
      count++;
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
        const url = localPage(iri(page)!, base);
        if (seen.has(url)) throw unexpected('Collection pagination cycle detected.');
        seen.add(url);
        base = url;
        object = await read(url);
        if (trustedOrigin && object.id !== undefined && localPage(object.id, url) !== url) {
          const canonical = new URL(localPage(object.id, url)),
            request = new URL(url);
          const boundPage =
            (isType(object, 'CollectionPage') || isType(object, 'OrderedCollectionPage')) &&
            object.partOf !== undefined &&
            localPage(object.partOf, url) === start;
          if (
            !boundPage ||
            canonical.origin !== request.origin ||
            canonical.pathname !== request.pathname
          )
            throw unexpected('Collection response ID mismatch.');
        }
      } else if (record(page)) {
        object = page;
        const rawKey = iri(page);
        const key = rawKey ? localPage(rawKey, base) : undefined;
        if (key) {
          if (seen.has(key)) throw unexpected('Collection pagination cycle detected.');
          seen.add(key);
        }
      } else throw unexpected('Invalid collection page.');
      if (
        !['Collection', 'OrderedCollection', 'CollectionPage', 'OrderedCollectionPage'].some((t) =>
          isType(object, t),
        ) &&
        object.orderedItems === undefined &&
        object.items === undefined &&
        object.first === undefined
      )
        throw unexpected('Expected an ActivityStreams collection.');
      if (trustedOrigin) {
        if (
          !['Collection', 'OrderedCollection', 'CollectionPage', 'OrderedCollectionPage'].some(
            (type) => isType(object, type),
          )
        )
          throw unexpected('Expected a relationship collection.');
        for (const link of [object.next, object.first]) {
          if (link != null && !((typeof link === 'string' && link.length > 0) || record(link)))
            throw unexpected('Malformed collection page link.');
        }
        if (object.partOf !== undefined && localPage(object.partOf, base) !== start)
          throw unexpected('Collection page belongs to another collection.');
        if (
          object.totalItems !== undefined &&
          (!Number.isSafeInteger(object.totalItems) || (object.totalItems as number) < 0)
        )
          throw unexpected('Invalid collection total.');
        if (
          object.items === null ||
          object.orderedItems === null ||
          (object.items !== undefined && object.orderedItems !== undefined)
        )
          throw unexpected('Invalid collection item lists.');
        if (
          object.items === undefined &&
          object.orderedItems === undefined &&
          !(object.totalItems === 0 || (count === 1 && object.first))
        )
          throw unexpected('Collection contents not established.');
      }
      if (count === 1 && typeof object.totalItems === 'number' && object.totalItems >= 0)
        declared = Math.floor(object.totalItems);
      let items = object.orderedItems ?? object.items;
      const boundRootPage =
        trustedOrigin &&
        count === 1 &&
        (isType(object, 'CollectionPage') || isType(object, 'OrderedCollectionPage')) &&
        object.partOf !== undefined &&
        localPage(object.partOf, base) === start;
      if (boundRootPage && object.first != null) {
        const first = object.first;
        const referenceOnly =
          typeof first === 'string' ||
          (record(first) &&
            (isType(first, 'Link') || !first.type) &&
            first.items === undefined &&
            first.orderedItems === undefined &&
            first.first === undefined &&
            first.next === undefined);
        if (!referenceOnly || !iri(first))
          throw unexpected('Canonical root first must be a page reference.');
      }
      const firstTarget =
        boundRootPage && object.first != null
          ? localPage(iri(object.first) ?? '', base)
          : undefined;
      const restartAtFirst = firstTarget !== undefined && firstTarget !== base;
      if (restartAtFirst) {
        if (items !== undefined && !Array.isArray(items))
          throw unexpected('Collection items must be an array.');
        items = undefined;
      }
      if (trustedOrigin && count === 1 && !restartAtFirst) {
        if (items === undefined && object.next != null)
          throw unexpected('Relationship root has next without established first-page contents.');
        if (items !== undefined && object.first != null) {
          const first = object.first;
          const referenceOnly =
            typeof first === 'string' ||
            (record(first) &&
              (isType(first, 'Link') || !first.type) &&
              first.items === undefined &&
              first.orderedItems === undefined &&
              first.first === undefined &&
              first.next === undefined);
          if (
            !referenceOnly ||
            !iri(first) ||
            localPage(iri(first)!, base) !== localPage(start, start)
          )
            throw unexpected('Inline relationship root does not identify itself as first.');
        }
      }
      if (items !== undefined && !Array.isArray(items))
        throw unexpected('Collection items must be an array.');
      if (Array.isArray(items))
        for (const item of items) {
          const id = iri(item);
          const previous = held && id ? held.get(safeUrl(id, base)) : undefined;
          if (previous) {
            if (!record(item)) continue;
            const target = typeof item.object === 'string' ? safeUrl(item.object, base) : '';
            if (target && record(previous.object) && iri(previous.object) === target) {
              result.push({ ...item, object: previous.object });
              continue;
            }
          }
          result.push(await resolve(item, base));
        }
      // A recent read stops at the first page that carries items; a collection whose root
      // only points at `first` is followed there once.
      page = restartAtFirst
        ? firstTarget
        : recent
          ? count === 1 && items === undefined
            ? object.first
            : undefined
          : (object.next ??
            (count === 1 &&
            (!trustedOrigin ||
              (items === undefined &&
                !(
                  object.totalItems === 0 &&
                  object.first != null &&
                  localPage(iri(object.first) ?? '', base) === base
                )))
              ? object.first
              : undefined));
    }
    if (trustedOrigin && declared !== undefined) {
      const ids = new Set(result.map((item) => iri(item)).filter(Boolean));
      const anonymous = result.filter((item) => !iri(item)).length;
      if (ids.size + anonymous !== declared)
        throw unexpected('Collection total does not match complete read.');
    }
    return { items: result, declared };
  };
  return collection;
}
