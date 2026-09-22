export type {
  ASObject,
  Actor,
  TimelineNote,
  Evaluation,
  ReactionKind,
  NoteReaction,
} from '../domain/social';

export interface ClientOptions {
  /** Explicit opt-in to the verified ONI Create/Image convention. */
  mediaMode?: 'oni';
  signal?: AbortSignal;
  actorUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
  maxPages?: number;
}
