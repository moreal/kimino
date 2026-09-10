import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { shortcutRows } from './keyboard';
import {
  copy,
  feedFoot,
  hiddenActivities,
  lastChecked,
  reachLine,
  refusedActivities,
  syncSummary,
  unsupportedActivities,
} from './copy';

const now = Date.parse('2026-09-09T00:10:00Z');
/** What may follow a sentence ending: space, punctuation, a closing quote, or nothing. */
const AFTER_ENDING = `(?=[\\s.!?,'"\`)]|$)`;
/**
 * Every syllable whose final consonant is ㅂ: what -ㅂ니까 / -습니까 stands on. The 해요체
 * connective -(으)니까 ("하니까", "있으니까") never follows one, so this keeps it apart.
 */
const BIEUP_FINAL = Array.from({ length: 399 }, (_, k) =>
  String.fromCharCode(0xac11 + 28 * k),
).join('');
/**
 * A 합쇼체 sentence ending: -니다 at the end of a word, -ㅂ니까 / -습니까 at the end of a
 * question, -십시오. The word boundary after each keeps "니다니", "니까지" and names that
 * merely contain the syllables out, and plain "아니다" is not a formal ending.
 */
export const FORMAL_ENDING = new RegExp(
  `[가-힣](?<!아)니다${AFTER_ENDING}|[${BIEUP_FINAL}]니까${AFTER_ENDING}|십시오${AFTER_ENDING}`,
);
describe('what the timeline says about its own load', () => {
  it('reports when it last read the server, or that it has not', () => {
    expect(lastChecked('2026-09-09T00:05:00Z', now)).toBe('마지막 확인 5분 전');
    expect(lastChecked(undefined, now)).toBe('아직 확인 전');
    // A read after a write is incremental, and the line does not call it a full check.
    expect(lastChecked('2026-09-09T00:05:00Z', now, true)).toBe('마지막 부분 확인 5분 전');
    expect(lastChecked(undefined, now, true)).toBe('아직 확인 전');
    expect(syncSummary('2026-09-09T00:05:00Z', 2, now, true)).toBe(
      '마지막 부분 확인 5분 전 · 미지원 활동 2개',
    );
  });
  it('admits dropped activities in words, and stays quiet when none were dropped', () => {
    expect(unsupportedActivities(0)).toBe('');
    expect(unsupportedActivities()).toBe('');
    expect(unsupportedActivities(3)).toBe('미지원 활동 3개는 표시하지 못했어요');
  });
  it('counts refused activities apart from unsupported ones, and stays quiet at zero', () => {
    expect(refusedActivities(0)).toBe('');
    expect(refusedActivities()).toBe('');
    const one = refusedActivities(1);
    // Refused for safety, and said as such: not a gap in what this client supports.
    expect(one).toContain('안전을 위해 거절한 활동 1개');
    expect(one).toContain('미지원이 아니라');
    expect(one).not.toBe(unsupportedActivities(1));
    expect(refusedActivities(4)).toContain('거절한 활동 4개');
  });
  it('counts everything withheld as one quiet number, silent at zero', () => {
    expect(hiddenActivities(0, 0)).toBe('');
    expect(hiddenActivities()).toBe('');
    expect(hiddenActivities(8, 7)).toBe('표시하지 않은 활동 15개');
    expect(hiddenActivities(2)).toBe('표시하지 않은 활동 2개');
    expect(feedFoot.details).toBe('자세히');
  });
  it('keeps the tooltip summary built from the same two parts', () => {
    expect(syncSummary('2026-09-09T00:05:00Z', 2, now)).toBe(
      '마지막 확인 5분 전 · 미지원 활동 2개',
    );
  });
});

describe('the foot of a long list', () => {
  it('says how much of the loaded list is on screen and how much is left', () => {
    expect(feedFoot.shown(50, 122)).toBe('불러온 글 122개 중 50개 표시');
    expect(feedFoot.remaining(72)).toBe('남은 글 72개');
    expect(feedFoot.more).toBe('더 보기');
    expect(feedFoot.toTop).toBe('맨 위로');
  });
});

describe('the foot under a search and under the saved list', () => {
  it('counts what matched or what is saved against what is loaded', () => {
    expect(feedFoot.searched(7, 505)).toBe('검색 결과 7개 · 불러온 글 505개');
    expect(feedFoot.savedShown(1, 505)).toBe('저장한 글 1개 · 불러온 글 505개');
    expect(feedFoot.onScreen(50)).toBe('50개 표시');
  });
});

describe('one voice', () => {
  const root = resolve(import.meta.dirname, '../..');
  const files = ['src/presentation/copy.ts', 'src/presentation/copy-failures.ts'];
  it('speaks 해요체 everywhere: no 합쇼체 ending (-니다, -니까, -십시오) in either copy file', () => {
    const offenders = files.flatMap((file) =>
      spokenSource(readFileSync(join(root, file), 'utf8'))
        .split('\n')
        .map((line, index) => ({ line: line.trim(), at: index + 1 }))
        .filter(({ line }) => FORMAL_ENDING.test(line))
        .map(({ line, at }) => `${file}:${at}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });
  it('catches every 합쇼체 ending, not only 습니다 / 됩니다 / 입니다', () => {
    for (const line of [
      '확인했습니다.',
      '처리됩니다',
      '글입니다!',
      "'삭제합니다'",
      '돌아갑니다.',
      '다시 봅니다,',
      '지울까요? 삭제합니까?',
      '삭제합니까',
      "'삭제합니까'",
      '삭제합니까, 아니면',
      '언제 갑니까',
      '무엇입니까?',
      '확인하십시오',
    ])
      expect(line, line).toMatch(FORMAL_ENDING);
    // 해요체, and words that only contain the syllables, stay clear of it.
    for (const line of [
      '지웠어요.',
      '아니다',
      '어디니?',
      '니다니',
      '하니까 좋아요',
      '니까지',
      '있으니까',
      '가니까.',
      '십시오라는 말',
      '안 되니 다시 해요',
    ])
      expect(line, line).not.toMatch(FORMAL_ENDING);
  });
  it('lists j before k, and says "next" first to match', () => {
    const row = shortcutRows.find((item) => item.action === 'next')!;
    expect(row.keys).toEqual(['j', 'k']);
    expect(copy.shortcuts.actions.next.startsWith('다음')).toBe(true);
  });
  it('has one tagline: the right column foot repeats the sidebar caption, in Korean', () => {
    expect(copy.siteFooter).toContain(copy.sidebar.caption);
    expect(copy.siteFooter).not.toMatch(/[A-Z]{2,}/);
  });
  it('names the key in the edit composer by what the button does', () => {
    expect(copy.composer.submitKeyEdit).toMatch(/Enter로 수정$/);
    expect(copy.composer.submitKeyEdit).not.toContain('게시');
  });
});

describe('how far the read got through the server collections', () => {
  it('reports what was read, and only claims a shortfall the server declared', () => {
    expect(reachLine(undefined)).toBe('');
    expect(reachLine({ fetched: 362, missing: 0 })).toBe('서버에서 읽은 활동 362개');
    const short = reachLine({ fetched: 199, missing: 100 });
    expect(short).toContain('서버에서 읽은 활동 199개');
    expect(short).toContain('서버에 100개가 더 있지만 아직 불러오지 못했어요');
    expect(short).toContain('이전(오래된) 글 일부는 지금 이 화면에서 볼 수 없어요');
    // Nothing here offers to fetch the rest: there is no further page to ask for.
    expect(short).not.toContain('더 보기');
  });
});

/**
 * A view's source with its comments removed - block comments, whole-line `//` comments and a
 * trailing `// ...` after code (a `//` inside a string, as in `https://`, has no space before
 * it and stays) - and with every escaped Hangul character spelled out, so `\uAC00` in a
 * literal and `&#44032;` in markup are caught the same as the character itself.
 */
export const spokenSource = (code: string) =>
  code
    // A block comment leaves its line breaks behind, so line numbers after it stay right.
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, braced: string, plain: string) =>
      String.fromCodePoint(parseInt(braced ?? plain, 16)),
    )
    .replace(/&#x([0-9a-fA-F]+);|&#(\d+);/g, (_, hex: string, dec: string) =>
      String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)),
    );

/** Every line of a view that still carries Hangul once its comments are gone. */
export const hangulLines = (code: string) =>
  spokenSource(code)
    .split('\n')
    .map((line, index) => ({ line: line.trim(), at: index + 1 }))
    .filter(({ line }) => /[가-힣ㄱ-ㆎ]/.test(line));

/**
 * Every word a reader sees lives here, in one file, so a term is spelled one way everywhere
 * and can be reviewed in one place. A view may carry markup, names and IRIs, never Korean.
 */
describe('the views carry no Korean of their own', () => {
  const root = resolve(import.meta.dirname, '../..');
  const views = [
    ...readdirSync(join(root, 'src/components'))
      .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
      .map((name) => join('src/components', name)),
    'src/app.tsx',
  ];
  it('scans every component file, helpers included', () => {
    expect(views).toContain('src/components/shortcuts.ts');
  });
  it('sees through escapes and entities, and past comments', () => {
    const fixture = [
      "const a = '\\uD55C';", // 한, escaped
      "const b = '\\u{D55C}';",
      "const c = '&#54620;';", // 한, decimal entity
      "const d = '&#xD55C;';", // 한, hex entity
      'const e = "plain 글";',
      "const f = 'https://a.example/한'; // 한글 note",
      '// 한글 whole-line comment',
      'const g = 1; // 한글 trailing comment',
      '/* 한글 block\n comment */ const h = 2;',
      "const i = 'https://a.example/path';",
      'const j = `\\uAC00`;',
    ].join('\n');
    // Line 11 is the twelfth source line: the block comment above it spans two.
    expect(hangulLines(fixture).map(({ at }) => at)).toEqual([1, 2, 3, 4, 5, 6, 12]);
    // The trailing comment went, the URL before it stayed.
    expect(hangulLines(fixture)[5].line).toBe("const f = 'https://a.example/한';");
  });
  it('keeps every Hangul string in copy.ts, with no allowlist', () => {
    const offenders = views.flatMap((file) =>
      hangulLines(readFileSync(join(root, file), 'utf8')).map(
        ({ line, at }) => `${file}:${at}: ${line}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
