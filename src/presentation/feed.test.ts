import { describe, expect, it } from 'vitest';
import type { TimelineNote } from '../domain/social';
import {
  editDraftText,
  editableText,
  isMentionOnly,
  isReplyToMe,
  parentChain,
  parentOf,
  matchesAuthor,
  readableText,
  scopeNotes,
  indexById,
  selectNotes,
} from './feed';
const base = {
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
  visibility: 'public' as const,
  attachments: [],
};
const notes: TimelineNote[] = [
  { ...base, id: 'a', author: 'alice', content: 'Hello world' },
  { ...base, id: 'b', author: 'bob', content: 'A reply', inReplyTo: 'a' },
  { ...base, id: 'c', author: 'alice', content: 'Another', inReplyTo: 'b' },
  { ...base, id: 'd', author: 'carol', content: '<p>Tom &amp; Jerry &lt;3 &quot;quoted&quot;</p>' },
  { ...base, id: 'e', author: 'dave', content: 'hey', mentions: ['alice'] },
  { ...base, id: 'f', author: 'alice', content: 'self mention', mentions: ['alice'] },
];
it('searches readable text and author within selected feed', () => {
  expect(selectNotes(notes, 'saved', 'alice', 'reply', ['b']).map((n) => n.id)).toEqual(['b']);
  expect(selectNotes(notes, 'mine', 'alice', '', []).map((n) => n.id)).toEqual(['a', 'c', 'f']);
});
it('decodes HTML entities before matching search text', () => {
  expect(readableText('<p>Tom &amp; Jerry &lt;3 &#39;x&#39; &#8217;y</p>')).toBe(
    "Tom & Jerry <3 'x' ’y",
  );
  expect(selectNotes(notes, 'all', 'alice', 'tom & jerry', []).map((n) => n.id)).toEqual(['d']);
  expect(selectNotes(notes, 'all', 'alice', '<3', []).map((n) => n.id)).toEqual(['d']);
  expect(selectNotes(notes, 'all', 'alice', '"quoted"', []).map((n) => n.id)).toEqual(['d']);
  expect(selectNotes(notes, 'all', 'alice', '&amp;', [])).toEqual([]);
});
it('collects replies to my notes and mentions of me, excluding my own notes', () => {
  expect(selectNotes(notes, 'replies', 'alice', '', []).map((n) => n.id)).toEqual(['b', 'e']);
  expect(selectNotes(notes, 'replies', 'bob', '', []).map((n) => n.id)).toEqual(['c']);
  expect(isReplyToMe(notes, notes[1], '')).toBe(false);
  expect(selectNotes(notes, 'replies', 'alice', 'hey', []).map((n) => n.id)).toEqual(['e']);
});
it('counts the scope a search looked through in the same pass as the search', () => {
  const scoped = scopeNotes(notes, 'mine', 'alice', 'another', []);
  expect(scoped.notes.map((n) => n.id)).toEqual(['c']);
  expect(scoped.scope).toBe(3);
  const unsearched = scopeNotes(notes, 'replies', 'alice', '', []);
  expect(unsearched.notes.map((n) => n.id)).toEqual(['b', 'e']);
  expect(unsearched.scope).toBe(2);
  const byAuthor = scopeNotes(notes, 'all', 'alice', 'zzz', [], 'alice');
  expect(byAuthor).toEqual({ notes: [], scope: 3 });
  // The scope of a search is exactly what the same view lists with no search.
  expect(scopeNotes(notes, 'mine', 'alice', 'hello', []).scope).toBe(
    selectNotes(notes, 'mine', 'alice', '', []).length,
  );
});
it('indexes notes by id, the first one winning when an id repeats', () => {
  const byId = indexById([...notes, { ...notes[0], content: 'copy' }]);
  expect(byId.size).toBe(notes.length);
  expect(byId.get('a')?.content).toBe('Hello world');
  expect(byId.get('missing')).toBeUndefined();
});
it('finds the loaded parent and nothing for roots or unloaded parents', () => {
  expect(parentOf(notes, notes[1])?.id).toBe('a');
  expect(parentOf(notes, notes[0])).toBeUndefined();
  expect(parentOf(notes, { ...notes[1], inReplyTo: 'missing' })).toBeUndefined();
});
it('marks notes that reach me only through a mention', () => {
  const me = 'https://social.example/users/me';
  const other = 'https://social.example/users/other';
  const base = {
    content: '',
    published: '',
    visibility: 'public' as const,
    attachments: [],
    mentions: [],
    reactions: [],
    likedBy: [],
    announcedBy: [],
  };
  const mine = { ...base, id: 'n1', author: me } as TimelineNote;
  const theirs = { ...base, id: 'n2', author: other } as TimelineNote;
  const note = (over: object) => ({ ...base, id: 'n3', author: other, ...over }) as TimelineNote;
  const notes = [mine, theirs];
  expect(isMentionOnly(notes, note({ mentions: [me] }), me)).toBe(true);
  expect(isMentionOnly(notes, note({ mentions: [me], inReplyTo: 'n2' }), me)).toBe(true);
  expect(isMentionOnly(notes, note({ mentions: [me], inReplyTo: 'n1' }), me)).toBe(false);
  expect(isMentionOnly(notes, note({ mentions: [] }), me)).toBe(false);
  expect(isMentionOnly(notes, note({ mentions: [me], author: me }), me)).toBe(false);
});
it('returns oldest parent first and terminates cycles', () => {
  expect(parentChain(notes, notes[2]).map((n) => n.id)).toEqual(['a', 'b']);
  expect(parentChain([{ ...notes[0], inReplyTo: 'b' }, notes[1]], notes[1])).toHaveLength(1);
});

it('reopens stored note HTML as the plain text the composer wrote', () => {
  expect(editableText('<p>첫 줄<br>둘째 줄</p><p>새 문단</p>')).toBe('첫 줄\n둘째 줄\n\n새 문단');
  // Escaped characters come back as themselves; the gateway escapes them again on the way out.
  expect(editableText('Tom &amp; Jerry &lt;3 &quot;quoted&quot;')).toBe('Tom & Jerry <3 "quoted"');
  // Anything the composer cannot express is flattened to its words, never left as markup.
  expect(editableText('<p>see <a href="https://x.test">this</a> <b>now</b></p>')).toBe(
    'see this now',
  );
  expect(editableText('<br><br>  <p>trimmed</p><br>')).toBe('trimmed');
  expect(editableText('')).toBe('');
});

it('reopens an edit with the stored note unless real unsent words are being kept', () => {
  const stored = '<p>서버가 가진 글</p>';
  // Nothing kept, and the empty string a composer writes back after a saved edit: both
  // mean there is no draft, so the form comes back with what the server stores.
  expect(editDraftText(undefined, stored)).toBe('서버가 가진 글');
  expect(editDraftText('', stored)).toBe('서버가 가진 글');
  expect(editDraftText('   \n  ', stored)).toBe('서버가 가진 글');
  // An edit left unsent keeps its own words, including their whitespace.
  expect(editDraftText('고치던 중  ', stored)).toBe('고치던 중  ');
});

describe('searching by who wrote a note', () => {
  const host = 'https://social.example';
  const oni = `${host}/users/Oni`;
  const root = 'https://localhost:8443/';
  const people: TimelineNote[] = [
    { ...base, id: 'p1', author: oni, content: 'from oni' },
    { ...base, id: 'p2', author: `${host}/users/bob`, content: 'from bob' },
    { ...base, id: 'p3', author: root, content: 'from the one-person server' },
    { ...base, id: 'p4', author: `${host}/users/carol`, content: 'talks about localhost' },
  ];
  const ids = (query: string, self?: Parameters<typeof selectNotes>[6]) =>
    selectNotes(people, 'all', oni, query, [], undefined, self).map((n) => n.id);

  it('matches the name on screen and the @user@host handle, case-insensitively', () => {
    expect(ids('Oni')).toEqual(['p1']);
    expect(ids('oni')).toEqual(['p1']);
    expect(ids('@Oni')).toEqual(['p1']);
    expect(ids('@oni@social.example')).toEqual(['p1']);
    expect(ids('oni@social')).toEqual(['p1']);
  });

  it('never matches every author of one server by its host alone', () => {
    // The host is in every handle, so it matches no one by it. The one author the screen
    // names by its host (an actor at the server root) matches, like the note that says it.
    expect(ids('localhost')).toEqual(['p3', 'p4']);
    expect(ids('localhost:8443')).toEqual(['p3']);
    expect(ids('social.example')).toEqual([]);
    expect(ids('https://')).toEqual([]);
  });

  it('matches the connected account by its display name and username', () => {
    const self = { id: oni, name: '오니', preferredUsername: 'oni' };
    expect(ids('오니', self)).toEqual(['p1']);
    expect(ids('@oni@social.example', self)).toEqual(['p1']);
    expect(matchesAuthor(oni, '오니', self)).toBe(true);
    expect(matchesAuthor(`${host}/users/bob`, '오니', self)).toBe(false);
  });

  it('matchesAuthor: a query with an @ searches the handle, a bare host names nobody', () => {
    const bob = `${host}/users/bob`;
    // "@user" and "user@host" are addresses; they find bob by his handle and only him.
    expect(matchesAuthor(bob, '@bob', undefined)).toBe(true);
    expect(matchesAuthor(bob, 'bob@social.example', undefined)).toBe(true);
    expect(matchesAuthor(bob, '@social.example', undefined)).toBe(true);
    expect(matchesAuthor(`${host}/users/alice`, '@bob', undefined)).toBe(false);
    // The bare host is in every handle on the server, so without an @ it matches no one.
    expect(matchesAuthor(bob, 'social.example', undefined)).toBe(false);
    expect(matchesAuthor(bob, 'social', undefined)).toBe(false);
    // The display name is searched as shown, without needing an @.
    expect(matchesAuthor(bob, 'bob', undefined)).toBe(true);
  });

  it('still searches the words of a note', () => {
    expect(ids('one-person')).toEqual(['p3']);
  });
});
