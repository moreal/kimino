import { describe, expect, it } from 'vitest';
import { evaluateActivities, ownReaction } from '../domain/evaluate';
import type { NoteReaction } from '../domain/social';
import { ActivityPubClient } from './client';
import { GatewayProtocolError, GatewayRejected, toFailure } from '../application/gateway-errors';
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
  it('lists only the deletions it accepted: a Delete by a non-author is rejected and not in `deleted`', () => {
    const spoofed = evaluateActivities([create, { type: 'Delete', actor: bob, object: id }]);
    expect(spoofed.notes).toHaveLength(1);
    expect(spoofed.deleted).toEqual([]);
    expect(spoofed.diagnostics.rejected).toBe(1);
    const own = evaluateActivities([create, { type: 'Delete', actor: alice, object: id }]);
    expect(own.notes).toEqual([]);
    expect(own.deleted).toEqual([id]);
    // A Tombstone in the Create, and one read back as this actor's Update, are deletions too.
    const tomb = { id, type: 'Tombstone', formerType: 'Note' };
    expect(evaluateActivities([{ ...create, object: tomb }]).deleted).toEqual([id]);
    expect(
      evaluateActivities([
        create,
        { id: `${id}#read-back`, type: 'Update', actor: alice, object: tomb },
      ]).deleted,
    ).toEqual([id]);
    expect(evaluateActivities([]).deleted).toEqual([]);
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
  it('treats a tombstoned object as a deletion, not as an unknown or malformed activity', () => {
    const tomb = {
      id,
      type: 'Tombstone',
      formerType: 'Note',
      deleted: '2025-01-05T00:00:00Z',
    };
    // What a server leaves behind after a delete: the Create stays, its object is a Tombstone.
    const buried = evaluateActivities([{ ...create, object: tomb }]);
    expect(buried.notes).toEqual([]);
    expect(buried.diagnostics).toEqual({ ignored: 0, rejected: 0 });
    // Nothing in the same snapshot brings it back: not the original Create, not an
    // Announce carrying the whole Note, not a stale Update.
    const ann = { type: 'Announce', id: 'https://else.test/a', actor: bob, object: note };
    const together = evaluateActivities([
      { ...create, object: tomb },
      create,
      ann,
      { type: 'Update', actor: alice, object: tomb },
      { type: 'Delete', actor: alice, object: tomb },
      tomb,
    ]);
    expect(together.notes).toEqual([]);
    expect(together.diagnostics).toEqual({ ignored: 0, rejected: 0 });
    // `formerType` alone is enough; so is a bare Tombstone item beside a live Create.
    expect(
      evaluateActivities([{ ...create, object: { ...note, formerType: 'Note' } }]).notes,
    ).toEqual([]);
    const bare = evaluateActivities([create, { id, type: 'Tombstone' }]);
    expect(bare.notes).toEqual([]);
    expect(bare.diagnostics).toEqual({ ignored: 0, rejected: 0 });
  });
  it('refuses a relayed Tombstone Delete from anyone but the author, and keeps the note', () => {
    const tomb = { id, type: 'Tombstone', formerType: 'Note' };
    // Mastodon's real Delete carries a Tombstone: relayed from bob it must not bury alice's note.
    const relayed = evaluateActivities([
      create,
      { id: 'https://else.test/d1', type: 'Delete', actor: bob, object: tomb },
    ]);
    expect(relayed.notes.map((n) => n.id)).toEqual([id]);
    expect(relayed.deleted).toEqual([]);
    expect(relayed.diagnostics.rejected).toBe(1);
    // Neither may a foreign Create or Update wrapping the same Tombstone.
    for (const type of ['Create', 'Update']) {
      const wrapped = evaluateActivities([
        create,
        { id: 'https://else.test/w', type, actor: bob, object: tomb },
      ]);
      expect(wrapped.notes.map((n) => n.id)).toEqual([id]);
      expect(wrapped.deleted).toEqual([]);
      expect(wrapped.diagnostics.rejected).toBe(1);
    }
    // The author's own Tombstone Delete buries it, whichever order the pages arrive in.
    const own = { id: 'https://social.test/d1', type: 'Delete', actor: alice, object: tomb };
    for (const batch of [
      [create, own],
      [own, create],
    ]) {
      const result = evaluateActivities(batch);
      expect(result.notes).toEqual([]);
      expect(result.deleted).toEqual([id]);
      expect(result.diagnostics.rejected).toBe(0);
    }
    // The read-back of a deleted note is this actor's synthetic Update with a Tombstone.
    const readBack = evaluateActivities([
      create,
      { id: `${id}#read-back`, type: 'Update', actor: alice, object: tomb },
    ]);
    expect(readBack.notes).toEqual([]);
    expect(readBack.deleted).toEqual([id]);
    expect(readBack.diagnostics.rejected).toBe(0);
    // A Tombstone with no wrapper actor is the server's own word and stays accepted, as does
    // one wrapped in an actor-less activity; and a Tombstone for a note nobody loaded keeps
    // being a deletion, whoever relayed it, since there is nothing of anyone's to protect.
    expect(evaluateActivities([create, tomb]).deleted).toEqual([id]);
    expect(evaluateActivities([create, { type: 'Delete', object: tomb }]).deleted).toEqual([id]);
    const unknown = evaluateActivities([{ type: 'Delete', actor: bob, object: tomb }]);
    expect(unknown.deleted).toEqual([id]);
    expect(unknown.diagnostics.rejected).toBe(0);
  });
  it('lets a Delete withdraw its own Like or Announce, and nobody else’s', () => {
    const like = { type: 'Like', id: 'https://else.test/l1', actor: bob, object: id };
    const ann = { type: 'Announce', id: 'https://else.test/a1', actor: bob, object: note };
    const withdrawn = evaluateActivities([
      create,
      like,
      ann,
      { type: 'Delete', actor: bob, object: like.id },
      { type: 'Delete', actor: bob, object: ann.id },
    ]);
    expect(withdrawn.notes[0].likedBy).toEqual([]);
    expect(withdrawn.notes[0].announcedBy).toEqual([]);
    expect(withdrawn.notes[0].reactions).toEqual([]);
    expect(withdrawn.diagnostics.rejected).toBe(0);
    const foreign = evaluateActivities([
      create,
      like,
      { type: 'Delete', actor: alice, object: like.id },
    ]);
    expect(foreign.notes[0].likedBy).toEqual([bob]);
    expect(foreign.diagnostics.rejected).toBe(1);
  });
  it('exposes only an addressable activity IRI as the reader’s own reaction', () => {
    const reactions: NoteReaction[] = [
      { kind: 'like', actor: alice, activity: 'https://social.test/l1' },
      { kind: 'share', actor: alice, activity: '{"type":"Announce"}' },
      { kind: 'like', actor: bob, activity: 'https://else.test/l2' },
    ];
    expect(ownReaction({ reactions }, 'like', alice)?.activity).toBe('https://social.test/l1');
    // A reaction the load carried without an IRI cannot be deleted, so it is not offered.
    expect(ownReaction({ reactions }, 'share', alice)).toBeUndefined();
    expect(ownReaction({ reactions }, 'like', undefined)).toBeUndefined();
    expect(ownReaction({ reactions }, 'like', bob)?.activity).toBe('https://else.test/l2');
    // An activity without its own IRI keeps the note's reaction list honest but unaimable.
    const anonymous = evaluateActivities([create, { type: 'Like', actor: bob, object: id }]);
    expect(anonymous.notes[0].likedBy).toEqual([bob]);
    expect(ownReaction(anonymous.notes[0], 'like', bob)).toBeUndefined();
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
  it('reads 100 pages per collection by default and refuses the 101st as a truncated read', async () => {
    // The collection root counts as the first page: 99 pages after it fit under the ceiling.
    const chain = (pages: number) => {
      const routes: Record<string, unknown> = {
        [alice]: actor,
        [actor.outbox]: { orderedItems: [] },
      };
      const url = (n: number) => `https://social.test/inbox/page/${n}`;
      routes[actor.inbox] = { type: 'OrderedCollection', first: url(1) };
      for (let n = 1; n <= pages; n++)
        routes[url(n)] = {
          type: 'OrderedCollectionPage',
          orderedItems: [],
          ...(n < pages ? { next: url(n + 1) } : {}),
        };
      return server(routes);
    };
    const hundred = chain(99);
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: hundred.fetcher }).loadTimeline(),
    ).resolves.toMatchObject({ notes: [] });
    expect(hundred.calls.filter((c) => c.url.includes('/inbox/page/'))).toHaveLength(99);
    const over = chain(100);
    const failure = await new ActivityPubClient({ actorUrl: alice, fetch: over.fetcher })
      .loadTimeline()
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    // A read that would be truncated is a protocol failure, never an empty timeline.
    expect(failure).toBeInstanceOf(GatewayProtocolError);
    expect(toFailure(failure)).toMatchObject({ kind: 'protocol', reason: 'unexpected-response' });
    // The ceiling is a positive whole number of pages.
    for (const maxPages of [0, -1, 1.5])
      expect(() => new ActivityPubClient({ actorUrl: alice, maxPages })).toThrow(/page limit/i);
  });
  it('publishes escaped public replies and hydrates the Location', async () => {
    const s = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, { status: 201, headers: { Location: '/posted' } }),
      'https://social.test/posted': create,
    });
    const result = await new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote(
      { content: '<hello>', visibility: 'public' },
      {
        ...note,
        author: bob,
        visibility: 'public',
        attachments: [],
        announcedBy: [],
        likedBy: [],
        reactions: [],
        mentions: [],
      },
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
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote({
        content: 'hello',
        visibility: 'public',
      }),
    ).resolves.toEqual({ location: 'https://social.test/not-visible-yet', activity: null });
  });
  it('reports a missing exposed Location as possibly accepted', async () => {
    const s = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 201 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote({
        content: 'hello',
        visibility: 'public',
      }),
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
    const publishing = client.publishNote({ content: 'cancelled post', visibility: 'public' });
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
    visibility: 'public' as const,
    attachments: [],
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
  it('addresses a reaction no wider than the note it reacts to', async () => {
    const s = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 201 }) });
    const client = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    await client.react('share', { ...target, visibility: 'followers' });
    await client.react('like', {
      ...target,
      author: bob,
      visibility: 'unknown',
      mentions: [alice],
    });
    const bodies = s.calls
      .filter((c) => c.init?.method === 'POST')
      .map((c) => JSON.parse(c.init!.body as string) as Record<string, unknown>);
    expect(bodies[0]).toMatchObject({ type: 'Announce', to: [actor.followers], cc: [] });
    expect(JSON.stringify(bodies[0])).not.toContain('#Public');
    // Unknown scope: the author alone, never a guessed audience.
    expect(bodies[1]).toMatchObject({ type: 'Like', to: [bob], cc: [] });
    expect(JSON.stringify(bodies[1])).not.toContain('#Public');
  });
  it('refuses a reaction this server cannot address instead of widening it', async () => {
    const noFollowers = { ...actor, followers: undefined };
    const s = server({ [alice]: noFollowers, [actor.outbox]: new Response(null, { status: 201 }) });
    const client = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    await expect(client.react('share', { ...target, visibility: 'followers' })).rejects.toThrow(
      /followers collection/,
    );
    // Nothing was sent: the refusal happens before the outbox is written to.
    expect(s.calls.filter((c) => c.init?.method === 'POST')).toEqual([]);
  });
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
      .withdrawReaction(target, 'https://social.test/l')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayRejected);
    expect(error).toMatchObject({ status: 400, code: 400 });
    expect((error as Error).message).toMatch(/Delete.*400/);
  });
  it('withdraws a reaction by deleting its activity, addressed no wider than the note', async () => {
    const ok = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, { status: 201, headers: { Location: '/outbox/1' } }),
    });
    const client = new ActivityPubClient({ actorUrl: alice, fetch: ok.fetcher });
    await expect(
      client.withdrawReaction({ ...target, visibility: 'followers' }, 'https://social.test/l'),
    ).resolves.toMatchObject({ location: 'https://social.test/outbox/1' });
    const body = JSON.parse(ok.calls.find((c) => c.init?.method === 'POST')!.init!.body as string);
    expect(body).toMatchObject({ type: 'Delete', actor: alice, object: 'https://social.test/l' });
    expect(body.to).toEqual([actor.followers]);
    expect(JSON.stringify(body)).not.toContain('#Public');
    // Undo is never sent: this server family answers it with 400 and takes nothing back.
    expect(JSON.stringify(body)).not.toContain('Undo');
    const bad = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 400 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: bad.fetcher }).withdrawReaction(
        target,
        'https://social.test/l',
      ),
    ).rejects.toThrow(/400/);
    const odd = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 204 }) });
    await expect(
      new ActivityPubClient({ actorUrl: alice, fetch: odd.fetcher }).react('like', target),
    ).rejects.toThrow(/204/);
  });
  it('reads 410 Gone as a confirmed Delete and as a failure on every other call', async () => {
    const gone = () => new Response(null, { status: 410, headers: { Location: '/outbox/gone' } });
    const client = (routes: Record<string, unknown>) =>
      new ActivityPubClient({ actorUrl: alice, fetch: server(routes).fetcher });
    // The one path that accepts it: a Delete of a note, and of a reaction activity.
    await expect(
      client({ [alice]: actor, [actor.outbox]: gone() }).deleteNote(target),
    ).resolves.toMatchObject({ location: 'https://social.test/outbox/gone' });
    await expect(
      client({ [alice]: actor, [actor.outbox]: gone() }).withdrawReaction(
        target,
        'https://social.test/l',
      ),
    ).resolves.toBeDefined();
    // Every other write still fails on 410, so a gone outbox is never read as success.
    await expect(
      client({ [alice]: actor, [actor.outbox]: gone() }).react('like', target),
    ).rejects.toThrow(/410/);
    await expect(
      client({ [alice]: actor, [actor.outbox]: gone() }).publishNote({
        content: 'hi',
        visibility: 'public',
      }),
    ).rejects.toThrow(/410/);
    await expect(
      client({ [alice]: actor, [actor.outbox]: gone() }).updateNote(target, {
        content: 'hi',
        visibility: 'public',
      }),
    ).rejects.toThrow(/410/);
    // A read answering 410 is still a failed load, not an empty timeline.
    await expect(client({ [alice]: gone() }).loadTimeline()).rejects.toThrow(/410/);
  });
  it('posts an Update with the object embedded, its id, and no addressing of its own', async () => {
    const ok = server({ [alice]: actor, [actor.outbox]: new Response(null, { status: 201 }) });
    const client = new ActivityPubClient({ actorUrl: alice, fetch: ok.fetcher });
    await client.updateNote(target, {
      content: '고친 글\n둘째 줄 <b>',
      summary: '  새 경고  ',
      visibility: 'public',
    });
    // Clearing a warning is an empty summary: an omitted one would leave the old one up.
    await client.updateNote(target, { content: '경고 없이', visibility: 'public' });
    const bodies = ok.calls
      .filter((c) => c.init?.method === 'POST')
      .map((c) => JSON.parse(c.init!.body as string) as Record<string, unknown>);
    expect(bodies[0]).toMatchObject({ type: 'Update', actor: alice });
    expect(bodies[0].object).toEqual({
      id,
      type: 'Note',
      attributedTo: alice,
      content: '고친 글<br>둘째 줄 &lt;b&gt;',
      mediaType: 'text/html',
      summary: '새 경고',
    });
    expect((bodies[1].object as Record<string, unknown>).summary).toBe('');
    // No `to`/`cc` anywhere: the note keeps exactly the audience it was published to.
    expect(bodies[0].to).toBeUndefined();
    expect(bodies[0].cc).toBeUndefined();
    expect(JSON.stringify(bodies[0])).not.toContain('#Public');
  });
});

describe('content warnings, attachments and visibility', () => {
  const followers = 'https://social.test/followers';
  const followersOf = (author: string) => (author === alice ? followers : undefined);
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  it('keeps a trimmed summary, normalizes a scalar attachment and infers visibility', () => {
    const cw = {
      ...note,
      summary: '  스포일러  ',
      to: followers,
      attachment: { type: 'Image', url: 'https://cdn.test/a.png', mediaType: 'image/png' },
    };
    const [n] = evaluateActivities([{ ...create, object: cw }], { followersOf }).notes;
    expect(n.summary).toBe('스포일러');
    expect(n.visibility).toBe('followers');
    expect(n.attachments).toEqual([
      { kind: 'image', url: 'https://cdn.test/a.png', mediaType: 'image/png', alt: undefined },
    ]);
  });
  it('treats an empty summary as no warning and unknown addressing without followers', () => {
    const plain = { ...note, summary: '', to: ['https://else.test/x'] };
    const [n] = evaluateActivities([{ ...create, object: plain }]).notes;
    expect(n.summary).toBeUndefined();
    expect(n.visibility).toBe('unknown');
    expect(n.attachments).toEqual([]);
    expect(
      evaluateActivities([{ ...create, object: { ...note, to: [followers], cc: [PUBLIC] } }])
        .notes[0].visibility,
    ).toBe('unlisted');
  });
  it('lets owner updates add or clear the warning and attachments', () => {
    const update = {
      type: 'Update',
      actor: alice,
      object: { ...note, summary: '주의', attachment: [] },
      published: '2025-01-02T00:00:00Z',
    };
    const first = evaluateActivities([create, update]).notes[0];
    expect(first.summary).toBe('주의');
    const cleared = {
      ...update,
      object: { ...note, summary: null },
      published: '2025-01-03T00:00:00Z',
    };
    expect(evaluateActivities([create, update, cleared]).notes[0].summary).toBeUndefined();
  });
});

describe('publishing with a warning and a visibility', () => {
  it('sends summary and followers-only addressing with the full Public IRI absent', async () => {
    const s = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, { status: 201, headers: { Location: '/posted' } }),
      'https://social.test/posted': create,
    });
    await new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote({
      content: 'quiet',
      summary: '  스포일러 ',
      visibility: 'followers',
    });
    const body = JSON.parse(s.calls.find((c) => c.init?.method === 'POST')!.init!.body as string);
    expect(body.object.summary).toBe('스포일러');
    expect(body.to).toEqual([actor.followers]);
    expect(body.cc).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('#Public');
    expect(body.object).not.toHaveProperty('sensitive');
  });
  it('omits an empty summary and puts Public in cc for unlisted notes', async () => {
    const s = server({
      [alice]: actor,
      [actor.outbox]: new Response(null, { status: 201, headers: { Location: '/posted' } }),
    });
    await new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher }).publishNote({
      content: 'soft',
      summary: '   ',
      visibility: 'unlisted',
    });
    const body = JSON.parse(s.calls.find((c) => c.init?.method === 'POST')!.init!.body as string);
    expect(body.object).not.toHaveProperty('summary');
    expect(body.object.cc).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
    expect(body.object.to).toEqual([actor.followers]);
  });
  it("reads another actor's note addressed only to me and mentioned people as direct", () => {
    const dm = {
      ...note,
      id: new URL('/notes/dm', bob).href,
      attributedTo: bob,
      to: [alice],
      cc: [],
      tag: [{ type: 'Mention', href: alice }],
    };
    const from = (extra: Record<string, unknown>) =>
      evaluateActivities(
        [{ ...create, id: 'https://b.test/acts/dm', actor: bob, object: { ...dm, ...extra } }],
        { self: alice },
      ).notes[0].visibility;
    expect(from({})).toBe('direct');
    expect(from({ to: [alice, 'https://c.test/carol'] })).toBe('unknown');
    expect(
      from({
        to: ['https://c.test/carol'],
        tag: [{ type: 'Mention', href: 'https://c.test/carol' }],
      }),
    ).toBe('direct');
    expect(from({ to: [bob + '/followers'], cc: [alice] })).toBe('unknown');
  });
  it('marks the session actor notes with visibility from its followers collection', async () => {
    const own = { ...note, to: [actor.followers] };
    const s = server({
      [alice]: actor,
      [actor.inbox]: { orderedItems: [] },
      [actor.outbox]: { orderedItems: [{ ...create, object: own }] },
    });
    const result = await new ActivityPubClient({
      actorUrl: alice,
      fetch: s.fetcher,
    }).loadTimeline();
    expect(result.notes[0].visibility).toBe('followers');
  });
});

describe('round 11: what the read reached, and what the server still holds', () => {
  const asNote = {
    ...note,
    author: alice,
    visibility: 'public' as const,
    attachments: [],
    announcedBy: [],
    likedBy: [],
    reactions: [],
    mentions: [],
  };
  const client = (routes: Record<string, unknown>) => {
    const s = server(routes);
    return { s, client: new ActivityPubClient({ actorUrl: alice, token: 't', fetch: s.fetcher }) };
  };

  it('counts distinct activities and the shortfall each collection declared', async () => {
    const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({
      type: 'OrderedCollectionPage',
      orderedItems: items,
      ...extra,
    });
    const { client: c } = client({
      [alice]: actor,
      // The inbox hands the same activity back through `first`: read twice, counted once.
      [actor.inbox]: {
        type: 'OrderedCollection',
        totalItems: 1,
        orderedItems: [create],
        first: 'https://social.test/inbox-first',
      },
      'https://social.test/inbox-first': page([create]),
      // The outbox declares four and delivers two, with no page left to ask for.
      [actor.outbox]: page([create, { ...create, id: 'https://social.test/c2' }], {
        totalItems: 4,
      }),
    });
    const result = await c.loadTimeline();
    expect(result.reach).toEqual({ fetched: 3, missing: 2 });
  });

  it('claims nothing about collections that declare no total', async () => {
    const { client: c } = client({
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', orderedItems: [] },
      [actor.outbox]: { type: 'OrderedCollection', orderedItems: [create] },
    });
    expect((await c.loadTimeline()).reach).toEqual({ fetched: 1, missing: 0 });
  });

  it('reads a note back as present, and as gone on 410, 404 or a Tombstone', async () => {
    const present = client({ [alice]: actor, [id]: note });
    expect(await present.client.noteExists(asNote)).toBe(true);
    // The read is authenticated: a note only its author may see must not read as deleted.
    expect(present.s.calls.find((c) => c.url === id)!.init!.headers).toHaveProperty(
      'Authorization',
      'Bearer t',
    );
    for (const status of [404, 410]) {
      const { client: c } = client({ [alice]: actor, [id]: new Response('', { status }) });
      expect(await c.noteExists(asNote)).toBe(false);
    }
    const buried = client({
      [alice]: actor,
      [id]: { id, type: 'Tombstone', formerType: 'Note' },
    });
    expect(await buried.client.noteExists(asNote)).toBe(false);
  });

  it('never reads a server problem as a deletion', async () => {
    for (const status of [401, 403, 500, 503]) {
      const { client: c } = client({ [alice]: actor, [id]: new Response('', { status }) });
      await expect(c.noteExists(asNote)).rejects.toThrow();
    }
  });

  it('refuses a read-back whose id is not the note asked for', async () => {
    const { client: c } = client({
      [alice]: actor,
      [id]: { ...note, id: 'https://social.test/notes/someone-elses' },
    });
    await expect(c.noteExists(asNote)).rejects.toThrow(
      'Resolved object ID does not match its requested IRI.',
    );
  });
});

describe('incremental read after a write', () => {
  const page = (items: unknown[], next?: string) => ({
    type: 'OrderedCollectionPage',
    totalItems: 3,
    orderedItems: items,
    ...(next ? { next } : {}),
  });
  const held = { ...create, id: 'https://social.test/c-held' };
  const fresh = {
    ...create,
    id: 'https://social.test/c-fresh',
    published: '2025-01-09T00:00:00Z',
    object: {
      ...create.object,
      id: 'https://social.test/notes/fresh',
      content: '<p>fresh</p>',
      published: '2025-01-09T00:00:00Z',
    },
  };
  const older = {
    ...create,
    id: 'https://social.test/c-older',
    object: { ...create.object, id: 'https://social.test/notes/older' },
  };
  const bobNote = {
    type: 'Note',
    id: 'https://else.test/notes/b',
    attributedTo: bob,
    content: 'from bob',
    published: '2024-12-01T00:00:00Z',
  };
  const bobCreate = {
    type: 'Create',
    id: 'https://else.test/c-b',
    actor: bob,
    object: bobNote,
    published: bobNote.published,
  };
  it('reads one page per collection, keeps what fell off it and the last full read’s reach', async () => {
    const routes: Record<string, unknown> = {
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', orderedItems: [] },
      // The root lists two items and points at a second page holding the third.
      [actor.outbox]: page([held, 'https://social.test/c-older'], 'https://social.test/page2'),
      'https://social.test/c-older': older,
      'https://social.test/page2': page([bobCreate]),
    };
    const s = server(routes);
    const c = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    const full = await c.loadTimeline();
    expect(full.notes).toHaveLength(3);
    expect(full.reach).toEqual({ fetched: 3, missing: 0 });
    expect(full.partial).toBeUndefined();
    // The server now lists the new activity first; the older one fell off the first page.
    routes[actor.outbox] = page([fresh, held], 'https://social.test/page2');
    s.calls.length = 0;
    const recent = await c.loadRecent(full);
    // The actor is known, held activities are not re-read: one request per collection.
    expect(s.calls.map((call) => call.url)).toEqual([actor.inbox, actor.outbox]);
    expect(recent.notes.map((n) => n.id)).toEqual([
      'https://social.test/notes/fresh',
      create.object.id,
      'https://social.test/notes/older',
      bobNote.id,
    ]);
    expect(recent.reach).toEqual(full.reach);
    expect(recent.partial).toBe(true);
    expect(recent.activities).toHaveLength(4);
  });
  it('takes a held activity fresh when it is inline, without fetching what it already resolved', async () => {
    const like = {
      type: 'Like',
      id: 'https://social.test/like-1',
      actor: alice,
      object: older.object.id,
      published: '2025-01-03T00:00:00Z',
    };
    const routes: Record<string, unknown> = {
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', orderedItems: [] },
      [actor.outbox]: page([held, like]),
      [older.object.id]: older.object,
    };
    const s = server(routes);
    const c = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    const full = await c.loadTimeline();
    expect(full.notes.map((n) => n.content)).toEqual(['hello']);
    // The server rewrote the Create's object in place - an edit with no Update activity - and
    // lists the Like again with its object as an IRI the full read already fetched.
    routes[actor.outbox] = page([
      { ...held, object: { ...held.object, content: 'rewritten' } },
      like,
    ]);
    s.calls.length = 0;
    const recent = await c.loadRecent(full);
    expect(s.calls.map((call) => call.url)).toEqual([actor.inbox, actor.outbox]);
    expect(recent.notes.map((n) => n.content)).toEqual(['rewritten']);
    expect(recent.diagnostics.rejected).toBe(full.diagnostics.rejected);
  });
  it('Update of a note held from page two while page one lists no Update row', async () => {
    const routes: Record<string, unknown> = {
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', orderedItems: [] },
      [actor.outbox]: page([held], 'https://social.test/page2'),
      'https://social.test/page2': page([older]),
      [older.object.id]: older.object,
    };
    const s = server(routes);
    const c = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    const full = await c.loadTimeline();
    expect(full.notes.map((n) => n.content)).toEqual(['hello', 'hello']);
    // The server took the Update, rewrote the object, and lists nothing new on page one.
    routes[older.object.id] = { ...older.object, content: 'edited' };
    s.calls.length = 0;
    const recent = await c.loadRecent(full, [older.object.id]);
    // The touched object, then one page per collection: three requests.
    expect(s.calls.map((call) => call.url)).toEqual([older.object.id, actor.inbox, actor.outbox]);
    expect(recent.notes.map((n) => [n.id, n.content])).toEqual([
      [create.object.id, 'hello'],
      [older.object.id, 'edited'],
    ]);
    // The note carries the server's own timestamps, not a stamp of this read: with no
    // `updated` on the object, an edit not announced by the server stays unmarked.
    expect(recent.notes[1]!.updated).toBe(older.object.published);
    expect(recent.diagnostics).toEqual(full.diagnostics);
    // A later edit replaces the earlier read of the same object instead of piling up beside it.
    routes[older.object.id] = { ...older.object, content: 'edited twice' };
    const again = await c.loadRecent(recent, [older.object.id]);
    expect(again.notes.map((n) => n.content)).toEqual(['hello', 'edited twice']);
    expect(again.activities).toHaveLength(recent.activities.length);
    // An object the server now answers with 410, 404, or a Tombstone is a deletion.
    for (const gone of [
      new Response('', { status: 410 }),
      new Response('', { status: 404 }),
      { id: older.object.id, type: 'Tombstone', formerType: 'Note' },
    ]) {
      routes[older.object.id] = gone;
      const deleted = await c.loadRecent(again, [older.object.id]);
      expect(deleted.notes.map((n) => n.id)).toEqual([create.object.id]);
      expect(deleted.diagnostics).toEqual(full.diagnostics);
    }
    // Any other failure to read a touched object fails the read: it is not a deletion.
    routes[older.object.id] = new Response('', { status: 500 });
    await expect(c.loadRecent(again, [older.object.id])).rejects.toThrow(/500/);
  });
  it('follows `first` once when the root carries no items, and never `next`', async () => {
    const s = server({
      [alice]: actor,
      [actor.inbox]: { type: 'OrderedCollection', first: 'https://social.test/inbox-1' },
      'https://social.test/inbox-1': page([fresh], 'https://social.test/inbox-2'),
      'https://social.test/inbox-2': page([older]),
      [actor.outbox]: { type: 'OrderedCollection', orderedItems: [] },
    });
    const c = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    const previous = await c.loadTimeline();
    expect(previous.notes).toHaveLength(2);
    s.calls.length = 0;
    const recent = await c.loadRecent({ ...previous, activities: [] });
    expect(s.calls.map((call) => call.url)).toEqual([
      actor.inbox,
      'https://social.test/inbox-1',
      actor.outbox,
    ]);
    expect(recent.notes.map((n) => n.id)).toEqual(['https://social.test/notes/fresh']);
  });
  it('re-reads the actor on a full read but not on a recent one, and forgets a failed read', async () => {
    const routes: Record<string, unknown> = {
      [alice]: new Response('', { status: 500 }),
      [actor.inbox]: { type: 'OrderedCollection', orderedItems: [] },
      [actor.outbox]: { type: 'OrderedCollection', orderedItems: [] },
    };
    const s = server(routes);
    const c = new ActivityPubClient({ actorUrl: alice, fetch: s.fetcher });
    await expect(c.loadTimeline()).rejects.toThrow(/500/);
    routes[alice] = { ...actor, name: 'Alice' };
    const first = await c.loadTimeline();
    expect(first.actor.name).toBe('Alice');
    routes[alice] = { ...actor, name: 'Renamed' };
    const recent = await c.loadRecent(first);
    expect(recent.actor.name).toBe('Alice');
    expect((await c.loadTimeline()).actor.name).toBe('Renamed');
    expect(s.calls.filter((call) => call.url === alice)).toHaveLength(3);
  });
});
