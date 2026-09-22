import { expect, it } from 'vitest';
import { evaluateFollows, normalizeFollowTarget } from './relationships';
const self = 'https://own.test/alice',
  target = 'https://remote.test/bob',
  id = 'https://own.test/f/1';
const follow = { type: 'Follow', id, actor: self, object: target };
it('normalizes actor URLs while refusing unsafe addresses and self', () => {
  expect(normalizeFollowTarget(' https://REMOTE.test/bob ', self)).toBe(target);
  for (const url of [
    self,
    'javascript:foo',
    'http://remote.test/bob',
    'https://user:pass@remote.test/bob',
    'https://remote.test/bob#fragment',
  ])
    expect(normalizeFollowTarget(url, self)).toBeUndefined();
});
it('retains exact own Follow IDs and matched target rejection', () => {
  expect(evaluateFollows([follow], self)).toEqual({
    requests: [{ id, target, rejected: false }],
    rejected: 0,
  });
  expect(
    evaluateFollows([{ type: 'Reject', actor: target, object: follow }, follow], self),
  ).toEqual({ requests: [{ id, target, rejected: true }], rejected: 0 });
});
it('only exact authorized withdrawal or trusted tombstones removes requests', () => {
  for (const removal of [
    { type: 'Undo', actor: self, object: follow },
    { type: 'Delete', actor: self, object: id },
    { type: 'Tombstone', id },
  ])
    expect(evaluateFollows([removal, follow], self)).toEqual({ requests: [], rejected: 0 });
  for (const type of ['Undo', 'Delete', 'Reject']) {
    const result = evaluateFollows(
      [follow, { type, actor: 'https://evil.test/eve', object: id }],
      self,
    );
    expect(result.requests).toEqual([{ id, target, rejected: false }]);
    expect(result.rejected).toBe(1);
  }
});
it('rejects malformed and conflicting own Follow evidence instead of proving absence', () => {
  for (const bad of [
    { ...follow, id: undefined },
    { ...follow, id: 'https://evil.test/f/1' },
    { ...follow, object: 'javascript:bad' },
    { ...follow, object: self },
  ])
    expect(evaluateFollows([bad], self).rejected).toBeGreaterThan(0);
  expect(
    evaluateFollows([follow, { ...follow, object: 'https://remote.test/other' }], self).rejected,
  ).toBeGreaterThan(0);
  expect(
    evaluateFollows([follow, follow, { type: 'Like', actor: self, object: target }], self).requests,
  ).toHaveLength(1);
});
it('does not trust a forged embedded original Follow in Undo', () => {
  const result = evaluateFollows(
    [
      follow,
      { type: 'Undo', actor: self, object: { ...follow, object: 'https://remote.test/other' } },
    ],
    self,
  );
  expect(result.requests).toHaveLength(1);
  expect(result.rejected).toBe(1);
});
it('ignores another local actor’s valid incoming Follow', () => {
  expect(
    evaluateFollows(
      [
        {
          type: 'Follow',
          id: 'https://own.test/f/other',
          actor: 'https://own.test/other',
          object: self,
        },
        follow,
      ],
      self,
    ),
  ).toEqual({ requests: [{ id, target, rejected: false }], rejected: 0 });
});
it('rejects a conflicting actor claiming the same Follow ID', () => {
  expect(
    evaluateFollows([follow, { ...follow, actor: 'https://own.test/other' }], self).rejected,
  ).toBeGreaterThan(0);
});
it('accepts a valid own Undo after the original was removed from the outbox', () => {
  expect(evaluateFollows([{ type: 'Undo', actor: self, object: follow }], self)).toEqual({
    requests: [],
    rejected: 0,
  });
});
it('rejects a forged embedded non-Follow object targeting a known request', () => {
  expect(
    evaluateFollows([follow, { type: 'Undo', actor: self, object: { id, type: 'Like' } }], self)
      .rejected,
  ).toBe(1);
});
it.each(['Undo', 'Reject'])(
  'rejects conflicting embedded identity fields even without type in %s',
  (type) => {
    for (const object of [
      { id, actor: 'https://own.test/other' },
      { id, object: 'https://remote.test/other' },
      { id, actor: null },
      { id, object: null },
    ]) {
      const result = evaluateFollows(
        [follow, { type, actor: type === 'Reject' ? target : self, object }],
        self,
      );
      expect(result.requests).toEqual([{ id, target, rejected: false }]);
      expect(result.rejected).toBe(1);
    }
    expect(
      evaluateFollows(
        [follow, { type, actor: type === 'Reject' ? target : self, object: { id } }],
        self,
      ).rejected,
    ).toBe(0);
  },
);
