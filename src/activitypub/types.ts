export type {
  ASObject,
  Actor,
  TimelineNote,
  Evaluation,
  ReactionKind,
  NoteReaction,
} from '../domain/social';

export interface ClientOptions {
  signal?: AbortSignal;
  actorUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
  maxPages?: number;
}
