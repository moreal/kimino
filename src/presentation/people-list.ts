import type { RelationshipState } from '../application/relationship-types';
import type { ActorProfile } from './note-display';
import { relationshipProjection, relationshipTargets } from './relationships';

export type PeopleFilter = 'all' | 'following' | 'requested' | 'attention';

/** Filter only known relationships, retaining receipt precedence and overall counts. */
export function projectPeople(
  state: RelationshipState | undefined,
  profiles: readonly ActorProfile[],
  self: string | undefined,
  demo: boolean,
  query: string,
  filter: PeopleFilter,
  excluded?: string,
): { targets: string[]; counts: Record<PeopleFilter, number>; total: number } {
  const known = relationshipTargets(state);
  const counts: Record<PeopleFilter, number> = {
    all: known.length,
    following: 0,
    requested: 0,
    attention: 0,
  };
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const needle = query.trim().toLowerCase();
  const targets: string[] = [];
  for (const target of known) {
    const { status } = relationshipProjection(target, state, self, demo);
    const group = status === 'following' || status === 'requested' ? status : 'attention';
    counts[group] += 1;
    if (target === excluded || (filter !== 'all' && filter !== group)) continue;
    const profile = profilesById.get(target);
    if (
      needle &&
      ![target, profile?.name, profile?.handle].some((value) =>
        value?.toLowerCase().includes(needle),
      )
    )
      continue;
    targets.push(target);
  }
  return { targets, counts, total: known.length };
}
