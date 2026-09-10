import type { Actor, TimelineNote } from '../domain/social';
import { actorName } from './actor-name';
export type FeedView = 'all' | 'replies' | 'mine' | 'saved';

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};
const decodeEntities = (text: string) =>
  text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

/** Plain text of a note for search: tags stripped, common entities decoded. */
export function readableText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words behind a note's stored HTML, for reopening it in the composer. Line breaks and
 * block ends come back as newlines and every other tag is dropped, so what the writer sees
 * is what the gateway escapes and re-breaks on the way back out. Anything the composer
 * cannot express (links, emphasis) is flattened to its text: an edit rewrites the body.
 */
export function editableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote)\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * What the edit form opens with. An edit that was started and left unsent keeps its own
 * words; anything blank - including the empty string a composer writes back after a saved
 * edit - is not a draft, so the form comes back with what the server currently stores.
 */
export function editDraftText(kept: string | undefined, content: string): string {
  return kept && kept.trim() ? kept : editableText(content);
}

/**
 * Every loaded note by id, the first one winning when an id repeats - the same note a
 * linear `find` would return. Built once per projection so per-card lookups are O(1).
 */
export function indexById(notes: readonly TimelineNote[]): ReadonlyMap<string, TimelineNote> {
  const byId = new Map<string, TimelineNote>();
  for (const note of notes) if (!byId.has(note.id)) byId.set(note.id, note);
  return byId;
}
/** The loaded parent of `note`, if the timeline contains it. */
export function parentOf(notes: TimelineNote[], note: TimelineNote): TimelineNote | undefined {
  return note.inReplyTo ? notes.find((item) => item.id === note.inReplyTo) : undefined;
}
const parentIn = (byId: ReadonlyMap<string, TimelineNote>, note: TimelineNote) =>
  note.inReplyTo ? byId.get(note.inReplyTo) : undefined;
/** Replies to my notes, or notes mentioning me, written by someone else. */
export function isReplyToMe(notes: TimelineNote[], note: TimelineNote, actor: string): boolean {
  return isReplyToMeIn(indexById(notes), note, actor);
}
function isReplyToMeIn(
  byId: ReadonlyMap<string, TimelineNote>,
  note: TimelineNote,
  actor: string,
): boolean {
  if (!actor || note.author === actor) return false;
  if ((note.mentions ?? []).includes(actor)) return true;
  return parentIn(byId, note)?.author === actor;
}
/**
 * A note that reaches me only through a mention: it is not a reply to one of my notes
 * (either no parent, or a parent written by someone else), so my note is not above it.
 */
export function isMentionOnly(notes: TimelineNote[], note: TimelineNote, actor: string): boolean {
  if (!actor || note.author === actor || !(note.mentions ?? []).includes(actor)) return false;
  return parentOf(notes, note)?.author !== actor;
}

/**
 * Whether a search matches the person a note is from. It matches what the screen calls
 * them - the display name - and, for a query written as an address (any `@` in it), the
 * `@user@host` handle. The bare IRI is never searched: every author on one server shares
 * its host, so "localhost" would match the whole timeline and name nobody.
 */
export function matchesAuthor(
  author: string,
  search: string,
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
): boolean {
  const name = actorName(author, self);
  if (name.primary.toLocaleLowerCase().includes(search)) return true;
  const handle = name.secondary?.startsWith('@') ? name.secondary.toLocaleLowerCase() : undefined;
  return !!handle && search.includes('@') && handle.includes(search);
}

/**
 * The notes a list holds after the view and author filters (`scope`, what a search looks
 * through) and, of those, the ones the search matches (`notes`). One pass over the timeline.
 */
export function scopeNotes(
  notes: TimelineNote[],
  view: FeedView,
  actor: string,
  query: string,
  saved: string[],
  /** Client-side "only this person" filter over the loaded notes. */
  author?: string,
  /** The connected account, the one author whose name and username are known. */
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
): { notes: TimelineNote[]; scope: number } {
  const byId = view === 'replies' ? indexById(notes) : undefined;
  const scoped = notes.filter(
    (note) =>
      (!author || note.author === author) &&
      (view !== 'mine' || note.author === actor) &&
      (view !== 'saved' || saved.includes(note.id)) &&
      (!byId || isReplyToMeIn(byId, note, actor)),
  );
  const search = query.trim().toLocaleLowerCase();
  const matched = search
    ? scoped.filter(
        (note) =>
          matchesAuthor(note.author, search, self) ||
          readableText(note.content).toLocaleLowerCase().includes(search),
      )
    : scoped;
  return { notes: matched, scope: scoped.length };
}
export function selectNotes(
  notes: TimelineNote[],
  view: FeedView,
  actor: string,
  query: string,
  saved: string[],
  author?: string,
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
) {
  return scopeNotes(notes, view, actor, query, saved, author, self).notes;
}
export function parentChain(notes: TimelineNote[], note: TimelineNote): TimelineNote[] {
  const parents: TimelineNote[] = [],
    visited = new Set([note.id]);
  let current = note;
  while (current.inReplyTo && !visited.has(current.inReplyTo)) {
    visited.add(current.inReplyTo);
    const found = parentOf(notes, current);
    if (!found) break;
    parents.unshift(found);
    current = found;
  }
  return parents;
}
