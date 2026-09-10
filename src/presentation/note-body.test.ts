import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TimelineNote } from '../domain/social';
import {
  attachmentAction,
  attachmentAlt,
  attachmentSummary,
  contentWarningLabel,
  hasContentWarning,
  effectiveReplyVisibility,
  replyWarning,
  shareScope,
  replyVisibility,
  visibilityInfo,
  visibilityOptions,
  visibilityText,
  visibilityWord,
} from './note-body';

const note = (extra: Partial<TimelineNote>): TimelineNote => ({
  id: 'n',
  author: 'a',
  content: '',
  visibility: 'public',
  attachments: [],
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
  ...extra,
});
describe('visibility copy', () => {
  it('maps every visibility to a label, description and icon name', () => {
    expect(visibilityInfo('public')).toMatchObject({ label: '공개', icon: 'globe' });
    expect(visibilityInfo('followers').icon).toBe('lock');
    expect(visibilityInfo('direct').icon).toBe('envelope');
    expect(visibilityInfo('unknown').icon).toBe('question');
    expect(visibilityText('followers')).toBe('팔로워만 공개');
    expect(visibilityText('unknown')).toBe('제한된 공개');
    expect(visibilityText('unlisted')).toBe('조용히 공개 · 미등록');
    expect(visibilityOptions.map((o) => o.value)).toEqual([
      'public',
      'unlisted',
      'followers',
      'direct',
    ]);
    expect(visibilityOptions[1].label).toBe('조용히 공개(미등록)');
  });
  it('gives every visibility a badge word short enough to sit beside the icon', () => {
    expect(visibilityWord('followers')).toBe('팔로워만');
    expect(visibilityWord('direct')).toBe('다이렉트');
    expect(visibilityWord('unlisted')).toBe('조용히');
    expect(visibilityWord('unknown')).toBe('제한됨');
    // Nothing longer than four syllables: the badge stays a badge on a phone card.
    for (const visibility of ['public', 'unlisted', 'followers', 'direct', 'unknown'] as const)
      expect(visibilityWord(visibility).length).toBeLessThanOrEqual(4);
  });
  it('starts replies at the parent visibility and disables wider options with a hint', () => {
    expect(replyVisibility()).toEqual({ initial: 'public', disabled: [], hint: '' });
    expect(replyVisibility(note({ visibility: 'public' })).disabled).toEqual([]);
    const followers = replyVisibility(note({ visibility: 'followers' }));
    expect(followers.initial).toBe('followers');
    expect(followers.disabled).toEqual(['public', 'unlisted']);
    expect(followers.hint).toContain('팔로워만');
    const direct = replyVisibility(note({ visibility: 'direct' }));
    expect(direct.initial).toBe('direct');
    expect(direct.disabled).toEqual(['public', 'unlisted', 'followers']);
    expect(direct.hint).toBe('원글이 다이렉트라서 답글도 다이렉트로만 보내요.');
    const pub = replyVisibility(note({ visibility: 'public' }));
    expect(pub).toEqual({ initial: 'public', disabled: [], hint: '' });
  });
  it('keeps a reply to a note of unclear audience direct only, like the session does', () => {
    const unknown = replyVisibility(note({ visibility: 'unknown' }));
    expect(unknown.initial).toBe('direct');
    expect(unknown.disabled).toEqual(['public', 'unlisted', 'followers']);
    expect(unknown.hint).toContain('다이렉트로');
    expect(unknown.hint).toContain('언급된 사람');
    // A stale persisted choice is narrowed by the same domain rule the session applies.
    expect(effectiveReplyVisibility('followers', note({ visibility: 'unknown' }))).toBe('direct');
    expect(effectiveReplyVisibility('public', note({ visibility: 'followers' }))).toBe('followers');
    expect(effectiveReplyVisibility('public')).toBe('public');
  });
});
describe('what a share will do, before it is tapped', () => {
  it('says nothing for a public note and names the audience for every other scope', () => {
    expect(shareScope('public')).toBe('');
    expect(shareScope('followers')).toBe('팔로워만 공개 글이라 팔로워에게만 공유돼요.');
    expect(shareScope('unlisted')).toContain('공개 타임라인');
    expect(shareScope('direct')).toContain('이 대화에 있는 사람');
    expect(shareScope('unknown')).toContain('작성자에게만');
  });
});

describe('a reply inherits its parent warning', () => {
  it('starts from the parent summary, trimmed, with nothing added in front', () => {
    expect(replyWarning(note({ summary: ' R8 경고 ' }))).toBe('R8 경고');
    expect(replyWarning(note({ summary: '스포일러' }))).not.toMatch(/^re:/i);
  });
  it('is empty for a parent without a warning and for a new note', () => {
    expect(replyWarning(note({}))).toBe('');
    expect(replyWarning(note({ summary: '   ' }))).toBe('');
    expect(replyWarning()).toBe('');
  });
});

describe('attachments and warnings', () => {
  const image = { kind: 'image' as const, url: 'https://cdn.test/a.png' };
  it('summarizes attachments by kind in a fixed order', () => {
    expect(attachmentSummary([])).toBe('');
    expect(
      attachmentSummary([
        { kind: 'document', url: 'https://cdn.test/d' },
        image,
        image,
        { kind: 'video', url: 'https://cdn.test/v' },
      ]),
    ).toBe('이미지 2개 · 동영상 1개 · 파일 1개');
  });
  it('labels alt text, actions and the warning line', () => {
    expect(attachmentAlt(image)).toBe('대체 텍스트 없음');
    expect(attachmentAlt({ ...image, alt: '고양이' })).toBe('고양이');
    expect(attachmentAction('image')).toBe('이미지 불러오기');
    expect(attachmentAction('audio')).toBe('오디오 열기');
    expect(contentWarningLabel(' 스포일러 ')).toBe('주의: 스포일러');
    expect(hasContentWarning(note({ summary: ' ' }))).toBe(false);
    expect(hasContentWarning(note({ summary: '주의' }))).toBe(true);
  });
});

/**
 * The rules in `note-body.ts` carry no Korean of their own: every word lives in
 * `copy-content.ts`, the way `copy-failures.ts` holds failure text. Comments are stripped
 * first and escaped characters spelled out, as the component scan in `copy.test.ts` does.
 */
describe('note-body.ts carries no Korean of its own', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'note-body.ts'), 'utf8');
  const spoken = source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, braced: string, plain: string) =>
      String.fromCodePoint(parseInt(braced ?? plain, 16)),
    );
  it('keeps every Hangul string in copy-content.ts', () => {
    const offenders = spoken
      .split('\n')
      .map((line, index) => ({ line: line.trim(), at: index + 1 }))
      .filter(({ line }) => /[가-힣ㄱ-ㆎ]/.test(line))
      .map(({ line, at }) => `note-body.ts:${at}: ${line}`);
    expect(offenders).toEqual([]);
  });
  it('imports its words from copy-content.ts', () => {
    expect(source).toContain("from './copy-content'");
  });
});
