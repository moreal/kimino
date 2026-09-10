import { describe, expect, it } from 'vitest';
import type { Visibility } from './social';
import {
  AddressingError,
  NOTE_LIMITS,
  PUBLIC,
  htmlFromPlain,
  buildAddressing,
  clampVisibility,
  inferVisibility,
  normalizeAttachments,
  recipients,
  withdrawalAddressing,
  reactionAddressing,
  replyLimit,
  replyParticipants,
} from './note-content';

const followers = 'https://social.test/followers';
const bob = 'https://else.test/bob';
describe('visibility inference', () => {
  it('reads Public from to (public) or cc (unlisted), in any accepted form', () => {
    expect(inferVisibility([PUBLIC], [followers])).toBe('public');
    expect(inferVisibility([followers], [PUBLIC], followers)).toBe('unlisted');
    expect(inferVisibility(['as:Public'], [])).toBe('public');
  });
  it('needs the followers collection to separate followers-only from direct', () => {
    expect(inferVisibility([followers], [], followers)).toBe('followers');
    expect(inferVisibility([bob], [followers], followers)).toBe('followers');
    expect(inferVisibility([bob], [], followers)).toBe('direct');
    expect(inferVisibility([followers], [])).toBe('unknown');
    expect(inferVisibility([], [], followers)).toBe('unknown');
  });
  it('recognizes a direct note by its recipients all being known actors', () => {
    const me = 'https://social.test/me';
    // Another actor's followers collection is never known; the recipients tell it apart.
    expect(inferVisibility([me], [], undefined, [me, bob])).toBe('direct');
    expect(inferVisibility([me, 'https://else.test/carol'], [], undefined, [me, bob])).toBe(
      'unknown',
    );
    expect(inferVisibility([bob + '/followers'], [me], undefined, [me, bob])).toBe('unknown');
    expect(inferVisibility([me], [], followers, [me])).toBe('direct');
    expect(inferVisibility([], [], undefined, [me])).toBe('unknown');
  });
  it('normalizes scalar, array and object recipients', () => {
    expect(recipients(PUBLIC)).toEqual([PUBLIC]);
    expect(recipients([{ id: bob }, 42, followers])).toEqual([bob, followers]);
    expect(recipients(undefined)).toEqual([]);
  });
});

describe('reply visibility limits', () => {
  it('never lets a reply reach wider than its parent', () => {
    expect(clampVisibility('public', 'followers')).toBe('followers');
    expect(clampVisibility('public', 'direct')).toBe('direct');
    expect(clampVisibility('direct', 'public')).toBe('direct');
    expect(clampVisibility('unlisted', 'public')).toBe('unlisted');
    expect(clampVisibility('public')).toBe('public');
  });
  it('caps a reply to a parent of unknown scope at direct, whatever was asked for', () => {
    expect(replyLimit('unknown')).toBe('direct');
    expect(clampVisibility('public', 'unknown')).toBe('direct');
    expect(clampVisibility('followers', 'unknown')).toBe('direct');
    expect(clampVisibility('direct', 'unknown')).toBe('direct');
    // The default and the cap agree, so the composer and the session cannot disagree.
  });
  it('starts a reply at the parent visibility, or direct when the parent is unclear', () => {
    expect(replyLimit('public')).toBe('public');
    expect(replyLimit('followers')).toBe('followers');
    expect(replyLimit('direct')).toBe('direct');
    expect(replyLimit('unknown')).toBe('direct');
  });
});

describe('reaction addressing', () => {
  const me = 'https://social.test/alice';
  const actor = { id: me, followers };
  const carol = 'https://else.test/carol';
  const target = (visibility: Visibility, author = bob, mentions: string[] = []) => ({
    author,
    mentions,
    visibility,
  });
  it('keeps a public reaction public and tells the author and my followers', () => {
    expect(reactionAddressing(target('public'), actor)).toEqual({
      to: [PUBLIC],
      cc: [followers, bob],
    });
  });
  it('keeps an unlisted reaction off the public timeline the way the note is', () => {
    expect(reactionAddressing(target('unlisted'), actor)).toEqual({
      to: [followers, bob],
      cc: [PUBLIC],
    });
  });
  it('never puts Public on a reaction to a followers-only note', () => {
    const followersOnly = reactionAddressing(target('followers', me), actor);
    expect(followersOnly).toEqual({ to: [followers], cc: [] });
    expect(JSON.stringify(followersOnly)).not.toContain('#Public');
    // Someone else's followers-only note: its author is told, the audience stays mine.
    expect(reactionAddressing(target('followers', bob, [carol]), actor)).toEqual({
      to: [followers],
      cc: [bob, carol],
    });
  });
  it('keeps a reaction to a direct note inside that conversation, minus me', () => {
    expect(reactionAddressing(target('direct', bob, [me, carol]), actor)).toEqual({
      to: [bob, carol],
      cc: [],
    });
  });
  it('addresses the author alone when the note scope is unknown, never guessing wider', () => {
    const unknown = reactionAddressing(target('unknown', bob, [carol]), actor);
    expect(unknown).toEqual({ to: [bob], cc: [] });
    expect(JSON.stringify(unknown)).not.toContain('#Public');
    expect(JSON.stringify(unknown)).not.toContain('followers');
  });
  it('refuses a scope this server cannot address instead of widening it', () => {
    const noFollowers = { id: me };
    expect(() => reactionAddressing(target('followers', me), noFollowers)).toThrow(AddressingError);
    expect(() => reactionAddressing(target('unlisted'), noFollowers)).toThrow(AddressingError);
    // What can be addressed without a followers collection still goes out.
    expect(reactionAddressing(target('public'), noFollowers)).toEqual({ to: [PUBLIC], cc: [bob] });
    expect(reactionAddressing(target('direct', bob), noFollowers)).toEqual({ to: [bob], cc: [] });
  });
  it('never reaches wider than the note, whatever its visibility is', () => {
    const scopes: Visibility[] = ['public', 'unlisted', 'followers', 'direct', 'unknown'];
    for (const visibility of scopes) {
      const { to, cc } = reactionAddressing(target(visibility, bob, [carol]), actor);
      const isPublic = [...to, ...cc].includes(PUBLIC);
      expect([visibility, isPublic]).toEqual([
        visibility,
        visibility === 'public' || visibility === 'unlisted',
      ]);
    }
  });
});

describe('withdrawal addressing', () => {
  const me = 'https://social.example/users/me';
  const bob = 'https://social.example/users/bob';
  const actor = { id: me, followers: `${me}/followers` };
  const noFollowers = { id: me };
  const target = (visibility: Visibility, author = bob, mentions: string[] = []) => ({
    author,
    mentions,
    visibility,
  });
  it('addresses a withdrawal exactly like the reaction it takes back', () => {
    for (const visibility of ['public', 'unlisted', 'followers', 'direct', 'unknown'] as const)
      expect(withdrawalAddressing(target(visibility), actor)).toEqual(
        reactionAddressing(target(visibility), actor),
      );
  });
  it('addresses nobody instead of refusing when the scope cannot be built', () => {
    expect(withdrawalAddressing(target('followers'), noFollowers)).toEqual({ to: [], cc: [] });
    expect(withdrawalAddressing(target('unlisted'), noFollowers)).toEqual({ to: [], cc: [] });
    expect(withdrawalAddressing(target('public'), noFollowers)).toEqual({
      to: [PUBLIC],
      cc: [bob],
    });
  });
  it('lets anything but an addressing problem through', () => {
    const broken = target('direct', 'not a url');
    expect(() => withdrawalAddressing(broken, actor)).toThrow();
    expect(() => withdrawalAddressing(broken, actor)).not.toThrow(AddressingError);
  });
});

describe('reply participants', () => {
  const me = 'https://social.test/alice';
  it('addresses the author and everyone mentioned, never the replier', () => {
    expect(
      replyParticipants({ author: bob, mentions: [me, 'https://else.test/carol'] }, me),
    ).toEqual([bob, 'https://else.test/carol']);
    expect(replyParticipants({ author: me, mentions: [me] }, me)).toEqual([]);
    expect(replyParticipants({ author: bob, mentions: [bob] }, me)).toEqual([bob]);
  });
});

describe('addressing', () => {
  const actor = { id: 'https://social.test/alice', followers };
  const parent = { author: bob, mentions: [] };
  it('builds Mastodon-compatible to/cc for each visibility', () => {
    expect(buildAddressing('public', actor, parent)).toEqual({
      to: [PUBLIC],
      cc: [followers, bob],
    });
    expect(buildAddressing('unlisted', actor)).toEqual({ to: [followers], cc: [PUBLIC] });
    expect(buildAddressing('followers', actor, parent)).toEqual({ to: [followers], cc: [bob] });
    expect(buildAddressing('direct', actor, parent)).toEqual({ to: [bob], cc: [] });
  });
  it('sends a direct reply to the author and the other people in the conversation only', () => {
    const carol = 'https://else.test/carol';
    const group = { author: bob, mentions: [actor.id, carol] };
    expect(buildAddressing('direct', actor, group)).toEqual({ to: [bob, carol], cc: [] });
    expect(buildAddressing('direct', actor, group).to).not.toContain(followers);
    expect(buildAddressing('followers', actor, group).cc).toEqual([bob, carol]);
  });
  it('uses the full Public IRI and never addresses the author to themselves', () => {
    expect(buildAddressing('public', actor).to[0]).toBe(
      'https://www.w3.org/ns/activitystreams#Public',
    );
    expect(buildAddressing('public', actor, { author: actor.id, mentions: [] }).cc).toEqual([
      followers,
    ]);
  });
  it('refuses followers-based visibilities when the server has no followers collection', () => {
    const bare = { id: actor.id };
    expect(() => buildAddressing('followers', bare)).toThrow(/followers/);
    expect(() => buildAddressing('unlisted', bare)).toThrow(/followers/);
    expect(buildAddressing('public', bare).cc).toEqual([]);
    expect(buildAddressing('direct', bare, parent).to).toEqual([bob]);
  });
});

describe('attachments', () => {
  it('accepts a scalar or an array and maps types and media prefixes to kinds', () => {
    const image = {
      type: 'Image',
      url: 'https://cdn.test/a.png',
      mediaType: 'image/png',
      name: '고양이',
    };
    expect(normalizeAttachments(image)).toEqual([
      { kind: 'image', url: 'https://cdn.test/a.png', mediaType: 'image/png', alt: '고양이' },
    ]);
    expect(
      normalizeAttachments([
        { type: 'Document', mediaType: 'video/mp4', url: 'https://cdn.test/v.mp4' },
        { type: 'Document', mediaType: 'audio/ogg', url: 'https://cdn.test/a.ogg', name: ' ' },
        { type: 'Document', mediaType: 'application/pdf', url: 'https://cdn.test/d.pdf' },
        { type: 'Link', href: 'https://cdn.test/x.jpg', mediaType: 'image/jpeg' },
        { type: 'Video', url: [{ href: 'https://cdn.test/hq.mp4', mediaType: 'video/mp4' }] },
      ]).map((a) => [a.kind, a.url, a.alt]),
    ).toEqual([
      ['video', 'https://cdn.test/v.mp4', undefined],
      ['audio', 'https://cdn.test/a.ogg', undefined],
      ['document', 'https://cdn.test/d.pdf', undefined],
      ['image', 'https://cdn.test/x.jpg', undefined],
      ['video', 'https://cdn.test/hq.mp4', undefined],
    ]);
  });
  it('drops entries without a safe http(s) URL', () => {
    expect(
      normalizeAttachments([
        { type: 'Image', url: 'javascript:alert(1)' },
        { type: 'Image', url: 'data:image/png;base64,AAAA' },
        { type: 'Image', url: 'https://user:pw@cdn.test/a.png' },
        { type: 'Image', url: 'http://cdn.test/plain.png' },
        { type: 'Image' },
        'https://cdn.test/string-only.png',
        null,
      ]),
    ).toEqual([]);
    expect(normalizeAttachments({ type: 'Image', url: 'http://localhost:8443/dev.png' })).toEqual([
      { kind: 'image', url: 'http://localhost:8443/dev.png', mediaType: undefined, alt: undefined },
    ]);
  });
});

describe('draft ceilings', () => {
  it('bounds the note and its warning at what the composer enforces', () => {
    expect(NOTE_LIMITS).toEqual({ content: 5000, summary: 200 });
    expect(NOTE_LIMITS.summary).toBeLessThan(NOTE_LIMITS.content);
  });
});

describe('plain text as stored content', () => {
  it('escapes markup and quotes and turns line breaks into <br>', () => {
    expect(htmlFromPlain('a < b & "c" \'d\'\nnext\r\nlast')).toBe(
      'a &lt; b &amp; &quot;c&quot; &#39;d&#39;<br>next<br>last',
    );
  });
  it('leaves text without markup or breaks as it is', () => {
    expect(htmlFromPlain('안녕하세요. hello')).toBe('안녕하세요. hello');
    expect(htmlFromPlain('')).toBe('');
  });
});
