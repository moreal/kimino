/** A surviving own Follow activity, with matched incoming rejection evidence if any. */
export interface FollowRequest {
  id: string;
  target: string;
  rejected: boolean;
}

import type { ASObject } from './social';
import { iri, isType, record, safeUrl, sameOrigin } from './activitystreams';

const absolute = (value: unknown): string | undefined => {
  try {
    const raw = iri(value);
    if (!raw) return undefined;
    const url = safeUrl(raw.trim());
    if (new URL(url).hash) return undefined;
    return url;
  } catch {
    return undefined;
  }
};
export function normalizeFollowTarget(value: string, self: string): string | undefined {
  const url = absolute(value);
  return url && url !== absolute(self) ? url : undefined;
}
/** Server-delivered evidence only; this evaluator does not verify signatures. */
export function evaluateFollows(
  activities: readonly ASObject[],
  self: string,
): { requests: FollowRequest[]; rejected: number } {
  const own = absolute(self);
  const requests = new Map<string, FollowRequest>();
  let rejected = 0;
  if (!own) return { requests: [], rejected: 1 };
  for (const activity of activities) {
    if (!isType(activity, 'Follow')) continue;
    const actor = absolute(activity.actor),
      id = absolute(activity.id);
    if (actor !== own) {
      // Another actor cannot mint an activity on this actor's origin as our Follow.
      if (!actor) rejected++;
      continue;
    }
    const target = absolute(activity.object);
    if (!id || !sameOrigin(id, own) || !target || target === own) {
      rejected++;
      continue;
    }
    const previous = requests.get(id);
    if (previous && previous.target !== target) {
      rejected++;
      continue;
    }
    requests.set(id, { id, target, rejected: false });
  }
  for (const activity of activities) {
    const id = absolute(activity.id);
    if (isType(activity, 'Follow') && id && requests.has(id) && absolute(activity.actor) !== own)
      rejected++;
  }
  const removed = new Set<string>();
  for (const activity of activities) {
    if (isType(activity, 'Tombstone')) {
      const id = absolute(activity.id);
      if (id && sameOrigin(id, own)) removed.add(id);
      continue;
    }
    const type = ['Undo', 'Delete', 'Reject'].find((type) => isType(activity, type));
    if (!type) continue;
    const id = absolute(activity.object),
      actor = absolute(activity.actor);
    const original = id ? requests.get(id) : undefined;
    if (!original) {
      if (
        actor === own &&
        (!id ||
          (record(activity.object) &&
            isType(activity.object, 'Follow') &&
            (absolute(activity.object.actor) !== own || !absolute(activity.object.object))))
      )
        rejected++;
      continue;
    }
    if (
      record(activity.object) &&
      activity.object.type !== undefined &&
      !isType(activity.object, 'Follow')
    ) {
      rejected++;
      continue;
    }
    if (
      record(activity.object) &&
      ((('actor' in activity.object || isType(activity.object, 'Follow')) &&
        absolute(activity.object.actor) !== own) ||
        (('object' in activity.object || isType(activity.object, 'Follow')) &&
          absolute(activity.object.object) !== original.target))
    ) {
      rejected++;
      continue;
    }
    if (type === 'Reject') {
      if (actor !== original.target) {
        rejected++;
        continue;
      }
      original.rejected = true;
    } else {
      if (actor !== own) {
        rejected++;
        continue;
      }
      removed.add(original.id);
    }
  }
  return {
    requests: [...requests.values()]
      .filter((request) => !removed.has(request.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    rejected,
  };
}
