import { describe, expect, it } from 'vitest';
import { evaluateActivities, ActivityPubClient } from './index';
const alice = 'https://social.test/alice',
  bob = 'https://else.test/bob',
  id = 'https://social.test/notes/1';
const note = {
  type: 'Note',
  id,
  attributedTo: alice,
  content: 'hello',
  published: '2025-01-01T00:00:00Z',
};
const create = {
  type: 'Create',
  id: 'https://social.test/c1',
  actor: alice,
  object: note,
  published: note.published,
};
describe('activity evaluation', () => {
  it('deduplicates, applies owner updates and replies deterministically', () => {
    const update = {
      type: 'https://www.w3.org/ns/activitystreams#Update',
      actor: alice,
      object: { ...note, content: 'edited', inReplyTo: 'https://else.test/n' },
      published: '2025-01-02T00:00:00Z',
    };
    const first = evaluateActivities([update, create, create]);
    expect(first.notes).toHaveLength(1);
    expect(first.notes[0].content).toBe('edited');
    expect(first.notes[0].inReplyTo).toBe('https://else.test/n');
    expect(first).toEqual(evaluateActivities([create, update, create]));
  });
  it('rejects spoofed ownership and mutations', () => {
    const spoof = {
      ...create,
      id: 'https://else.test/c',
      actor: bob,
      object: { ...note, attributedTo: bob },
      published: '2024-01-01T00:00:00Z',
    };
    const update = { type: 'Update', actor: bob, object: { ...note, content: 'stolen' } };
    expect(evaluateActivities([spoof, create, update]).notes[0].content).toBe('hello');
    expect(
      evaluateActivities([create, { type: 'Delete', actor: bob, object: id }]).notes,
    ).toHaveLength(1);
  });
  it('retains owner tombstones regardless of input order or later creates', () => {
    const del = { type: 'Delete', actor: alice, object: id, published: '2025-01-03T00:00:00Z' };
    expect(
      evaluateActivities([
        del,
        create,
        { ...create, id: 'https://social.test/c2', published: '2025-01-04T00:00:00Z' },
      ]).notes,
    ).toEqual([]);
  });
  it('tracks announcements, only accepts announcer Undo and counts unknown types', () => {
    const ann = { type: 'Announce', id: 'https://else.test/a', actor: bob, object: note };
    expect(
      evaluateActivities([create, ann, { type: 'Undo', actor: alice, object: ann.id }]).notes[0]
        .announcedBy,
    ).toEqual([bob]);
    const result = evaluateActivities([
      create,
      ann,
      { type: 'Undo', actor: bob, object: ann.id },
      { type: 'Follow', actor: bob, object: alice },
    ]);
    expect(result.notes[0].announcedBy).toEqual([]);
    expect(result.diagnostics.ignored).toBe(1);
  });
});
function server(routes: Record<string, unknown>) {
  const calls: {
    url: string;
    init?: RequestInit;
  }[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (!(url in routes)) return new Response('', { status: 404 });
    const val = routes[url];
    return val instanceof Response
      ? val
      : new Response(JSON.stringify(val), {
          headers: { 'Content-Type': 'application/activity+json' },
        });
  };
  return { calls, fetcher };
}
const actor = {
  id: alice,
  type: 'Person',
  inbox: 'https://social.test/inbox',
  outbox: 'https://social.test/outbox',
  followers: 'https://social.test/followers',
};
describe('browser client', () => {
  it('walks both collections, resolves IRIs, keeps bearer on origin and disables redirects', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', first: 'https://else.test/page' },
      'https://else.test/page': {
        type: 'OrderedCollectionPage',
        orderedItems: ['https://social.test/c1'],
      },
      'https://social.test/c1': create,
      [actor.outbox]: { type: 'OrderedCollection', orderedItems: [] },
    });
    const result = await new ActivityPubClient({
      actorUrl: alice,
      token: 'secret',
      fetch: s.fetcher,
    }).loadTimeline();
    expect(result.notes).toHaveLength(1);
    expect(
      s.calls.find((c) => c.url === 'https://else.test/page')!.init!.headers,
    ).not.toHaveProperty('Authorization');
    expect(s.calls.find((c) => c.url === alice)!.init!.headers).toHaveProperty(
      'Authorization',
      'Bearer secret',
    );
    expect(s.calls.every((c) => c.init?.redirect === 'error')).toBe(true);
  });
  it('reports pagination cycles and explicit page limits', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', first: 'https://social.test/page' },
      'https://social.test/page': { orderedItems: [], next: 'https://social.test/page' },
      [actor.outbox]: { orderedItems: [] },
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow(/cycle/i);
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher, maxPages: 1 }).loadTimeline(),
    ).rejects.toThrow(/limit|truncat/i);
  });
  it('publishes escaped public replies and hydrates the Location', async () => {
    const s = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, { status: 201, headers: { Location: '/posted' } }),
      'https://social.test/posted': create,
    });
    const result = await new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote(
      '<hello>',
      { ...note, author: bob, announcedBy: [], likedBy: [], reactions: [], mentions: [] },
    );
    const body = JSON.parse(s.calls.find((c) => c.init?.method === 'POST')!.init!.body as string);
    expect(body.object.content).toBe('&lt;hello&gt;');
    expect(body.object.inReplyTo).toBe(id);
    expect(body.object.cc).toContain(bob);
    expect(body.to).toContain('https://www.w3.org/ns/activitystreams#Public');
    expect(result.location).toBe('https://social.test/posted');
    expect(result.activity).toEqual(create);
  });
  it('rejects unsafe URLs before fetching', () => {
    expect(() => new ActivityPubClient({ actorUrl: 'http://example.com/a' })).toThrow(/HTTPS/);
    expect(() => new ActivityPubClient({ actorUrl: 'https://u:p@example.com/a' })).toThrow();
  });
});
describe('snapshot edge cases', () => {
  it('orders updates by object timestamps when activity timestamps are absent', () => {
    const newer = {
      type: 'Update',
      actor: alice,
      object: { ...note, content: 'aaa newest', updated: '2025-01-03T00:00:00Z' },
    };
    const older = {
      type: 'Update',
      actor: alice,
      object: { ...note, content: 'zzz old', updated: '2025-01-02T00:00:00Z' },
    };
    expect(evaluateActivities([create, newer, older]).notes[0].content).toBe('aaa newest');
  });
  it('does not allow an authorized update to transfer authorship', () => {
    expect(
      evaluateActivities([
        create,
        {
          type: 'Update',
          actor: alice,
          object: { ...note, attributedTo: bob, content: 'transferred' },
        },
      ]).notes[0].author,
    ).toBe(alice);
  });
  it('sorts notes newest first with an ID tie break and recognizes type arrays', () => {
    const later = {
      ...note,
      id: 'https://social.test/n2',
      type: ['https://www.w3.org/ns/activitystreams#Note'],
      published: '2025-02-01T00:00:00Z',
    };
    expect(
      evaluateActivities([create, { type: ['Create'], actor: alice, object: later }]).notes.map(
        (n) => n.id,
      ),
    ).toEqual([later.id, id]);
  });
  it('removes announcement-only notes after Undo', () => {
    const a = { id: 'https://else.test/ann', type: 'Announce', actor: bob, object: note };
    expect(evaluateActivities([a, { type: 'Undo', actor: bob, object: a }]).notes).toEqual([]);
  });
});
describe('client boundaries', () => {
  it('rejects non-collection endpoint data rather than presenting an empty timeline', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { error: 'wrong endpoint' },
      [actor.outbox]: { orderedItems: [] },
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow(/collection/i);
  });
  it('retains accepted status when the new object is not readable yet', async () => {
    const s = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, {
        status: 201,
        headers: { Location: '/not-visible-yet' },
      }),
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote('hello'),
    ).resolves.toEqual({ location: 'https://social.test/not-visible-yet', activity: null });
  });
  it('reports a missing exposed Location as possibly accepted', async () => {
    const s = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 201 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote('hello'),
    ).rejects.toThrow(/may have been accepted/);
  });
  it('detects object reference cycles', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { orderedItems: ['https://social.test/c'] },
      [actor.outbox]: { orderedItems: [] },
      'https://social.test/c': {
        id: 'https://social.test/c',
        type: 'Create',
        actor: alice,
        object: 'https://social.test/c',
      },
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow(/cycle/);
  });
  it('rejects an object response that claims a different ID', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { orderedItems: ['https://else.test/evil'] },
      [actor.outbox]: { orderedItems: [] },
      'https://else.test/evil': create,
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow(/ID/);
  });
});

describe('review regressions', () => {
  it('does not roll a newer hydrated snapshot back to a historical Update', () => {
    const hydrated = {
      ...create,
      object: { ...note, content: 'new snapshot', updated: '2025-01-03T00:00:00Z' },
    };
    const historical = {
      type: 'Update',
      actor: alice,
      published: '2025-01-02T00:00:00Z',
      object: { ...note, content: 'old update', updated: '2025-01-02T00:00:00Z' },
    };
    expect(evaluateActivities([historical, hydrated]).notes[0].content).toBe('new snapshot');
  });
  it.each([404, 410])('keeps other notes when a referenced object returns %s', async (status) => {
    const missing = 'https://social.test/deleted';
    const s = server({
      [alice]: actor,
      [actor.inbox]: {
        orderedItems: [
          create,
          { type: 'Create', actor: alice, object: missing },
          { type: 'Announce', actor: bob, object: missing },
          { type: 'Delete', actor: alice, object: missing },
        ],
      },
      [actor.outbox]: { orderedItems: [] },
      [missing]: new Response(null, { status }),
    });
    const result = await new ActivityPubClient({
      actorUrl: alice,
      fetch: s.fetcher,
    }).loadTimeline();
    expect(result.notes.map((n) => n.id)).toEqual([id]);
  });
  it.each([401, 403, 500])('does not suppress referenced-object HTTP %s errors', async (status) => {
    const missing = 'https://social.test/unavailable';
    const s = server({
      [alice]: actor,
      [actor.inbox]: { orderedItems: [{ type: 'Create', actor: alice, object: missing }] },
      [actor.outbox]: { orderedItems: [] },
      [missing]: new Response(null, { status }),
    });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow(String(status));
  });
  it('does not suppress missing collection endpoint errors', async () => {
    const s = server({ [alice]: actor, [actor.outbox]: { orderedItems: [] } });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).loadTimeline(),
    ).rejects.toThrow('404');
  });
});

describe('session cancellation', () => {
  it('does not publish after disconnect while actor discovery is pending', async () => {
    const controller = new AbortController();
    let deliverActor!: (value: Response) => void;
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET');
      if (init?.method === 'POST')
        return new Response(null, { status: 201, headers: { Location: '/created' } });
      if (String(input) !== alice) return new Response(JSON.stringify(create));
      return new Promise<Response>((resolve) => {
        deliverActor = resolve;
      });
    };
    const client = new ActivityPubClient({
      actorUrl: alice,
      fetch: fetcher,
      signal: controller.signal,
    });
    const publishing = client.publishNote('cancelled post');
    controller.abort();
    deliverActor(new Response(JSON.stringify(actor)));
    await expect(publishing).rejects.toThrow(/abort/i);
    expect(calls).toEqual(['GET']);
  });
});

describe('update version watermark', () => {
  it('retains activity updated time so a subsequently ordered stale patch cannot replace it', () => {
    const newest = {
      type: 'Update',
      actor: alice,
      published: '2025-01-02T00:00:00Z',
      updated: '2025-01-04T00:00:00Z',
      object: { id, content: 'latest' },
    };
    const stale = {
      type: 'Update',
      actor: alice,
      published: '2025-01-03T00:00:00Z',
      object: { id, content: 'stale' },
    };
    const result = evaluateActivities([create, newest, stale]).notes[0];
    expect(result.content).toBe('latest');
    expect(result.updated).toBe('2025-01-04T00:00:00Z');
  });
});

describe('reactions and mentions', () => {
  const like = { type: 'Like', id: 'https://else.test/l1', actor: bob, object: id };
  it('records likes of known notes with their activity IRIs', () => {
    const result = evaluateActivities([like, create]);
    expect(result.notes[0].likedBy).toEqual([bob]);
    expect(result.notes[0].reactions).toEqual([{ kind: 'like', actor: bob, activity: like.id }]);
    expect(result.diagnostics).toEqual({ ignored: 0, rejected: 0 });
  });
  it('accepts an embedded Note object and requires an actor', () => {
    const embedded = { ...like, object: note };
    expect(evaluateActivities([create, embedded]).notes[0].likedBy).toEqual([bob]);
    const result = evaluateActivities([create, { type: 'Like', object: id }]);
    expect(result.notes[0].likedBy).toEqual([]);
    expect(result.diagnostics.rejected).toBe(1);
  });
  it('only lets the liking actor undo, in any page order', () => {
    const foreign = { type: 'Undo', actor: alice, object: like.id };
    const own = { type: 'Undo', actor: bob, object: { id: like.id } };
    const rejected = evaluateActivities([create, like, foreign]);
    expect(rejected.notes[0].likedBy).toEqual([bob]);
    expect(rejected.diagnostics.rejected).toBe(1);
    expect(evaluateActivities([own, like, create]).notes[0].likedBy).toEqual([]);
    expect(evaluateActivities([own, like, create]).notes[0].reactions).toEqual([]);
  });
  it('deduplicates repeated likes per actor while keeping distinct activities', () => {
    const again = { ...like, id: 'https://else.test/l2' };
    const result = evaluateActivities([again, create, like, like]).notes[0];
    expect(result.likedBy).toEqual([bob]);
    expect(result.reactions.map((r) => r.activity)).toEqual([like.id, again.id]);
  });
  it('does not show like-only notes and reject-counts likes of unknown objects', () => {
    const unknown = { ...like, object: 'https://social.test/notes/none' };
    const embedded = { ...like, id: 'https://else.test/l2', object: note };
    const result = evaluateActivities([unknown, embedded]);
    expect(result.notes).toEqual([]);
    expect(result.diagnostics.rejected).toBe(1);
    expect(evaluateActivities([{ ...like, object: note }, create]).notes[0].likedBy).toEqual([bob]);
  });
  it('reject-counts a like whose embedded object is malformed instead of attaching it', () => {
    const crossOrigin = { ...like, object: { ...note, attributedTo: bob } };
    const result = evaluateActivities([create, crossOrigin]);
    expect(result.notes[0].likedBy).toEqual([]);
    expect(result.notes[0].reactions).toEqual([]);
    expect(result.diagnostics.rejected).toBe(1);
    const noContent = { ...like, object: { type: 'Note', id, attributedTo: alice } };
    expect(evaluateActivities([create, noContent]).diagnostics.rejected).toBe(1);
  });
  it('parses sorted, deduplicated Mention tags from arrays and single objects', () => {
    const tagged = {
      ...create,
      object: {
        ...note,
        tag: [
          { type: 'Mention', href: bob, name: '@bob' },
          { type: 'Hashtag', href: 'https://social.test/tags/x', name: '#x' },
          { type: 'Mention', href: 'https://a.test/anna' },
          { type: 'Mention', href: bob },
          { type: 'Mention', href: 'mailto:someone@example.test' },
          'https://social.test/notes/ignored-string-tag',
        ],
      },
    };
    expect(evaluateActivities([tagged]).notes[0].mentions).toEqual(['https://a.test/anna', bob]);
    const single = { ...create, object: { ...note, tag: { type: 'Mention', href: bob } } };
    expect(evaluateActivities([single]).notes[0].mentions).toEqual([bob]);
    expect(evaluateActivities([create]).notes[0].mentions).toEqual([]);
  });
  it('keeps reaction order stable regardless of page order', () => {
    const ann = { type: 'Announce', id: 'https://else.test/a1', actor: bob, object: note };
    const aliceLike = { ...like, id: 'https://social.test/l9', actor: alice };
    const expected = [
      { kind: 'like', actor: bob, activity: like.id },
      { kind: 'like', actor: alice, activity: aliceLike.id },
      { kind: 'share', actor: bob, activity: ann.id },
    ];
    const a = evaluateActivities([create, like, ann, aliceLike]).notes[0];
    const b = evaluateActivities([aliceLike, ann, like, create]).notes[0];
    expect(a.reactions).toEqual(b.reactions);
    expect(new Set(a.reactions.map((r) => r.activity))).toEqual(
      new Set(expected.map((r) => r.activity)),
    );
    expect(a.likedBy).toEqual([alice, bob].sort());
    expect(a.announcedBy).toEqual([bob]);
  });
});

describe('reactions over C2S', () => {
  const target = {
    ...note,
    author: alice,
    announcedBy: [],
    likedBy: [],
    reactions: [],
    mentions: [],
  };
  it('hydrates Like objects given as IRIs', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: {
        orderedItems: [{ type: 'Like', id: 'https://else.test/l', actor: bob, object: id }],
      },
      [actor.outbox]: { orderedItems: [create] },
      [id]: note,
    });
    const result = await new ActivityPubClient({
      actorUrl: alice,
      fetch: s.fetcher,
    }).loadTimeline();
    expect(s.calls.some((c) => c.url === id)).toBe(true);
    expect(result.notes[0].likedBy).toEqual([bob]);
  });
  it.each([201, 200, 202])(
    'posts a public Like/Announce and accepts %s without Location',
    async (status) => {
      const s = server({ [alice]: actor, [actor.outbox]: new Response(null, { status }) });
      const client = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
      await expect(client.react('like', target)).resolves.toBeDefined();
      await expect(client.react('share', { ...target, author: bob })).resolves.toBeDefined();
      const bodies = s.calls
        .filter((c) => c.init?.method === 'POST')
        .map((c) => JSON.parse(c.init!.body as string));
      expect(bodies[0]).toMatchObject({ type: 'Like', actor: alice, object: id });
      expect(bodies[0].to).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
      expect(bodies[0].cc).toEqual([actor.followers]);
      expect(bodies[1]).toMatchObject({ type: 'Announce', object: id });
      expect(bodies[1].cc).toEqual([actor.followers, bob]);
    },
  );
  it('does not send the bearer token to an outbox on another origin', async () => {
    const remote = { ...actor, outbox: 'https://else.test/outbox' };
    const s = server({ [alice]: remote, [remote.outbox]: new Response(null, { status: 201 }) });
    const client = new ActivityPubClient({ actorUrl: alice, token: 'secret', fetch: s.fetcher });
    await expect(client.react('like', target)).resolves.toBeDefined();
    const post = s.calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe(remote.outbox);
    expect(post.init!.headers).not.toHaveProperty('Authorization');
    expect(s.calls.find((c) => c.url === alice)!.init!.headers).toHaveProperty(
      'Authorization',
      'Bearer secret',
    );
  });
  it('rejects a refused write with a typed HTTP status', async () => {
    const bad = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 400 }) });
    const error = await new ActivityPubClient({ actorUrl: alice, fetch: bad.fetcher })
      .undoReaction('https://social.test/l')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ status: 400 });
    expect((error as Error).message).toMatch(/Undo.*400/);
  });
  it('posts Undo with the activity IRI and reports rejected statuses with the code', async () => {
    const ok = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 201 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: ok.fetcher }).undoReaction(
        'https://social.test/l',
      ),
    ).resolves.toBeDefined();
    const body = JSON.parse(ok.calls.find((c) => c.init?.method === 'POST')!.init!.body as string);
    expect(body).toMatchObject({ type: 'Undo', actor: alice, object: 'https://social.test/l' });
    expect(body.to).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
    const bad = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 400 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: bad.fetcher }).undoReaction(
        'https://social.test/l',
      ),
    ).rejects.toThrow(/400/);
    const odd = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 204 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: odd.fetcher }).react('like', target),
    ).rejects.toThrow(/204/);
  });
});
