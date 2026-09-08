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
/** A Like or Announce by `actor`, identified by the activity IRI needed for Undo. */
export interface NoteReaction {
  kind: ReactionKind;
  actor: string;
  activity: string;
}
export interface TimelineNote {
  id: string;
  author: string;
  content: string;
  published?: string;
  updated?: string;
  inReplyTo?: string;
  url?: string;
  /** Actors whose Announce (share/boost) is currently in effect; sorted. */
  announcedBy: string[];
  /** Actors whose Like is currently in effect; sorted. */
  likedBy: string[];
  /** All effective Like/Announce activities, so a client can Undo its own. */
  reactions: NoteReaction[];
  /** Actor IRIs mentioned via `tag` entries of type Mention; sorted. */
  mentions: string[];
}
export interface Evaluation {
  notes: TimelineNote[];
  diagnostics: {
    ignored: number;
    rejected: number;
  };
}

export interface Timeline extends Evaluation {
  actor: Actor;
  activities: ASObject[];
}
