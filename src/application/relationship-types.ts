import type { FollowRequest } from '../domain/relationships';
import type { SessionFailure } from './gateway-errors';
import type { CollectionReadOptions, CollectionReadProgress } from './collection-read';

export type RelationshipAction = 'follow' | 'unfollow';
export interface RelationshipEvidence {
  following: readonly string[];
  requests: readonly FollowRequest[];
}
/** All reads are complete or reject; a fulfilled write means confirmed acceptance, not delivery. */
export interface RelationshipGateway {
  load(options?: CollectionReadOptions): Promise<RelationshipEvidence>;
  follow(target: string): Promise<void>;
  /** Read/validate the sending actor only; the returned single-use command performs POST. */
  prepareFollow?(target: string, options?: CollectionReadOptions): Promise<() => Promise<void>>;
  unfollow(request: FollowRequest): Promise<void>;
  /** Complete exact-request validation only; the returned single-use command sends the POST. */
  prepareUnfollow?(
    request: FollowRequest,
    options?: CollectionReadOptions,
  ): Promise<() => Promise<void>>;
}
export interface RelationshipState extends RelationshipEvidence {
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported' | 'canceled';
  readBudget?: CollectionReadProgress;
  readPurpose?: 'refresh' | 'follow' | 'unfollow';
  /** The exact target being validated before a relationship write, independent of the visible UI row. */
  readTarget?: string;
  pending: Readonly<Record<string, RelationshipAction>>;
  confirmed: Readonly<Record<string, RelationshipAction>>;
  uncertain: Readonly<Record<string, RelationshipAction>>;
  errors: Readonly<Record<string, SessionFailure>>;
  /** Proven preparation failures: the send command was never invoked. */
  preparationFailures?: Readonly<Record<string, RelationshipAction>>;
  failure?: SessionFailure;
}
export const emptyRelationships = (): RelationshipState => ({
  phase: 'idle',
  following: [],
  requests: [],
  pending: {},
  confirmed: {},
  uncertain: {},
  errors: {},
});
