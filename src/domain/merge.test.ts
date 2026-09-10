import { describe, expect, it } from 'vitest';
import { evaluateActivities, mergeActivities } from './evaluate';
import type { ASObject } from './social';

const alice = 'https://social.test/alice';
const note = (n: number, content = `note ${n}`): ASObject => ({
  id: `https://social.test/notes/${n}`,
  type: 'Note',
  attributedTo: alice,
  content,
  published: `2026-09-0${n}T00:00:00Z`,
  to: ['https://www.w3.org/ns/activitystreams#Public'],
});
const create = (n: number, object: ASObject = note(n)): ASObject => ({
  id: `https://social.test/activities/create-${n}`,
  type: 'Create',
  actor: alice,
  published: `2026-09-0${n}T00:00:00Z`,
  object,
});
const ids = (activities: ASObject[]) => activities.map((a) => a.id).sort();
const shown = (activities: ASObject[]) =>
  evaluateActivities(activities)
    .notes.map((n) => `${n.id.split('/').pop()}:${n.content}`)
    .sort();

describe('mergeActivities: the first pages laid over what the last full read holds', () => {
  it('keeps every held activity and adds the new ones once, by id', () => {
    const held = [create(1), create(2)];
    const merged = mergeActivities(held, [create(3), create(2), create(3)]);
    expect(ids(merged)).toEqual(ids([create(1), create(2), create(3)]));
    expect(shown(merged)).toEqual(['1:note 1', '2:note 2', '3:note 3']);
  });

  it('keeps a note that fell off the first page but is still held', () => {
    // The server's first page no longer reaches note 1; nothing said it was gone.
    const merged = mergeActivities([create(1)], [create(2)]);
    expect(shown(merged)).toEqual(['1:note 1', '2:note 2']);
  });

  it('lets an Update that arrived after the Create rewrite the note', () => {
    const update: ASObject = {
      id: 'https://social.test/activities/update-1',
      type: 'Update',
      actor: alice,
      published: '2026-09-05T00:00:00Z',
      object: { ...note(1, 'edited'), updated: '2026-09-05T00:00:00Z' },
    };
    expect(shown(mergeActivities([create(1)], [update]))).toEqual(['1:edited']);
    // The same result whichever side the Update came from.
    expect(shown(mergeActivities([create(1), update], [update]))).toEqual(['1:edited']);
  });

  it('lets a Delete tombstone bury a held note, and a re-sent Create carrying one too', () => {
    const remove: ASObject = {
      id: 'https://social.test/activities/delete-1',
      type: 'Delete',
      actor: alice,
      published: '2026-09-05T00:00:00Z',
      object: note(1).id,
    };
    expect(shown(mergeActivities([create(1), create(2)], [remove]))).toEqual(['2:note 2']);
    // Some servers rewrite the Create's object as a Tombstone: the fresher copy of an
    // activity the client already held replaces it, so the note cannot come back from it.
    const buried = create(1, { id: note(1).id, type: 'Tombstone', formerType: 'Note' });
    const merged = mergeActivities([create(1), create(2)], [buried]);
    expect(merged.filter((a) => a.id === create(1).id)).toEqual([buried]);
    expect(shown(merged)).toEqual(['2:note 2']);
  });

  it('is pure and treats activities without an id by their content', () => {
    const held = [create(1)];
    const anonymous: ASObject = { type: 'Like', actor: alice, object: note(1).id };
    const merged = mergeActivities(held, [anonymous, { ...anonymous }]);
    expect(held).toEqual([create(1)]);
    expect(merged).toHaveLength(2);
    expect(mergeActivities(merged, [anonymous])).toHaveLength(2);
  });
});
