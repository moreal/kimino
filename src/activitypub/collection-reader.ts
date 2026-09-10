import { getLogger } from '@logtape/logtape';
import type { ASObject } from '../domain/social';
import { record, iri, isType, kind, safeUrl } from '../domain/activitystreams';
import { GatewayHttpError } from '../application/gateway-errors';
import { unexpected } from './errors';
const logger = getLogger(['kimino', 'activitypub']);

export interface CollectionReaderOptions {
  /** Reads one ActivityStreams object by IRI, with the session's credentials and checks. */
  fetch: (url: string) => Promise<ASObject>;
  /** How many pages of one collection may be followed before the read is refused as truncated. */
  maxPages: number;
  /** Activities already loaded, by IRI: a recent read that spends no request on them. */
  held?: Map<string, ASObject>;
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
export function createCollectionReader({ fetch, maxPages, held }: CollectionReaderOptions) {
  const recent = held !== undefined;
  const cache = new Map<string, Promise<ASObject>>();
  const read = (url: string) => {
    const key = safeUrl(url);
    if (!cache.has(key)) cache.set(key, fetch(key));
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
      throw unexpected('Object resolution limit exceeded; timeline would be truncated.');
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
    const result: ASObject[] = [],
      seen = new Set<string>();
    let page: unknown = start,
      base = start,
      count = 0,
      declared: number | undefined;
    while (page) {
      if (++count > maxPages)
        throw unexpected('Collection page limit exceeded; timeline would be truncated.');
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
        if (seen.has(url)) throw unexpected('Collection pagination cycle detected.');
        seen.add(url);
        base = url;
        object = await read(url);
      } else if (record(page)) {
        object = page;
        const key = iri(page);
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
      if (count === 1 && typeof object.totalItems === 'number' && object.totalItems >= 0)
        declared = Math.floor(object.totalItems);
      const items = object.orderedItems ?? object.items;
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
      page = recent
        ? count === 1 && items === undefined
          ? object.first
          : undefined
        : (object.next ?? (count === 1 ? object.first : undefined));
    }
    return { items: result, declared };
  };
  return collection;
}
