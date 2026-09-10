import type { ASObject, Evaluation, NoteReaction, TimelineNote } from './social';
import { record, str, iri, isType, kind, sameOrigin } from './activitystreams';
import { inferVisibility, normalizeAttachments, recipients } from './note-content';

interface EvaluateOptions {
  /** The followers collection of an author when known (usually only the session actor). */
  followersOf?: (author: string) => string | undefined;
  /** The reading actor: a note addressed only to them (and other people) is direct. */
  self?: string;
}
const summaryOf = (value: unknown) => str(value)?.trim() || undefined;
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (record(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
const time = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const activityTime = (a: ASObject) =>
  time(
    a.published ??
      a.updated ??
      (record(a.object) ? (a.object.updated ?? a.object.published) : undefined),
  );
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isHttp = (value: string) => /^https?:\/\//i.test(value);
/** Actor IRIs from `tag` entries of type Mention with an http(s) `href`; sorted and deduplicated. */
function mentions(tag: unknown): string[] {
  const entries = Array.isArray(tag) ? tag : tag === undefined ? [] : [tag];
  const found = new Set<string>();
  for (const entry of entries) {
    if (!record(entry) || !isType(entry, 'Mention')) continue;
    const href = str(entry.href);
    if (href && isHttp(href)) found.add(href);
  }
  return [...found].sort(compare);
}
/**
 * A Tombstone stands for an object the server says no longer exists. Some servers answer a
 * deleted object with one (`formerType` naming what it was), and leave the original Create
 * or Update in the outbox with its object swapped for it.
 */
export const isTombstone = (value: unknown): boolean =>
  record(value) && (isType(value, 'Tombstone') || value.formerType !== undefined);
/** True when the activity is, or carries, a Tombstone: it reports a deletion, not content. */
const buries = (a: ASObject) => isTombstone(a) || isTombstone(a.object);
/** The IRI a burying activity names, when the Tombstone carries one. */
const buriedId = (a: ASObject) => (isTombstone(a) ? iri(a) : iri(a.object));

/**
 * The reader's own Like or Announce on `note` as an activity a withdrawal can address.
 * Withdrawing means deleting that activity, so a reaction whose IRI the snapshot never
 * carried is not withdrawable: the client must say so instead of guessing an IRI.
 */
export function ownReaction(
  note: Pick<TimelineNote, 'reactions'>,
  kind: NoteReaction['kind'],
  actor?: string,
): NoteReaction | undefined {
  if (!actor) return undefined;
  return note.reactions.find((r) => r.kind === kind && r.actor === actor && isHttp(r.activity));
}
function toNote(value: ASObject, options: EvaluateOptions): TimelineNote | undefined {
  const id = iri(value),
    author = iri(value.attributedTo);
  if (
    !isType(value, 'Note') ||
    !id ||
    !author ||
    !sameOrigin(id, author) ||
    typeof value.content !== 'string'
  )
    return undefined;
  const mentioned = mentions(value.tag);
  return {
    id,
    author,
    content: value.content,
    summary: summaryOf(value.summary),
    visibility: inferVisibility(
      recipients(value.to),
      recipients(value.cc),
      options.followersOf?.(author),
      [author, ...mentioned, ...(options.self ? [options.self] : [])],
    ),
    attachments: normalizeAttachments(value.attachment),
    published: str(value.published),
    updated: str(value.updated),
    inReplyTo: iri(value.inReplyTo),
    url: iri(value.url),
    announcedBy: [],
    likedBy: [],
    reactions: [],
    mentions: mentioned,
  };
}
/**
 * The first pages of the collections, read after a write, laid over everything the last
 * full read holds. Activities are keyed by IRI (by content when they have none): one the
 * server sent again replaces the held copy - a Create whose object the server has since
 * rewritten as a Tombstone must win over the copy still carrying the note - and an
 * activity that fell off the first page stays held, since nothing said it was gone. Order
 * is not meaningful here; `evaluateActivities` sorts deterministically. Pure.
 */
export function mergeActivities(
  existing: readonly ASObject[],
  incoming: readonly ASObject[],
): ASObject[] {
  const merged = new Map<string, ASObject>();
  for (const activity of existing) merged.set(iri(activity) ?? stable(activity), activity);
  for (const activity of incoming) merged.set(iri(activity) ?? stable(activity), activity);
  return [...merged.values()];
}
interface Reaction {
  actor: string;
  note: string;
}
/** A deterministic snapshot evaluator for the compact ActivityStreams subset documented in README.md. */
export function evaluateActivities(input: ASObject[], options: EvaluateOptions = {}): Evaluation {
  const diagnostics = { ignored: 0, rejected: 0 };
  const unique = new Map<string, ASObject>();
  // Resolve conflicting repeated activity IDs consistently, independent of page order.
  for (const activity of [...input].sort((a, b) => compare(stable(a), stable(b)))) {
    const key = iri(activity) ?? stable(activity);
    if (!unique.has(key)) unique.set(key, activity);
  }
  const activities = [...unique.values()].sort(
    (a, b) => activityTime(a) - activityTime(b) || compare(stable(a), stable(b)),
  );
  const notes = new Map<string, TimelineNote>();
  const direct = new Set<string>();
  const announcements = new Map<string, Reaction>();
  const likes = new Map<string, Reaction>();
  const deleted = new Set<string>();
  // Establish immutable ownership before evaluating mutations and tombstones.
  for (const a of activities) {
    if (buries(a)) continue;
    const type = kind(a);
    if (!type) {
      diagnostics.ignored++;
      continue;
    }
    if (!['Create', 'Note', 'Announce'].includes(type)) continue;
    const object = type === 'Note' ? a : a.object;
    const n = record(object) ? toNote(object, options) : undefined;
    const actor = iri(a.actor);
    if (!n || (type === 'Create' && actor !== n.author) || (type === 'Announce' && !actor)) {
      diagnostics.rejected++;
      continue;
    }
    if (!notes.has(n.id)) notes.set(n.id, n);
    if (notes.get(n.id)!.author !== n.author) {
      diagnostics.rejected++;
      continue;
    }
    if (type === 'Announce') announcements.set(iri(a) ?? stable(a), { actor: actor!, note: n.id });
    else direct.add(n.id);
  }
  // Burials are read next, before any mutation: a server that answers a deleted object with
  // a Tombstone leaves the original Create in place with the Tombstone as its object, so the
  // note must not come back from that Create, from an Announce, or from a stale Update. A
  // Tombstone wrapped in someone's activity is that someone's word, though, and only the
  // author may take their note out: Mastodon's Delete carries a Tombstone, and one relayed
  // from anyone else over a note known here is refused. A bare Tombstone, or one in an
  // activity naming no actor, is the server's own answer and stands; so does one over a
  // note nobody loaded, since there is nothing of anyone's to protect.
  for (const a of activities) {
    if (!buries(a)) continue;
    const id = buriedId(a);
    if (!id) continue;
    const actor = isTombstone(a) ? undefined : iri(a.actor);
    const owner = notes.get(id)?.author;
    if (actor && owner && actor !== owner) {
      diagnostics.rejected++;
      continue;
    }
    deleted.add(id);
  }
  // Likes never establish notes; they only attach to notes known from Create/Note/Announce.
  for (const a of activities) {
    if (buries(a) || kind(a) !== 'Like') continue;
    const actor = iri(a.actor),
      target = iri(a.object);
    const embedded = record(a.object) ? toNote(a.object, options) : undefined;
    // An embedded object that is not a valid Note (e.g. cross-origin attributedTo) is as suspect
    // as an author mismatch: it must not attach to the known note under the same IRI.
    const malformed = record(a.object) && !embedded;
    const known = target ? notes.get(target) : undefined;
    if (
      !actor ||
      malformed ||
      (!known && !embedded) ||
      (known && embedded && embedded.author !== known.author)
    ) {
      diagnostics.rejected++;
      continue;
    }
    // A valid embedded Note that never appears as Create/Note/Announce is not shown.
    if (!known) continue;
    likes.set(iri(a) ?? stable(a), { actor, note: known.id });
  }
  /** Withdraws `actor`'s own Like or Announce named by `id`; false when there is none. */
  const withdraw = (id: string | undefined, actor: string | undefined): boolean => {
    const source = id ? (announcements.has(id) ? announcements : likes) : undefined;
    const target = id ? source?.get(id) : undefined;
    if (!target || target.actor !== actor) return false;
    source!.delete(id!);
    return true;
  };
  for (const a of activities) {
    if (buries(a)) continue;
    const type = kind(a),
      actor = iri(a.actor),
      id = iri(a.object);
    if (type === 'Update') {
      const previous = id ? notes.get(id) : undefined;
      if (
        !previous ||
        actor !== previous.author ||
        !record(a.object) ||
        (a.object.attributedTo !== undefined && iri(a.object.attributedTo) !== previous.author)
      ) {
        diagnostics.rejected++;
        continue;
      }
      const patch = a.object;
      // Hydrated Create objects can already include edits newer than historical Updates.
      const patchTime = time(patch.updated ?? a.updated ?? a.published ?? patch.published);
      if (patchTime < time(previous.updated ?? previous.published)) continue;
      if (patch.content !== undefined && typeof patch.content !== 'string') {
        diagnostics.rejected++;
        continue;
      }
      notes.set(previous.id, {
        ...previous,
        content: str(patch.content) ?? previous.content,
        summary: patch.summary === undefined ? previous.summary : summaryOf(patch.summary),
        attachments:
          patch.attachment === undefined
            ? previous.attachments
            : normalizeAttachments(patch.attachment),
        updated:
          str(patch.updated) ??
          str(a.updated) ??
          str(a.published) ??
          str(patch.published) ??
          previous.updated,
        inReplyTo:
          patch.inReplyTo === null ? undefined : (iri(patch.inReplyTo) ?? previous.inReplyTo),
        mentions: patch.tag === undefined ? previous.mentions : mentions(patch.tag),
      });
    } else if (type === 'Delete') {
      // A Delete removes its actor's own note, or - the only way some servers allow a
      // reaction to be taken back - its own Like or Announce activity.
      if (id && notes.get(id)?.author === actor) deleted.add(id);
      else if (!withdraw(id, actor)) diagnostics.rejected++;
    } else if (type === 'Undo') {
      // Only the reacting actor may withdraw its own Announce or Like.
      if (!withdraw(id, actor)) diagnostics.rejected++;
    }
  }
  const reactions = new Map<string, NoteReaction[]>();
  const attach = (kindName: NoteReaction['kind'], source: Map<string, Reaction>) => {
    for (const [activity, { actor, note }] of source) {
      const n = notes.get(note)!;
      const list = kindName === 'like' ? n.likedBy : n.announcedBy;
      if (!list.includes(actor)) list.push(actor);
      if (!reactions.has(note)) reactions.set(note, []);
      reactions.get(note)!.push({ kind: kindName, actor, activity });
    }
  };
  attach('share', announcements);
  attach('like', likes);
  const result = [...notes.values()].filter(
    (n) => !deleted.has(n.id) && (direct.has(n.id) || n.announcedBy.length > 0),
  );
  for (const n of result) {
    n.announcedBy.sort(compare);
    n.likedBy.sort(compare);
    n.reactions = (reactions.get(n.id) ?? []).sort(
      (a, b) =>
        compare(a.kind, b.kind) || compare(a.actor, b.actor) || compare(a.activity, b.activity),
    );
  }
  result.sort((a, b) => time(b.published) - time(a.published) || compare(a.id, b.id));
  return { notes: result, deleted: [...deleted].sort(compare), diagnostics };
}
