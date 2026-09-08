import type { TimelineNote } from '../domain/social';
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
/** Plain text of a note for search: tags stripped, common entities decoded. */
export function readableText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Replies to my notes, or notes mentioning me, written by someone else. */
export function isReplyToMe(notes: TimelineNote[], note: TimelineNote, actor: string): boolean {
  if (!actor || note.author === actor) return false;
  if ((note.mentions ?? []).includes(actor)) return true;
  const parent = note.inReplyTo && notes.find((item) => item.id === note.inReplyTo);
  return !!parent && parent.author === actor;
}

export function selectNotes(
  notes: TimelineNote[],
  view: FeedView,
  actor: string,
  query: string,
  saved: string[],
) {
  const search = query.trim().toLocaleLowerCase();
  return notes.filter(
    (note) =>
      (view !== 'mine' || note.author === actor) &&
      (view !== 'saved' || saved.includes(note.id)) &&
      (view !== 'replies' || isReplyToMe(notes, note, actor)) &&
      (!search ||
        `${note.author} ${readableText(note.content)}`.toLocaleLowerCase().includes(search)),
  );
}
export function parentChain(notes: TimelineNote[], note: TimelineNote): TimelineNote[] {
  const parents: TimelineNote[] = [],
    visited = new Set([note.id]);
  let parent = note.inReplyTo;
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const found = notes.find((item) => item.id === parent);
    if (!found) break;
    parents.unshift(found);
    parent = found.inReplyTo;
  }
  return parents;
}
