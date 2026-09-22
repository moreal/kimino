import type { CollectionReadOptions } from '../application/collection-read';
import { GatewayReadLimit } from '../application/gateway-errors';
import { awaitReadBudget } from './read-budget';
import type { ASObject } from '../domain/social';
import { iri, isType, record, safeUrl, sameOrigin } from '../domain/activitystreams';
import { unexpected } from './errors';

export interface MembershipReaderOptions extends CollectionReadOptions {
  actorOrigin: string;
  fetch: (url: string) => Promise<ASObject>;
  maxPages: number;
  maxMembers?: number;
}
const collectionTypes = [
  'Collection',
  'OrderedCollection',
  'CollectionPage',
  'OrderedCollectionPage',
];
const isCollection = (value: ASObject) => collectionTypes.some((type) => isType(value, type));

/**
 * Complete membership evidence, not a profile loader. Only local collection/page
 * resources are fetched; member IRIs remain data. Failure never returns partial
 * membership, so callers cannot mistake a failed traversal for confirmed absence.
 */
export async function readMembership(
  start: string,
  {
    actorOrigin,
    fetch,
    maxPages,
    maxMembers = 10000,
    signal,
    onReadBudget,
  }: MembershipReaderOptions,
): Promise<readonly string[]> {
  if (![maxPages, maxMembers].every((value) => Number.isSafeInteger(value) && value > 0))
    throw unexpected('Membership read limits must be positive integers.');
  const url = (value: unknown, base?: string): string => {
    try {
      const id = iri(value);
      if (!id) throw new Error();
      return safeUrl(id, base);
    } catch {
      throw unexpected('Invalid membership IRI.');
    }
  };
  const localPage = (value: unknown, base?: string) => {
    const id = url(value, base);
    if (!sameOrigin(id, actorOrigin) || new URL(id).hash)
      throw unexpected('Membership pages must remain on the actor origin without fragments.');
    return id;
  };
  const root = localPage(start);
  let base = root;
  let page: unknown = root;
  let pages = 0;
  let declared: number | undefined;
  const seen = new Set<string>();
  const members = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) throw unexpected('Membership pagination cycle detected.');
    seen.add(id);
  };
  while (page !== undefined && page !== null) {
    signal?.throwIfAborted();
    if (pages > 0 && pages % maxPages === 0)
      await awaitReadBudget(maxPages, { pages, items: members.size }, { signal, onReadBudget });
    pages++;
    let object: ASObject;
    const reference =
      typeof page === 'string' ||
      (record(page) && (isType(page, 'Link') || !page.type) && !!iri(page));
    if (reference) {
      const requested = localPage(page, base);
      visit(requested);
      signal?.throwIfAborted();
      object = await fetch(requested);
      signal?.throwIfAborted();
      if (!record(object)) throw unexpected('Expected a membership collection object.');
      if (object.id !== undefined && localPage(object.id, requested) !== requested) {
        const canonical = new URL(localPage(object.id, requested)),
          request = new URL(requested);
        const boundPage =
          (isType(object, 'CollectionPage') || isType(object, 'OrderedCollectionPage')) &&
          object.partOf !== undefined &&
          localPage(object.partOf, requested) === root;
        if (
          !boundPage ||
          canonical.origin !== request.origin ||
          canonical.pathname !== request.pathname
        )
          throw unexpected('Membership response ID does not match its requested IRI.');
      }
      base = requested;
    } else if (record(page)) {
      object = page;
      if (object.id !== undefined) {
        base = localPage(object.id, base);
        visit(base);
      }
    } else throw unexpected('Invalid membership page.');
    if (!isCollection(object))
      throw unexpected('Expected an ActivityStreams membership collection.');
    if (object.partOf !== undefined && localPage(object.partOf, base) !== root)
      throw unexpected('Membership page belongs to another collection.');
    if (object.totalItems !== undefined) {
      if (!Number.isSafeInteger(object.totalItems) || (object.totalItems as number) < 0)
        throw unexpected('Invalid membership total.');
      if (pages === 1) declared = object.totalItems as number;
    }
    if (object.orderedItems !== undefined && object.items !== undefined)
      throw unexpected('Membership page declares two item lists.');
    let items = object.orderedItems ?? object.items;
    const boundRootPage =
      pages === 1 &&
      (isType(object, 'CollectionPage') || isType(object, 'OrderedCollectionPage')) &&
      object.partOf !== undefined &&
      localPage(object.partOf, base) === root;
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
      boundRootPage && object.first != null ? localPage(object.first, base) : undefined;
    const restartAtFirst = firstTarget !== undefined && firstTarget !== base;
    if (items !== undefined && !Array.isArray(items))
      throw unexpected('Membership items must be an array.');
    if (restartAtFirst) items = undefined;
    if (pages === 1 && !restartAtFirst) {
      if (items === undefined && object.next != null)
        throw unexpected('Membership root has next without established first-page contents.');
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
        if (!referenceOnly || localPage(first, base) !== root)
          throw unexpected('Inline membership root does not identify itself as the first page.');
      }
    }
    // A null list is malformed, not proof that the collection is empty.
    if (object.orderedItems === null || object.items === null)
      throw unexpected('Membership items must be an array.');
    if (items !== undefined) {
      if (!Array.isArray(items)) throw unexpected('Membership items must be an array.');
      for (const item of items) {
        const id = url(item, base);
        if (members.has(id)) throw unexpected('Duplicate membership item.');
        members.add(id);
        if (members.size > maxMembers) throw new GatewayReadLimit('objects', maxMembers);
      }
    } else if (!(object.totalItems === 0 || (pages === 1 && object.first))) {
      throw unexpected('Membership page does not establish its contents.');
    }
    page = restartAtFirst
      ? firstTarget
      : (object.next ??
        (pages === 1 &&
        items === undefined &&
        object.first != null &&
        !(object.totalItems === 0 && localPage(object.first, base) === base)
          ? object.first
          : undefined));
  }
  signal?.throwIfAborted();
  if (declared !== undefined && members.size !== declared)
    throw unexpected('Membership total does not match the completed traversal.');
  return [...members].sort();
}
