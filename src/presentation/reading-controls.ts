import type { TimelineNote } from '../domain/social';

/** Only author IRIs are stored; malformed entries and the reader's own IRI are ignored. */
export function mutedAuthorIds(ids: readonly string[], self?: string): string[] {
  return [
    ...new Set(
      ids.filter((id) => {
        if (typeof id !== 'string' || id === self) return false;
        try {
          return ['https:', 'http:'].includes(new URL(id).protocol);
        } catch {
          return false;
        }
      }),
    ),
  ];
}

/** Local reading projection; never edits the loaded timeline or its saved links. */
export function readingNotes(
  notes: readonly TimelineNote[],
  muted: readonly string[],
  self?: string,
) {
  const authors = new Set(mutedAuthorIds(muted, self));
  const hidden = notes.filter((note) => authors.has(note.author));
  return {
    notes: notes.filter((note) => !authors.has(note.author)),
    hiddenNoteIds: new Set(hidden.map((note) => note.id)),
  };
}
