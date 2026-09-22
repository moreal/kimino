import type { CollectionReadOptions } from '../application/collection-read';
import type { FollowRequest } from '../domain/relationships';
import { SessionError } from '../application/gateway-errors';
import type { RelationshipGateway } from '../application/relationship-types';
import type { ASObject, Actor } from '../domain/social';
import { evaluateFollows, normalizeFollowTarget } from '../domain/relationships';
import { iri, isType, safeUrl, sameOrigin } from '../domain/activitystreams';
import { createCollectionReader } from './collection-reader';
import { readMembership } from './membership-reader';
import { protocol, unexpected } from './errors';

export function createRelationshipGateway(deps: {
  actorUrl: string;
  actor(signal?: AbortSignal): Promise<Actor>;
  maxPages: number;
  json(url: string, signal?: AbortSignal): Promise<ASObject>;
  request(url: string, init?: RequestInit): Promise<Response>;
}): RelationshipGateway {
  const trusted = (raw: string) => {
    const url = safeUrl(raw, deps.actorUrl);
    if (!sameOrigin(url, deps.actorUrl) || new URL(url).hash)
      throw unexpected('Relationship resources must remain on the actor origin.');
    return url;
  };
  const json = async (url: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const target = trusted(url);
    // Collection readers validate page aliases; activity resolution still requires exact IDs.
    const value = await deps.json(target, signal);
    signal?.throwIfAborted();
    return value;
  };
  const read = async (options: CollectionReadOptions = {}) => {
    options.signal?.throwIfAborted();
    const actor = await deps.actor(options.signal);
    options.signal?.throwIfAborted();
    let label: 'following' | 'inbox' | 'outbox' = 'following';
    const onReadBudget = options.onReadBudget
      ? (progress: { pages: number; items: number }) =>
          options.onReadBudget!({ ...progress, collection: label })
      : undefined;
    const fetch = (url: string) => json(url, options.signal);
    if (!actor.following) throw new SessionError({ kind: 'relationship-unsupported' });
    const following = await readMembership(trusted(actor.following), {
      actorOrigin: deps.actorUrl,
      fetch,
      signal: options.signal,
      onReadBudget,
      maxPages: deps.maxPages,
    });
    const collection = createCollectionReader({
      fetch,
      signal: options.signal,
      onReadBudget,
      maxPages: deps.maxPages,
      resolveObjects: false,
      trustedOrigin: deps.actorUrl,
    });
    label = 'inbox';
    const inbox = await collection(trusted(actor.inbox));
    label = 'outbox';
    const outbox = await collection(trusted(actor.outbox));
    options.signal?.throwIfAborted();
    const activities = [...inbox.items, ...outbox.items];
    const evaluated = evaluateFollows(activities, actor.id);
    if (evaluated.rejected)
      throw unexpected('Malformed or unauthorized relationship evidence prevents a complete read.');
    return { actor, activities, evidence: { following, requests: evaluated.requests } };
  };
  const prepareWrite = (actor: Actor, activity: ASObject): (() => Promise<void>) => {
    const outbox = trusted(actor.outbox);
    const body = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...activity,
    });
    let used = false;
    return async () => {
      if (used) throw new SessionError({ kind: 'relationship-state' });
      used = true;
      const response = await deps.request(outbox, { method: 'POST', body });
      if (![200, 201, 202].includes(response.status))
        throw protocol(
          'unconfirmed-write',
          'Relationship write was not confirmed; verify state before retrying.',
        );
    };
  };
  const prepareFollow = async (
    raw: string,
    options: CollectionReadOptions = {},
  ): Promise<() => Promise<void>> => {
    options.signal?.throwIfAborted();
    const actor = await deps.actor(options.signal);
    options.signal?.throwIfAborted();
    const target = normalizeFollowTarget(raw, actor.id);
    if (!target) throw new SessionError({ kind: 'relationship-target' });
    return prepareWrite(actor, { type: 'Follow', actor: actor.id, object: target, to: [target] });
  };
  const prepareUnfollow = async (
    request: FollowRequest,
    options?: CollectionReadOptions,
  ): Promise<() => Promise<void>> => {
    const { id, target } = request;
    const { actor, activities, evidence } = await read(options);
    const matches = evidence.requests.filter((item) => item.target === target && !item.rejected);
    if (matches.length !== 1 || matches[0].id !== id)
      throw new SessionError({ kind: 'relationship-state' });
    const original = activities.find(
      (activity) =>
        isType(activity, 'Follow') &&
        iri(activity) === id &&
        iri(activity.actor) === actor.id &&
        iri(activity.object) === target,
    );
    if (!original) throw unexpected('Original own Follow is unavailable.');
    return prepareWrite(actor, { type: 'Undo', actor: actor.id, object: original, to: [target] });
  };
  return {
    prepareFollow,
    prepareUnfollow,
    async load(options?: CollectionReadOptions) {
      return (await read(options)).evidence;
    },
    async follow(raw) {
      const command = await prepareFollow(raw);
      await command();
    },
    async unfollow(request) {
      const command = await prepareUnfollow(request);
      await command();
    },
  };
}
