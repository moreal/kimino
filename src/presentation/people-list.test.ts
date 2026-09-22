import { describe, expect, it } from 'vitest';
import { emptyRelationships, type RelationshipState } from '../application/relationship-types';
import type { ActorProfile } from './note-display';
import { projectPeople } from './people-list';

const self = 'https://self.example/actor';
const a = 'https://a.example/actor';
const b = 'https://b.example/actor';
const c = 'https://c.example/actor';
const ready = (patch: Partial<RelationshipState> = {}): RelationshipState => ({
  ...emptyRelationships(),
  phase: 'ready',
  ...patch,
});

describe('people list projection', () => {
  it('has no invented entries when there is no relationship evidence', () => {
    expect(projectPeople(undefined, [], self, false, '', 'all')).toEqual({
      targets: [],
      counts: { all: 0, following: 0, requested: 0, attention: 0 },
      total: 0,
    });
  });
  it('uses write-state precedence so pending and uncertain cancellation never appear as following', () => {
    const state = ready({
      phase: 'error',
      following: [a, b, c],
      pending: { [a]: 'unfollow' },
      uncertain: { [b]: 'unfollow' },
    });
    expect(projectPeople(state, [], self, false, '', 'following')).toEqual({
      targets: [c],
      counts: { all: 3, following: 1, requested: 0, attention: 2 },
      total: 3,
    });
    expect(projectPeople(state, [], self, false, '', 'attention').targets).toEqual([a, b]);
  });
  it('keeps confirmed requests and rejected requests separate from graph-proven requested state', () => {
    const state = ready({
      requests: [
        { id: 'f1', target: a, rejected: false },
        { id: 'f2', target: b, rejected: true },
      ],
      confirmed: { [c]: 'follow' },
    });
    expect(projectPeople(state, [], self, false, '', 'requested').targets).toEqual([a]);
    expect(projectPeople(state, [], self, false, '', 'attention').targets).toEqual([b, c]);
  });
  it('matches only loaded profile names/handles and exact actor URL text, case-insensitively', () => {
    const profiles: ActorProfile[] = [
      { id: a, name: 'Alice Doe', handle: '@Alice@a.example', host: 'a.example', loaded: 1 },
      { id: b, name: 'Bobby', handle: '@bee@b.example', host: 'b.example', loaded: 1 },
    ];
    const state = ready({ following: [c, b, a] });
    expect(projectPeople(state, profiles, self, false, ' ALICE DOE ', 'all').targets).toEqual([a]);
    expect(projectPeople(state, profiles, self, false, '@BEE@B.EXAMPLE', 'all').targets).toEqual([
      b,
    ]);
    expect(
      projectPeople(state, profiles, self, false, 'https://C.example/ACTOR', 'all').targets,
    ).toEqual([c]);
    expect(projectPeople(state, profiles, self, false, 'unknown-name', 'all').targets).toEqual([]);
  });
  it('keeps overall counts independent of query, active filter and excluded candidate', () => {
    const state = ready({
      following: [b, a, a],
      requests: [{ id: 'f', target: c, rejected: false }],
    });
    expect(projectPeople(state, [], self, false, 'a.example', 'following', a)).toEqual({
      targets: [],
      counts: { all: 3, following: 2, requested: 1, attention: 0 },
      total: 3,
    });
    expect(projectPeople(state, [], self, false, '', 'all', b).targets).toEqual([a, c]);
    expect(projectPeople(state, [], self, false, '', 'all').targets).toEqual([a, b, c]);
  });
});
