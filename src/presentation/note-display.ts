import type { Actor, ReactionKind, TimelineNote } from '../domain/social';
import { actorName } from './actor-name';
import { copy } from './copy';
import { readableText } from './feed';
import { safeHttpUrl } from './links';

/** Purely presentational: a stable 0..5 palette index derived from the author IRI. */
export function authorHue(author: string): number {
  let hash = 0;
  for (const char of author) hash = (hash * 31 + char.charCodeAt(0)) % 6;
  return hash;
}

/** "좋아요 3" while there is something to count, otherwise just the label. */
export function withCount(label: string, count: number): string {
  return count > 0 ? `${label} ${count}` : label;
}

/** Whether `actor` currently has a like/share in effect on `note`. */
export function reactedBy(note: TimelineNote, kind: ReactionKind, actor?: string): boolean {
  if (!actor) return false;
  return (kind === 'like' ? note.likedBy : note.announcedBy).includes(actor);
}

/** A note edited after it was published; equal or unparseable stamps do not count. */
export function isEdited(note: Pick<TimelineNote, 'published' | 'updated'>): boolean {
  if (!note.updated) return false;
  return Date.parse(note.updated) > Date.parse(note.published || '');
}

/**
 * What the in-app actor sheet can say honestly from loaded data alone. The name and the
 * address come from the one rule every card uses (`actorName`), so the sheet's heading and
 * its line under it never disagree with the card that opened it.
 */
export interface ActorProfile {
  readonly id: string;
  /** What the person is called on screen: the same word the cards use. */
  readonly name: string;
  /** `@user@host`, or the host alone; absent when it would only repeat the name. */
  readonly handle?: string;
  /** The server hostname; empty when the IRI is not a URL. */
  readonly host: string;
  /** Notes by this person in the loaded timeline (this session, this page). */
  readonly loaded: number;
  /** A safe http(s) link to the profile on its server, if the IRI is one. */
  readonly url?: string;
}
export function actorProfile(notes: TimelineNote[], id: string, self?: Actor): ActorProfile {
  let host = '';
  try {
    host = new URL(id).host;
  } catch {
    /* Not a URL: the name falls back to the raw value. */
  }
  const { primary, secondary } = actorName(id, self);
  return {
    id,
    name: primary,
    handle: secondary,
    host,
    loaded: notes.filter((note) => note.author === id).length,
    url: safeHttpUrl(id),
  };
}

/**
 * Whether the text behind a content warning is on screen: the per-note toggle (held by the
 * view model for the session) opens it, unless the browser preference already opens every
 * warned note, in which case the same toggle closes this one. One rule, both directions.
 */
export const warnedRevealed = (alwaysOpen: boolean, toggled: boolean): boolean =>
  alwaysOpen !== toggled;

/** How many characters of the parent a reply cue quotes before it trails off. */
const CUE_EXCERPT_LENGTH = 40;

/** The first `max` characters of `text`, trailing off with an ellipsis when it was cut. */
export function excerpt(text: string, max = CUE_EXCERPT_LENGTH): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, max).join('').trimEnd()}…`;
}

/**
 * The cue on a reply whose parent is loaded: who wrote the parent and its first words, so
 * two replies in one timeline can be told apart by what they answer. A warned parent lends
 * its warning summary, never the body it hides. A reply to one's own note is a continuation.
 */
export function replyCueText(
  note: Pick<TimelineNote, 'author'>,
  parent: Pick<TimelineNote, 'author' | 'content' | 'summary'>,
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
): string {
  if (parent.author === note.author) return copy.openParentSelf;
  const text = readableText(parent.summary ?? '') || readableText(parent.content);
  return copy.openParentOf(actorName(parent.author, self).primary, excerpt(text));
}
