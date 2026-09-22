import type { RelationshipState } from '../application/relationship-types';
import { normalizeFollowTarget } from '../domain/relationships';
import { failureText } from './copy-failures';
import { relationshipCopy as copy } from './copy-relationships';

export function inspectFollowTarget(value: string, self?: string): string | undefined {
  return self ? normalizeFollowTarget(value, self) : undefined;
}

export function relationshipTargets(state?: RelationshipState): string[] {
  if (!state) return [];
  return [
    ...new Set([
      ...state.following,
      ...state.requests.map((request) => request.target),
      ...Object.keys(state.pending),
      ...Object.keys(state.confirmed),
      ...Object.keys(state.uncertain),
    ]),
  ].sort();
}

export type RelationshipStatus = keyof typeof copy.labels;
export interface RelationshipProjection {
  status: RelationshipStatus;
  label: string;
  help: string;
  error: string;
  canFollow: boolean;
  canUnfollow: boolean;
}

/** Complete graph reads establish absence; receipts always outrank older graph evidence. */
export function relationshipProjection(
  target: string,
  state?: RelationshipState,
  self?: string,
  demo = false,
): RelationshipProjection {
  const active =
    state?.requests.filter((request) => request.target === target && !request.rejected) ?? [];
  const following = state?.following.includes(target) ?? false;
  const rejected =
    state?.requests.some((request) => request.target === target && request.rejected) ?? false;
  let status: RelationshipStatus = following
    ? 'following'
    : active.length
      ? 'requested'
      : rejected
        ? 'rejected'
        : state?.phase === 'ready'
          ? 'not-following'
          : 'unknown';
  let help =
    status === 'requested' ? copy.requestedHelp : status === 'rejected' ? copy.rejectedHelp : '';
  const uncertain = state?.uncertain[target],
    pending = state?.pending[target],
    confirmed = state?.confirmed[target];
  if (uncertain) {
    status = `uncertain-${uncertain}`;
    help = copy.uncertainHelp;
  }
  if (confirmed) {
    status = `confirmed-${confirmed}`;
    help = copy.refreshReceipt;
  }
  if (pending) {
    const preparing = pending === state?.readPurpose;
    status = preparing ? `preparing-${pending}` : `pending-${pending}`;
    help = preparing
      ? pending === 'follow'
        ? copy.readFollowHelp
        : copy.readUnfollowHelp
      : copy.busy;
  }
  const fresh = state?.phase === 'ready';
  const valid = !!inspectFollowTarget(target, self);
  const locked =
    !!uncertain || !!confirmed || !!pending || Object.keys(state?.pending ?? {}).length > 0;
  const canAct = fresh && valid && !demo && !locked;
  if (!locked && (following || active.length)) {
    if (active.length === 0) help = copy.missingReceipt;
    if (active.length > 1) help = copy.ambiguousReceipt;
  }
  if (!fresh && !uncertain && !confirmed && !pending)
    help =
      state?.phase === 'loading'
        ? copy.loading
        : state?.phase === 'canceled'
          ? copy.readCanceled
          : state?.phase === 'error'
            ? copy.readFailed
            : state?.phase === 'unsupported'
              ? copy.unsupported
              : copy.notLoaded;
  if (!valid) help = target === self ? copy.self : copy.invalid;
  if (demo) help = copy.demo;
  const error = failureText(state?.errors[target]);
  const notSent = state?.preparationFailures?.[target];
  return {
    status,
    label: copy.labels[status],
    help,
    error: error && notSent ? copy.preparationFailed(notSent, error) : error,
    canFollow: canAct && !following && active.length === 0,
    canUnfollow: canAct && active.length === 1,
  };
}

export function relationshipReadError(state?: RelationshipState): string {
  return failureText(state?.failure);
}
