import { expect, it } from 'vitest';
import { ActivityPubClient } from '../activitypub/client';
import { CollectionReadCancelled } from './collection-read';
import { createRelationshipSession } from './relationship-session';

const actor = 'https://local.example/alice';
const target = 'https://remote.example/bob';

function emptyResponse(url: string) {
  return new Response(
    JSON.stringify(
      url === actor
        ? {
            id: actor,
            inbox: `${actor}/inbox`,
            outbox: `${actor}/outbox`,
            following: `${actor}/following`,
          }
        : { type: 'OrderedCollection', orderedItems: [], totalItems: 0 },
    ),
    { headers: { 'Content-Type': 'application/activity+json' } },
  );
}

it('canceling a pending Follow actor read sends no POST and records no write failure', async () => {
  let pauseActor = false;
  let posts = 0;
  let actorSignal: AbortSignal | null | undefined;
  let releaseActor!: () => void;
  let actorStarted!: () => void;
  const started = new Promise<void>((resolve) => (actorStarted = resolve));
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      if (init?.method === 'POST') {
        posts++;
        return new Response(null, { status: 201 });
      }
      if (String(input) === actor && pauseActor) {
        actorSignal = init?.signal;
        actorStarted();
        // Deliberately ignore abort: a late response must not send the command either.
        await new Promise<void>((resolve) => (releaseActor = resolve));
      }
      return emptyResponse(String(input));
    },
  });
  const session = createRelationshipSession(client.relationships, actor, {
    current: () => true,
    update: () => {},
  });
  await session.refresh();
  pauseActor = true;
  const follow = session.follow(target);
  const canceled = expect(follow).rejects.toBeInstanceOf(CollectionReadCancelled);
  await started;
  session.cancelReading();
  expect(actorSignal?.aborted).toBe(true);
  releaseActor();
  await canceled;
  expect(posts).toBe(0);
  expect(session.getSnapshot()).toMatchObject({
    pending: {},
    uncertain: {},
    errors: {},
    preparationFailures: {},
  });
  session.dispose();
});

it('canceling the completed preparation handoff still prevents the Follow POST', async () => {
  let posts = 0;
  let prepared = false;
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      if (init?.method === 'POST') {
        posts++;
        return new Response(null, { status: 201 });
      }
      return emptyResponse(String(input));
    },
  });
  const session = createRelationshipSession(client.relationships, actor, {
    current: () => true,
    update: (state) => {
      if (state.readPurpose === 'follow') prepared = true;
      else if (prepared) {
        prepared = false;
        session.cancelReading();
      }
    },
  });
  await session.refresh();
  await expect(session.follow(target)).rejects.toBeInstanceOf(CollectionReadCancelled);
  expect(posts).toBe(0);
  expect(session.getSnapshot()).toMatchObject({ pending: {}, uncertain: {}, errors: {} });
  session.dispose();
});

it('an actual Follow POST refusal is not classified as a preparation failure', async () => {
  let posts = 0;
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      if (init?.method === 'POST') {
        posts++;
        return new Response(null, { status: 403 });
      }
      return emptyResponse(String(input));
    },
  });
  const session = createRelationshipSession(client.relationships, actor, {
    current: () => true,
    update: () => {},
  });
  await session.refresh();
  await expect(session.follow(target)).rejects.toMatchObject({
    failure: { kind: 'http', status: 403 },
  });
  expect(posts).toBe(1);
  expect(session.getSnapshot()).toMatchObject({
    pending: {},
    uncertain: {},
    preparationFailures: {},
    errors: { [target]: { kind: 'http', status: 403 } },
  });
  session.dispose();
});

it('a prepared Follow is single-use and does not carry its read signal into POST', async () => {
  const reads = new AbortController();
  const postSignals: (AbortSignal | null | undefined)[] = [];
  let readSignal: AbortSignal | null | undefined;
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      if (init?.method === 'POST') {
        postSignals.push(init.signal);
        return new Response(null, { status: 201 });
      }
      readSignal = init?.signal;
      return emptyResponse(String(input));
    },
  });
  const send = await client.relationships.prepareFollow!(target, { signal: reads.signal });
  expect(readSignal?.aborted).toBe(false);
  reads.abort();
  expect(readSignal?.aborted).toBe(true);
  await send();
  await expect(send()).rejects.toMatchObject({ failure: { kind: 'relationship-state' } });
  expect(postSignals).toHaveLength(1);
  expect(postSignals[0]).not.toBe(readSignal);
  expect(postSignals[0]?.aborted ?? false).toBe(false);
});

it('an actor read failure before Follow is not an uncertain write and permits a manual retry', async () => {
  let failActor = false;
  let posts = 0;
  const outbox: unknown[] = [];
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        posts++;
        outbox.push({ ...JSON.parse(String(init.body)), id: `${actor}/follow/1` });
        return new Response(null, { status: 201 });
      }
      if (url === actor && failActor) return new Response(null, { status: 503 });
      const value =
        url === actor
          ? {
              id: actor,
              inbox: `${actor}/inbox`,
              outbox: `${actor}/outbox`,
              following: `${actor}/following`,
            }
          : {
              type: 'OrderedCollection',
              orderedItems: url === `${actor}/outbox` ? outbox : [],
              totalItems: url === `${actor}/outbox` ? outbox.length : 0,
            };
      return new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/activity+json' },
      });
    },
  });
  const session = createRelationshipSession(client.relationships, actor, {
    current: () => true,
    update: () => {},
  });
  await session.refresh();
  failActor = true;
  await expect(session.follow(target)).rejects.toMatchObject({
    failure: { kind: 'http', status: 503 },
  });
  expect(posts).toBe(0);
  expect(session.getSnapshot().uncertain).toEqual({});
  expect(session.getSnapshot().pending).toEqual({});
  failActor = false;
  await session.follow(target);
  expect(posts).toBe(1);
  expect(session.getSnapshot().uncertain).toEqual({});
  session.dispose();
});
