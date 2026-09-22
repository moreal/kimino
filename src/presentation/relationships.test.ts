import { expect, it } from 'vitest';
import type { RelationshipState } from '../application/relationship-types';
import { inspectFollowTarget, relationshipProjection, relationshipTargets } from './relationships';
const self = 'https://me.example/actor';
const target = 'https://you.example/actor';
const ready = (patch: Partial<RelationshipState> = {}): RelationshipState => ({
  phase: 'ready',
  following: [],
  requests: [],
  pending: {},
  confirmed: {},
  uncertain: {},
  errors: {},
  ...patch,
});
it('allows only fresh complete graph evidence and no other in-flight write', () => {
  expect(relationshipProjection(target, ready(), self).canFollow).toBe(true);
  for (const phase of ['idle', 'loading', 'error', 'unsupported'] as const)
    expect(relationshipProjection(target, ready({ phase }), self).canFollow).toBe(false);
  expect(
    relationshipProjection(target, ready({ pending: { 'https://other.example/': 'follow' } }), self)
      .canFollow,
  ).toBe(false);
  expect(relationshipProjection(target, ready(), self, true).canFollow).toBe(false);
  expect(relationshipProjection(self, ready(), self).canFollow).toBe(false);
});
it('retains confirmed and uncertain writes despite an empty or failed read', () => {
  for (const phase of ['ready', 'error'] as const) {
    for (const kind of ['confirmed', 'uncertain', 'pending'] as const) {
      const projection = relationshipProjection(
        target,
        ready({ phase, [kind]: { [target]: 'follow' } }),
        self,
      );
      expect(projection.canFollow).toBe(false);
      expect(projection.canUnfollow).toBe(false);
      expect(projection.status).toBe(`${kind}-follow`);
    }
  }
});
it('withdraws only one exact non-rejected own request and preserves rejected retry', () => {
  const request = { id: 'https://me.example/follow/1', target, rejected: false };
  expect(relationshipProjection(target, ready({ requests: [request] }), self)).toMatchObject({
    status: 'requested',
    canFollow: false,
    canUnfollow: true,
  });
  expect(relationshipProjection(target, ready({ following: [target] }), self)).toMatchObject({
    status: 'following',
    canFollow: false,
    canUnfollow: false,
  });
  expect(
    relationshipProjection(
      target,
      ready({ requests: [request, { ...request, id: 'https://me.example/follow/2' }] }),
      self,
    ).canUnfollow,
  ).toBe(false);
  expect(
    relationshipProjection(target, ready({ requests: [{ ...request, rejected: true }] }), self),
  ).toMatchObject({ status: 'rejected', canFollow: true, canUnfollow: false });
});
it('keeps targets from all evidence and receipts in a stable unique list', () => {
  expect(
    relationshipTargets(
      ready({
        following: [target],
        requests: [{ id: 'f', target: 'https://a.example/', rejected: true }],
        confirmed: { [target]: 'follow' },
        uncertain: { 'https://b.example/': 'unfollow' },
        pending: { 'https://c.example/': 'follow' },
      }),
    ),
  ).toEqual(['https://a.example/', 'https://b.example/', 'https://c.example/', target]);
});
it('inspects exact safe URLs without handle discovery or self-follow', () => {
  expect(inspectFollowTarget(` ${target} `, self)).toBe(target);
  expect(inspectFollowTarget('@you@example.com', self)).toBeUndefined();
  expect(inspectFollowTarget('javascript:alert(1)', self)).toBeUndefined();
  expect(inspectFollowTarget(self, self)).toBeUndefined();
});

it('distinguishes an unsent withdrawal preparation from POST transmission', () => {
  const preparing = relationshipProjection(
    target,
    ready({ pending: { [target]: 'unfollow' }, readPurpose: 'unfollow' }),
    self,
  );
  expect(preparing.status).toBe('preparing-unfollow');
  expect(preparing.label).not.toContain('전송');
  expect(preparing.help).toContain('아직 보내지 않았어요');
  expect(preparing.canUnfollow).toBe(false);
  const sending = relationshipProjection(
    target,
    ready({ pending: { [target]: 'unfollow' } }),
    self,
  );
  expect(sending.status).toBe('pending-unfollow');
  expect(sending.help).not.toContain('아직 보내지 않았어요');
});

it('canceled reads preserve receipts but cannot establish fresh graph actions', () => {
  const canceled = relationshipProjection(target, ready({ phase: 'canceled' }), self);
  expect(canceled.canFollow).toBe(false);
  expect(canceled.help).toContain('읽기를 중단했어요');
  const accepted = relationshipProjection(
    target,
    ready({ phase: 'canceled', confirmed: { [target]: 'unfollow' } }),
    self,
  );
  expect(accepted.status).toBe('confirmed-unfollow');
  expect(accepted.canFollow).toBe(false);
});
