export type ASObject = Record<string, unknown>;
export interface Actor {
  id: string;
  inbox: string;
  outbox: string;
  name?: string;
  preferredUsername?: string;
  summary?: string;
  icon?: string;
  followers?: string;
}
export type ReactionKind = 'like' | 'share';
/**
 * Who a note is addressed to, inferred from `to`/`cc`. `unknown` means no Public recipient
 * and the author's followers collection is not known, so followers-only and direct cannot
 * be told apart; treat it as at most followers-only.
 */
export type Visibility = 'public' | 'unlisted' | 'followers' | 'direct' | 'unknown';
/** The visibilities a client can choose when writing. */
export type ComposeVisibility = Exclude<Visibility, 'unknown'>;
export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';
/** A normalized `attachment` entry with an http(s) URL; never fetched automatically. */
export interface Attachment {
  kind: AttachmentKind;
  url: string;
  mediaType?: string;
  alt?: string;
}
/** What a client writes; the gateway derives addressing and escaping from it. */
export interface NoteDraft {
  content: string;
  /** Content warning shown before the body; servers keep it as `summary`. */
  summary?: string;
  visibility: ComposeVisibility;
}
/** A Like or Announce by `actor`, identified by the activity IRI a withdrawal deletes. */
export interface NoteReaction {
  kind: ReactionKind;
  actor: string;
  activity: string;
}
export interface TimelineNote {
  id: string;
  author: string;
  content: string;
  /** Content warning; a non-empty summary hides the body until the reader opens it. */
  summary?: string;
  visibility: Visibility;
  attachments: Attachment[];
  published?: string;
  updated?: string;
  inReplyTo?: string;
  url?: string;
  /** Actors whose Announce (share/boost) is currently in effect; sorted. */
  announcedBy: string[];
  /** Actors whose Like is currently in effect; sorted. */
  likedBy: string[];
  /** All effective Like/Announce activities, so a client can withdraw its own by deleting them. */
  reactions: NoteReaction[];
  /** Actor IRIs mentioned via `tag` entries of type Mention; sorted. */
  mentions: string[];
}
export interface Evaluation {
  notes: TimelineNote[];
  /**
   * Object IRIs the evaluator accepted as deleted, sorted: a Delete by the note's own
   * author, a Tombstone standing where an object was, or one read back as an Update. A
   * Delete by anyone else is rejected and never listed here, so it hides nothing.
   */
  deleted: readonly string[];
  diagnostics: {
    ignored: number;
    rejected: number;
  };
}

/**
 * How far the client got through the server's collections. `fetched` counts the distinct
 * activities it actually read; `missing` is what the collections declared (`totalItems`)
 * and the client never received, so a timeline can say plainly that it is not everything.
 * A collection that declares no total makes no claim and adds nothing to `missing`.
 */
export interface CollectionReach {
  readonly fetched: number;
  readonly missing: number;
}

export interface Timeline extends Evaluation {
  actor: Actor;
  activities: ASObject[];
  /**
   * Absent for gateways that read no server (the read-only sample content). A partial read
   * carries the reach of the last full read unchanged: it claims nothing new.
   */
  reach?: CollectionReach;
  /**
   * Read incrementally: only the first page of each collection was asked for and merged over
   * the last full read. A full read leaves this unset.
   */
  partial?: boolean;
}
