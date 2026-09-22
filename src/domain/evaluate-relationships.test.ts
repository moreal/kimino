import { expect, it } from 'vitest';
import { evaluateActivities } from './evaluate';
const actor = 'https://own.test/alice',
  target = 'https://remote.test/bob',
  fid = 'https://own.test/follow/1';
const follow = { type: 'Follow', id: fid, actor, object: target };
const undo = { type: 'Undo', id: 'https://own.test/undo/1', actor, object: follow };
it('counts eight Follow activities as ignored without inventing notes', () => {
  const result = evaluateActivities(
    Array.from({ length: 8 }, (_, i) => ({ ...follow, id: fid + i })),
  );
  expect(result.notes).toEqual([]);
  expect(result.diagnostics).toEqual({ ignored: 8, rejected: 0 });
});
it('retains ignored counts for Follow alongside unknown activity types', () => {
  expect(
    evaluateActivities([follow, { type: 'Question', id: 'https://own.test/question/1' }])
      .diagnostics,
  ).toEqual({ ignored: 2, rejected: 0 });
});
it('ignores a valid embedded Undo/Follow even without a loaded original', () => {
  expect(evaluateActivities([undo]).diagnostics).toEqual({ ignored: 1, rejected: 0 });
});
it('ignores an IRI Undo only when its exact valid Follow is loaded', () => {
  expect(evaluateActivities([follow, { ...undo, object: fid }]).diagnostics).toEqual({
    ignored: 2,
    rejected: 0,
  });
  expect(evaluateActivities([{ ...undo, object: fid }]).diagnostics).toEqual({
    ignored: 0,
    rejected: 1,
  });
});
it.each([
  { ...undo, actor: target },
  { ...undo, id: 'https://evil.test/undo/1' },
  { ...undo, object: { ...follow, id: 'https://evil.test/follow/1' } },
  { ...undo, object: { ...follow, object: actor } },
  { ...undo, object: { ...follow, object: 'javascript:bad' } },
  { ...undo, object: { ...follow, actor: undefined } },
  { ...undo, object: { ...follow, type: ['Follow', 'Like'] } },
])('rejects forged or malformed embedded relationship withdrawal %j', (activity) => {
  expect(evaluateActivities([activity]).diagnostics.rejected).toBe(1);
});
it.each([
  { id: fid, actor: 'https://own.test/other' },
  { id: fid, object: 'https://remote.test/other' },
  { ...follow, object: 'https://remote.test/other' },
  { id: fid, type: 'Like' },
])('rejects embedded contradictions against the loaded Follow %j', (object) => {
  expect(evaluateActivities([follow, { ...undo, object }]).diagnostics).toEqual({
    ignored: 1,
    rejected: 1,
  });
});
it('never removes a reaction whose ID is reused by an embedded Follow', () => {
  const note = { type: 'Note', id: 'https://own.test/n/1', attributedTo: actor, content: 'hello' };
  const like = { type: 'Like', id: fid, actor, object: note.id };
  const result = evaluateActivities([note, like, undo]);
  expect(result.notes[0].likedBy).toEqual([actor]);
  expect(result.diagnostics).toEqual({ ignored: 0, rejected: 1 });
});
it('does not hide a conflict between loaded Follow and reaction evidence at the same ID', () => {
  const note = { type: 'Note', id: 'https://own.test/n/1', attributedTo: actor, content: 'hello' };
  const like = { type: 'Like', id: fid, actor, object: note.id };
  expect(evaluateActivities([note, follow, like, undo]).diagnostics.rejected).toBeGreaterThan(0);
});
