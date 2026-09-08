import type { ASObject, Evaluation, NoteReaction, TimelineNote } from './social';
import { record, str, iri, isType, kind, sameOrigin } from './activitystreams';
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
function toNote(value: ASObject): TimelineNote | undefined {
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
  return {
    id,
    author,
    content: value.content,
    published: str(value.published),
    updated: str(value.updated),
    inReplyTo: iri(value.inReplyTo),
    url: iri(value.url),
    announcedBy: [],
    likedBy: [],
    reactions: [],
    mentions: mentions(value.tag),
  };
}
interface Reaction {
  actor: string;
  note: string;
}
/** A deterministic snapshot evaluator for the compact ActivityStreams subset documented in README.md. */
export function evaluateActivities(input: ASObject[]): Evaluation {
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
  // Establish immutable ownership before evaluating mutations and tombstones.
  for (const a of activities) {
    const type = kind(a);
    if (!type) {
      diagnostics.ignored++;
      continue;
    }
    if (!['Create', 'Note', 'Announce'].includes(type)) continue;
    const object = type === 'Note' ? a : a.object;
    const n = record(object) ? toNote(object) : undefined;
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
  // Likes never establish notes; they only attach to notes known from Create/Note/Announce.
  for (const a of activities) {
    if (kind(a) !== 'Like') continue;
    const actor = iri(a.actor),
      target = iri(a.object);
    const embedded = record(a.object) ? toNote(a.object) : undefined;
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
  const deleted = new Set<string>();
  for (const a of activities) {
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
      if (id && notes.get(id)?.author === actor) deleted.add(id);
      else diagnostics.rejected++;
    } else if (type === 'Undo') {
      // Only the reacting actor may withdraw its own Announce or Like.
      const source = id ? (announcements.has(id) ? announcements : likes) : undefined;
      const target = id ? source?.get(id) : undefined;
      if (target && target.actor === actor) source!.delete(id!);
      else diagnostics.rejected++;
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
  return { notes: result, diagnostics };
}
