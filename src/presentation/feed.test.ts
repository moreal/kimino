import { expect, it } from 'vitest';
import type { TimelineNote } from '../domain/social';
import { isReplyToMe, parentChain, readableText, selectNotes } from './feed';
const base = { announcedBy: [], likedBy: [], reactions: [], mentions: [] };
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
it('returns oldest parent first and terminates cycles', () => {
  expect(parentChain(notes, notes[2]).map((n) => n.id)).toEqual(['a', 'b']);
  expect(parentChain([{ ...notes[0], inReplyTo: 'b' }, notes[1]], notes[1])).toHaveLength(1);
});
