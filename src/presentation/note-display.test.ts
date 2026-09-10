import { describe, expect, it } from 'vitest';
import {
  actorProfile,
  authorHue,
  excerpt,
  isEdited,
  reactedBy,
  replyCueText,
  warnedRevealed,
  withCount,
} from './note-display';

it('derives a stable palette index in 0..5 from the author IRI', () => {
  const hue = authorHue('https://social.example/users/alice');
  expect(hue).toBe(authorHue('https://social.example/users/alice'));
  expect(hue).toBeGreaterThanOrEqual(0);
  expect(hue).toBeLessThan(6);
  expect(authorHue('')).toBe(0);
});

it('appends a count only when it is positive', () => {
  expect(withCount('좋아요', 0)).toBe('좋아요');
  expect(withCount('좋아요', 3)).toBe('좋아요 3');
});

it('tells whether an actor reacted and whether a note was edited after publishing', () => {
  const me = 'https://social.example/users/me';
  const note = { likedBy: [me], announcedBy: [] } as never;
  expect(reactedBy(note, 'like', me)).toBe(true);
  expect(reactedBy(note, 'share', me)).toBe(false);
  expect(reactedBy(note, 'like', undefined)).toBe(false);
  expect(isEdited({ published: '2026-09-01T00:00:00Z', updated: '2026-09-02T00:00:00Z' })).toBe(
    true,
  );
  expect(isEdited({ published: '2026-09-01T00:00:00Z', updated: '2026-09-01T00:00:00Z' })).toBe(
    false,
  );
  expect(isEdited({ published: '2026-09-01T00:00:00Z' })).toBe(false);
  expect(isEdited({ updated: '2026-09-01T00:00:00Z' })).toBe(false);
});

it('describes an author from loaded data only: name, address, host, loaded count, safe link', () => {
  const me = 'https://social.example/users/me';
  const bob = 'https://social.example/users/bob';
  const notes = [{ author: bob }, { author: me }, { author: bob }] as never[];
  expect(actorProfile(notes, bob)).toEqual({
    id: bob,
    name: 'bob',
    handle: '@bob@social.example',
    host: 'social.example',
    loaded: 2,
    url: bob,
  });
  // The connected account is the one person whose display name is known: it heads the
  // sheet, and the address under it is the same `@user@host` the cards show.
  const self = { id: me, inbox: '', outbox: '', name: '나', preferredUsername: 'me' };
  expect(actorProfile(notes, me, self)).toMatchObject({
    name: '나',
    handle: '@me@social.example',
    loaded: 1,
  });
  expect(actorProfile(notes, bob, self).name).toBe('bob');
  // A one-person server whose actor lives at the root: named by its username, not its host.
  const root = 'https://oni.example/';
  expect(
    actorProfile([], root, { id: root, inbox: '', outbox: '', preferredUsername: 'Oni' }),
  ).toMatchObject({ name: 'Oni', handle: '@Oni@oni.example', host: 'oni.example' });
  expect(actorProfile([], 'not a url')).toMatchObject({
    name: 'not a url',
    handle: undefined,
    host: '',
    url: undefined,
  });
});

it('shows a warned body when the always-open preference and the per-note toggle disagree', () => {
  // Off: the toggle opens. On: every warned note opens and the same toggle closes this one.
  expect(warnedRevealed(false, false)).toBe(false);
  expect(warnedRevealed(false, true)).toBe(true);
  expect(warnedRevealed(true, false)).toBe(true);
  expect(warnedRevealed(true, true)).toBe(false);
});

describe('the cue on a reply whose parent is loaded', () => {
  const alice = 'https://social.example/users/alice';
  const bob = 'https://social.example/users/bob';
  it('quotes the parent by author and first words, cut at forty characters', () => {
    const parent = { author: alice, content: '<p>오늘 읽은 <b>책</b> 이야기</p>' };
    expect(replyCueText({ author: bob }, parent)).toBe('alice: 오늘 읽은 책 이야기 · 원글 보기');
    const long = { author: alice, content: `<p>${'가'.repeat(60)}</p>` };
    expect(replyCueText({ author: bob }, long)).toBe(`alice: ${'가'.repeat(40)}… · 원글 보기`);
  });
  it('lends a warned parent its warning, never the body it hides', () => {
    const parent = { author: alice, content: '<p>hidden body</p>', summary: '스포일러' };
    const cue = replyCueText({ author: bob }, parent);
    expect(cue).toBe('alice: 스포일러 · 원글 보기');
    expect(cue).not.toContain('hidden');
  });
  it('reads the parent warning as text, not as raw markup', () => {
    const parent = { author: alice, content: '<p>hidden</p>', summary: 'R&amp;D <b>노트</b>' };
    expect(replyCueText({ author: bob }, parent)).toBe('alice: R&D 노트 · 원글 보기');
    const blank = { author: alice, content: '<p>본문</p>', summary: '<p> </p>' };
    expect(replyCueText({ author: bob }, blank)).toBe('alice: 본문 · 원글 보기');
  });
  it('calls a reply to my own note a continuation', () => {
    expect(replyCueText({ author: alice }, { author: alice, content: '<p>x</p>' })).toBe(
      '이어서 · 원글 보기',
    );
  });
  it('names the parent author the way the cards do', () => {
    const self = { id: alice, name: '앨리스', preferredUsername: 'alice' };
    expect(replyCueText({ author: bob }, { author: alice, content: 'hi' }, self)).toBe(
      '앨리스: hi · 원글 보기',
    );
  });
  it('cuts an excerpt by characters, not code units, and trims the cut end', () => {
    expect(excerpt('  short  ')).toBe('short');
    expect(excerpt('😀'.repeat(41))).toBe(`${'😀'.repeat(40)}…`);
    expect(excerpt('a'.repeat(39) + ' b', 40)).toBe(`${'a'.repeat(39)}…`);
  });
});
