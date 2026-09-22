import { expect, it, vi } from 'vitest';
import {
  createSession,
  credentials,
  deferred,
  gateway,
  timeline,
} from './session-doubles.test-support';
import type { RelationshipEvidence, RelationshipGateway } from './relationship-types';

const target = 'https://remote.example/bob';
const empty = (): RelationshipEvidence => ({ following: [], requests: [] });
const port = (): RelationshipGateway => ({
  load: vi.fn().mockResolvedValue(empty()),
  follow: vi.fn().mockResolvedValue(undefined),
  unfollow: vi.fn().mockResolvedValue(undefined),
});

it('loads relationships only on demand and scopes graph failure away from a readable feed', async () => {
  const graph = port();
  const active = { ...gateway(), relationships: graph };
  const session = createSession(() => active);
  await session.connect(credentials);
  expect(graph.load).not.toHaveBeenCalled();
  vi.mocked(graph.load).mockRejectedValueOnce(new Error('graph unavailable'));
  await session.loadRelationships();
  expect(session.getSnapshot().relationships?.phase).toBe('error');
  expect(session.getSnapshot().timeline?.actor.id).toBe(credentials.actorUrl);
  expect(session.getSnapshot().error).toBeUndefined();
});

it('does not let an old-account graph read change a new connection', async () => {
  const old = deferred<RelationshipEvidence>();
  const first = port();
  vi.mocked(first.load).mockReturnValueOnce(old.promise);
  const second = port();
  let active = { ...gateway(), relationships: first };
  const session = createSession(() => active);
  await session.connect(credentials);
  const loading = session.loadRelationships();
  session.disconnect();
  active = { ...gateway(), relationships: second };
  await session.connect(credentials);
  await session.loadRelationships();
  old.resolve({ following: [target], requests: [] });
  await loading;
  expect(session.getSnapshot().relationships?.following).toEqual([]);
  expect(session.getSnapshot().relationships?.phase).toBe('ready');
});

it('uses the relationship port without refreshing or writing the timeline', async () => {
  const graph = port();
  const active = { ...gateway(), relationships: graph };
  const session = createSession(() => active);
  await session.connect(credentials);
  await session.loadRelationships();
  await session.follow(target);
  expect(graph.follow).toHaveBeenCalledWith(target);
  expect(active.publishNote).not.toHaveBeenCalled();
  expect(active.loadRecent).not.toHaveBeenCalled();
  expect(session.getSnapshot().error).toBeUndefined();
});

it('does not reuse graph evidence if a refreshed actor identity changes', async () => {
  const graph = port();
  const active = { ...gateway(), relationships: graph };
  const session = createSession(() => active);
  await session.connect(credentials);
  await session.loadRelationships();
  vi.mocked(active.loadTimeline).mockResolvedValue(timeline('https://example.test/other'));
  await session.refresh();
  expect(session.getSnapshot().relationships).toBeUndefined();
  await expect(session.follow(target)).rejects.toMatchObject({
    failure: { kind: 'relationship-state' },
  });
  expect(graph.follow).not.toHaveBeenCalled();
});

it('refuses disconnected operations and treats a missing capability as unsupported', async () => {
  const session = createSession(() => gateway());
  await expect(session.loadRelationships()).rejects.toMatchObject({
    failure: { kind: 'not-connected' },
  });
  await session.connect(credentials);
  await session.loadRelationships();
  expect(session.getSnapshot().relationships?.phase).toBe('unsupported');
});
