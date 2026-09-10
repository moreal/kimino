import type { ASObject, Attachment, AttachmentKind, ComposeVisibility, Visibility } from './social';
import { NS, record, str, iri, isType, safeUrl } from './activitystreams';

export const PUBLIC = NS + 'Public';

/**
 * How long a draft may be, in characters: the note itself and its content warning
 * (`summary`). Ceilings the composer enforces before anything is sent; the tested server
 * accepts both without a limit of its own.
 */
export const NOTE_LIMITS = { content: 5000, summary: 200 } as const;

/**
 * Note content as servers store it: escaped plain text with hard line breaks. Presentation
 * reads the escaping back (entity decoding) when it needs the words as typed.
 */
export const htmlFromPlain = (text: string) =>
  text
    .replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    )
    .replace(/\r?\n/g, '<br>');
const PUBLIC_FORMS = new Set([PUBLIC, 'as:Public', 'Public']);

/** Recipient IRIs from a scalar-or-array `to`/`cc` value; objects contribute their `id`. */
export function recipients(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  return entries.map(iri).filter((v): v is string => !!v);
}
const isPublic = (value: string) => PUBLIC_FORMS.has(value);

/**
 * Infers visibility from addressing. `followers` is the author's followers collection when
 * known. `actors` are IRIs known to be people rather than collections (the reader, the
 * author, mentioned actors): a note addressed to nobody but them is direct even when the
 * author's followers collection is unknown. Anything else without a Public recipient and
 * without a known followers collection stays `unknown`.
 */
export function inferVisibility(
  to: string[],
  cc: string[],
  followers?: string,
  actors: string[] = [],
): Visibility {
  if (to.some(isPublic)) return 'public';
  if (cc.some(isPublic)) return 'unlisted';
  const all = [...to, ...cc];
  if (all.length === 0) return 'unknown';
  if (followers && all.includes(followers)) return 'followers';
  if (followers || all.every((recipient) => actors.includes(recipient))) return 'direct';
  return 'unknown';
}

const ORDER: ComposeVisibility[] = ['direct', 'followers', 'unlisted', 'public'];
const rank = (v: ComposeVisibility) => ORDER.indexOf(v);
/**
 * The widest visibility a reply to a note of `parent` visibility may use. A parent whose
 * audience the server does not reveal could be a direct message, so a reply to it is capped
 * at direct: it reaches the parent's author and the people it mentions, nobody else.
 */
export function replyLimit(parent: Visibility): ComposeVisibility {
  return parent === 'unknown' ? 'direct' : parent;
}
export function isWiderThan(a: ComposeVisibility, b: ComposeVisibility): boolean {
  return rank(a) > rank(b);
}
/** `requested` narrowed so a reply never reaches further than its parent. */
export function clampVisibility(
  requested: ComposeVisibility,
  parent?: Visibility,
): ComposeVisibility {
  if (!parent) return requested;
  const limit = replyLimit(parent);
  return isWiderThan(requested, limit) ? limit : requested;
}

export interface Addressing {
  to: string[];
  cc: string[];
}
/** A draft cannot be addressed as asked; `reason` is what presentation explains. */
export class AddressingError extends Error {
  constructor(readonly reason: 'no-followers') {
    super(
      'This server does not expose a followers collection, so only public or direct notes can be sent.',
    );
    this.name = 'AddressingError';
  }
}
/** The parent a reply is addressed from: its author and the actors it mentions. */
type ReplyParent = { author: string; mentions: string[] };
/**
 * The people a reply to `parent` is addressed to: its author and everyone it mentions,
 * minus the replier. These are actor IRIs, never collections, so a direct reply reaches
 * exactly the conversation.
 */
export function replyParticipants(parent: ReplyParent, self: string): string[] {
  const me = safeUrl(self);
  return [...new Set([parent.author, ...parent.mentions].map((v) => safeUrl(v)))].filter(
    (v) => v !== me,
  );
}
/**
 * `to`/`cc` for a new note. The conversation participants are always addressed;
 * followers-only and unlisted notes need the author's followers collection, which some
 * servers do not expose.
 */
export function buildAddressing(
  visibility: ComposeVisibility,
  actor: { id: string; followers?: string },
  replyTo?: ReplyParent,
): Addressing {
  const followers = actor.followers ? safeUrl(actor.followers) : undefined;
  const other = replyTo ? replyParticipants(replyTo, actor.id) : [];
  if (visibility !== 'public' && visibility !== 'direct' && !followers)
    throw new AddressingError('no-followers');
  const unique = (list: (string | undefined)[]) => [
    ...new Set(list.filter((v): v is string => !!v)),
  ];
  switch (visibility) {
    case 'public':
      return { to: [PUBLIC], cc: unique([followers, ...other]) };
    case 'unlisted':
      return { to: unique([followers, ...other]), cc: [PUBLIC] };
    case 'followers':
      return { to: unique([followers]), cc: other };
    case 'direct':
      return { to: other, cc: [] };
  }
}

/** The note a reaction is about: who wrote it, whom it mentions, and how wide it was sent. */
type ReactionTarget = ReplyParent & { visibility: Visibility };
/**
 * `to`/`cc` for a Like or Announce over `note`. A reaction is addressed exactly as wide as
 * the note it reacts to and never wider, through the same rules that address a reply: a
 * public note keeps Public, an unlisted one keeps Public in `cc` only, a followers-only one
 * reaches followers, and a direct one reaches the conversation. A note whose scope the
 * server does not reveal reaches its author alone rather than a guessed audience, and a
 * scope that needs a followers collection this server does not expose is refused
 * (`AddressingError`) instead of being widened.
 */
export function reactionAddressing(
  note: ReactionTarget,
  actor: { id: string; followers?: string },
): Addressing {
  if (note.visibility === 'unknown') return { to: [safeUrl(note.author)], cc: [] };
  return buildAddressing(note.visibility, actor, note);
}

/**
 * `to`/`cc` for the Delete that withdraws a reaction or a note: no wider than the note it
 * is about, and never a blocker. A scope this server cannot express (`AddressingError`)
 * addresses nobody rather than widening or refusing the withdrawal.
 */
export function withdrawalAddressing(
  note: ReactionTarget,
  actor: { id: string; followers?: string },
): Addressing {
  try {
    return reactionAddressing(note, actor);
  } catch (error) {
    if (error instanceof AddressingError) return { to: [], cc: [] };
    throw error;
  }
}

const TYPE_KINDS: [string, AttachmentKind][] = [
  ['Image', 'image'],
  ['Video', 'video'],
  ['Audio', 'audio'],
  ['Document', 'document'],
];
/** Mastodon sends `Document` with a media type, so the media prefix outranks the generic type. */
function kindOf(entry: ASObject, mediaType?: string): AttachmentKind {
  const prefix = mediaType?.split('/')[0];
  if (prefix === 'image' || prefix === 'video' || prefix === 'audio') return prefix;
  for (const [type, kind] of TYPE_KINDS) if (isType(entry, type)) return kind;
  return 'document';
}
function attachmentUrl(entry: ASObject): string | undefined {
  const raw = Array.isArray(entry.url) ? entry.url[0] : (entry.url ?? entry.href);
  const value = iri(raw);
  if (!value) return undefined;
  try {
    return safeUrl(value);
  } catch {
    return undefined;
  }
}
/** Attachments from a scalar or array `attachment`; entries without a safe http(s) URL are dropped. */
export function normalizeAttachments(value: unknown): Attachment[] {
  const entries = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  const result: Attachment[] = [];
  for (const entry of entries) {
    if (!record(entry)) continue;
    const url = attachmentUrl(entry);
    if (!url) continue;
    const mediaType =
      str(entry.mediaType) ?? (record(entry.url) ? str(entry.url.mediaType) : undefined);
    const alt = (str(entry.name) ?? str(entry.summary))?.trim() || undefined;
    result.push({ kind: kindOf(entry, mediaType), url, mediaType, alt });
  }
  return result;
}
