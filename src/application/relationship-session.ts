import { normalizeFollowTarget } from '../domain/relationships';
import { CollectionReadCancelled, createCollectionReadController } from './collection-read';
import {
  GatewayHttpError,
  GatewayReadOnly,
  SessionError,
  toFailure,
  type SessionFailure,
} from './gateway-errors';
import {
  emptyRelationships,
  type RelationshipAction,
  type RelationshipEvidence,
  type RelationshipGateway,
  type RelationshipState,
} from './relationship-types';

export interface RelationshipSessionHost {
  /** False once the owning account/session is replaced. */
  current(): boolean;
  update(state: RelationshipState): void;
}

const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = record;
  return rest;
};

/** Account-local graph evidence and write receipts, independent of timeline hydration. */
export function createRelationshipSession(
  gateway: RelationshipGateway | undefined,
  actor: string,
  host: RelationshipSessionHost,
) {
  let state = emptyRelationships();
  if (!gateway) state.phase = 'unsupported';
  let readGeneration = 0;
  let readComplete = false;
  let disposed = false;
  /** Retained through the prepare/send handoff, after the read controller has completed. */
  let preparing: { generation: number } | undefined;
  let writes: Promise<void> = Promise.resolve();
  // A previously rejected Follow cannot establish that a later retry arrived.
  const beforeFollow = new Map<string, ReadonlySet<string>>();
  const live = () => !disposed && host.current();
  const reads = createCollectionReadController((readBudget) => {
    if (live()) patch({ readBudget });
  });

  function check() {
    if (!live()) throw new SessionError({ kind: 'not-connected' });
  }
  function patch(next: Partial<RelationshipState>) {
    check();
    state = { ...state, ...next };
    host.update(state);
  }
  function targetFor(value: string) {
    check();
    if (!gateway) throw new SessionError({ kind: 'relationship-unsupported' });
    const target = normalizeFollowTarget(value, actor);
    if (!target) throw new SessionError({ kind: 'relationship-target' });
    return target;
  }
  function assertAction(target: string, action: RelationshipAction) {
    if (state.phase === 'unsupported') throw new SessionError({ kind: 'relationship-unsupported' });
    if (state.uncertain[target]) throw new SessionError({ kind: 'relationship-uncertain' });
    if (!readComplete || state.phase === 'canceled' || state.confirmed[target])
      throw new SessionError({ kind: 'relationship-state' });
    const requests = state.requests.filter(
      (request) => request.target === target && !request.rejected,
    );
    if (action === 'follow') {
      if (state.following.includes(target) || requests.length > 0)
        throw new SessionError({ kind: 'relationship-state' });
    } else if (requests.length !== 1 || !requests[0].id) {
      // Membership cannot supply an original Follow IRI for an Undo.
      throw new SessionError({ kind: 'relationship-state' });
    }
    return requests[0];
  }
  function reconciled(action: RelationshipAction, target: string, evidence: RelationshipEvidence) {
    if (action === 'unfollow')
      return (
        !evidence.following.includes(target) &&
        !evidence.requests.some((request) => request.target === target && !request.rejected)
      );
    return (
      evidence.following.includes(target) ||
      evidence.requests.some(
        (request) => request.target === target && !beforeFollow.get(target)?.has(request.id),
      )
    );
  }
  function supersedeRead() {
    const generation = ++readGeneration;
    reads.cancel();
    if (live() && generation === readGeneration)
      patch({
        readBudget: undefined,
        readPurpose: undefined,
        readTarget: undefined,
        ...(state.phase === 'loading' ? { phase: readComplete ? 'ready' : 'idle' } : {}),
      });
    return generation;
  }
  async function refresh(): Promise<void> {
    check();
    // Reopening a sheet or refreshing it cannot interrupt an already requested withdrawal.
    if (preparing) return;
    if (!gateway) {
      patch({ phase: 'unsupported', failure: { kind: 'relationship-unsupported' } });
      return;
    }
    const generation = supersedeRead();
    const current = () => live() && generation === readGeneration;
    if (!current()) return;
    patch({ phase: 'loading', failure: undefined, readPurpose: 'refresh', readTarget: undefined });
    try {
      const evidence = await reads.run((options) => gateway.load(options), current);
      if (!current()) return;
      const confirmed = { ...state.confirmed };
      const uncertain = { ...state.uncertain };
      const errors = { ...state.errors };
      for (const record of [confirmed, uncertain]) {
        for (const [target, action] of Object.entries(record)) {
          if (!reconciled(action, target, evidence)) continue;
          delete record[target];
          delete errors[target];
          beforeFollow.delete(target);
        }
      }
      readComplete = true;
      patch({
        ...evidence,
        confirmed,
        uncertain,
        errors,
        phase: 'ready',
        failure: undefined,
        readBudget: undefined,
        readPurpose: undefined,
        readTarget: undefined,
      });
    } catch (error) {
      if (!current()) return;
      if (error instanceof CollectionReadCancelled) {
        patch({
          phase: 'canceled',
          failure: undefined,
          readBudget: undefined,
          readPurpose: undefined,
          readTarget: undefined,
        });
        return;
      }
      const failure = toFailure(error);
      patch({
        phase: failure.kind === 'relationship-unsupported' ? 'unsupported' : 'error',
        failure,
        readBudget: undefined,
        readPurpose: undefined,
        readTarget: undefined,
      });
    }
  }
  function definiteRefusal(error: unknown) {
    return (
      (error instanceof GatewayHttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408) ||
      error instanceof GatewayReadOnly ||
      (error instanceof SessionError &&
        [
          'relationship-target',
          'relationship-state',
          'relationship-unsupported',
          'read-only',
          'not-connected',
          'busy',
        ].includes(error.failure.kind))
    );
  }
  async function write(value: string, action: RelationshipAction): Promise<void> {
    const target = targetFor(value);
    if (state.pending[target]) throw new SessionError({ kind: 'busy' });
    assertAction(target, action);
    patch({
      pending: { ...state.pending, [target]: action },
      errors: without(state.errors, target),
      preparationFailures: without(state.preparationFailures ?? {}, target),
    });
    const run = async () => {
      check();
      try {
        // Evidence may have changed while another target's POST was ahead of this one.
        const original = assertAction(target, action);
        const request = original ? { ...original } : original;
        supersedeRead();
        if (action === 'follow')
          beforeFollow.set(
            target,
            new Set(
              state.requests
                .filter((request) => request.target === target)
                .map((request) => request.id),
            ),
          );
        let prepared: (() => Promise<void>) | undefined;
        const prepare =
          action === 'follow'
            ? gateway!.prepareFollow?.bind(gateway, target)
            : gateway!.prepareUnfollow?.bind(gateway, request);
        if (prepare) {
          const ticket = { generation: ++readGeneration };
          preparing = ticket;
          const current = () =>
            live() && preparing === ticket && ticket.generation === readGeneration;
          try {
            patch({
              readPurpose: action,
              readTarget: target,
              readBudget: undefined,
              phase: 'ready',
            });
            prepared = await reads.run(prepare, current);
            check();
            if (!current()) throw new CollectionReadCancelled();
            // Notification may synchronously cancel the handoff. Keep the ticket until
            // the final check, immediately before the POST is invoked without read options.
            patch({ readPurpose: undefined, readTarget: undefined, readBudget: undefined });
            check();
            if (!current()) throw new CollectionReadCancelled();
          } catch (error) {
            if (action === 'follow') beforeFollow.delete(target);
            if (live() && !(error instanceof CollectionReadCancelled))
              patch({ preparationFailures: { ...state.preparationFailures, [target]: action } });
            throw error;
          } finally {
            if (preparing === ticket) {
              preparing = undefined;
              if (live() && state.readPurpose === action)
                patch({ readPurpose: undefined, readTarget: undefined, readBudget: undefined });
            }
          }
        }
        try {
          check();
          if (prepared) await prepared();
          else if (action === 'follow') await gateway!.follow(target);
          else await gateway!.unfollow(request);
        } catch (error) {
          check();
          supersedeRead();
          let failure: SessionFailure;
          if (definiteRefusal(error)) {
            failure = toFailure(error);
            beforeFollow.delete(target);
          } else {
            failure = { kind: 'relationship-uncertain' };
            patch({ uncertain: { ...state.uncertain, [target]: action } });
          }
          throw new SessionError(failure);
        }
        check();
        supersedeRead();
        patch({
          confirmed: { ...state.confirmed, [target]: action },
          pending: without(state.pending, target),
        });
        // The receipt is already visible and remains confirmed if this read fails.
        if (live()) void refresh();
      } catch (error) {
        if (error instanceof CollectionReadCancelled) throw error;
        const failure = toFailure(error);
        if (live()) patch({ errors: { ...state.errors, [target]: failure } });
        throw error instanceof SessionError ? error : new SessionError(failure);
      } finally {
        if (live() && state.pending[target]) patch({ pending: without(state.pending, target) });
      }
    };
    const next = writes.then(run, run);
    writes = next.catch(() => undefined);
    return next;
  }
  return {
    getSnapshot: () => state,
    refresh,
    continueReading: () => reads.continueReading(),
    cancelReading() {
      if (!live() || (!preparing && !state.readPurpose)) return;
      preparing = undefined;
      const generation = ++readGeneration;
      reads.cancel();
      if (live() && generation === readGeneration)
        patch({
          phase: 'canceled',
          failure: undefined,
          readBudget: undefined,
          readPurpose: undefined,
          readTarget: undefined,
        });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preparing = undefined;
      ++readGeneration;
      reads.cancel();
      beforeFollow.clear();
      state = emptyRelationships();
    },
    follow: (target: string) => write(target, 'follow'),
    unfollow: (target: string) => write(target, 'unfollow'),
  };
}
