import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BREAKPOINTS, CONTAINER_STEPS } from './design-tokens';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(join(root, 'src/app.css'), 'utf8');

/** The stylesheet with every `:root { ... }` declaration block removed: the token block is
 *  where literal sizes are allowed to live, every other rule has to reach for a token. */
const outsideTokens = css.replace(/:root[^{]*\{[^}]*\}/g, '');

/** Declarations of one property, in source order, from the given stylesheet text. */
function declarations(text: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;}]+)`, 'g');
  return [...text.matchAll(pattern)].map(([, value]) => value.trim());
}

describe('the stylesheet only speaks in design tokens', () => {
  it('declares the whole scale once, at :root', () => {
    for (const token of [
      '--s-1: 4px',
      '--s-2: 8px',
      '--s-3: 12px',
      '--s-4: 16px',
      '--s-5: 24px',
      '--s-6: 32px',
      '--t-xs: 12px',
      '--t-sm: 13px',
      '--t-body: 14px',
      '--t-base: 15px',
      '--t-md: 16px',
      '--t-lg: 18px',
      '--t-xl: 28px',
      '--r-sm: 6px',
      '--r-md: 10px',
      '--r-pill: 999px',
    ])
      expect(css).toContain(token);
  });

  it('is seven type steps, each with exactly one leading', () => {
    const sizes = [...css.matchAll(/--t-([a-z]+):\s*(\d+)px/g)].map(([, name]) => name);
    expect(sizes).toEqual(['xs', 'sm', 'body', 'base', 'md', 'lg', 'xl']);
    for (const size of sizes) expect(css).toMatch(new RegExp(`--lh-${size}:\\s*[\\d.]+`));
  });

  it('uses only 400, 500 and 600 as font weights', () => {
    const weights = new Set(declarations(css, 'font-weight'));
    expect([...weights].sort()).toEqual(['400', '500', '600']);
  });

  it('sets no font size as a px literal outside the token block', () => {
    const literals = declarations(outsideTokens, 'font-size').filter((value) =>
      /\d+px/.test(value),
    );
    expect(literals).toEqual([]);
  });

  it('sets no border radius as a px literal outside the token block', () => {
    const literals = declarations(outsideTokens, 'border-radius').filter((value) =>
      /\d+px/.test(value),
    );
    expect(literals).toEqual([]);
  });

  it('pairs every type step with exactly one line height, and never leaves one alone', () => {
    // A size that reads at two different leadings is two sizes; the tokens rule that out.
    // A rule that sets only one of the two inherits the other and invents a new pair, so
    // both have to appear together: that is what keeps the rendered scale at seven pairs.
    const pairs = new Map<string, Set<string>>();
    const lonely: string[] = [];
    for (const [, body] of css.matchAll(/\{([^}]*)\}/g)) {
      const size = /font-size:\s*var\(--t-([a-z]+)\)/.exec(body);
      const leading = /line-height:\s*var\(--lh-([a-z]+)\)/.exec(body);
      if (!size && !leading) continue;
      if (!size || !leading) {
        lonely.push(body.trim().split('\n')[0]);
        continue;
      }
      const seen = pairs.get(size[1]) ?? new Set<string>();
      seen.add(leading[1]);
      pairs.set(size[1], seen);
    }
    expect(lonely).toEqual([]);
    for (const [size, leadings] of pairs) expect([size, [...leadings]]).toEqual([size, [size]]);
    // Seven steps in the tokens, so at most seven size/line-height pairs can be rendered.
    expect(pairs.size).toBeLessThanOrEqual(7);
  });

  it('sets no line height as a bare number outside the token block', () => {
    const literals = declarations(outsideTokens, 'line-height').filter(
      (value) => !value.startsWith('var('),
    );
    expect(literals).toEqual([]);
  });
});

/** sRGB relative luminance of a `#rrggbb` token, per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
/** The colour tokens of one theme: the first `:root` block, or the dark override. */
function palette(dark: boolean): Record<string, string> {
  const source = dark ? /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/ : null;
  const block = source ? source.exec(css)![1] : /:root\s*\{([^}]*)\}/.exec(css)![1];
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
}

describe('a reaction that is in effect is legible without its hue', () => {
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';
    it(`keeps the pressed reaction readable and outlined in ${theme}`, () => {
      const colors = palette(dark);
      // The word inside a pressed control against the tint it sits on: body-text contrast.
      expect(contrast(colors['--accent'], colors['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
      // Its outline against the surface an unpressed control sits on: non-text contrast.
      expect(contrast(colors['--accent'], colors['--surface'])).toBeGreaterThanOrEqual(3);
      // The visibility badge word against the badge's own background.
      expect(contrast(colors['--ink-muted'], colors['--surface-2'])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/** Every component and the copy module: the files that could smuggle a glyph in as an icon. */
function views(): string[] {
  const directory = join(root, 'src/components');
  return [
    ...readdirSync(directory)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => join(directory, name)),
    join(root, 'src/presentation/copy.ts'),
  ];
}

describe('icons are drawn, never typed', () => {
  const GLYPHS = ['↗', '↳', '♡', '↻', '◎', '⌕'];
  it('uses no Unicode glyph where the icon set has a shape', () => {
    const offenders = views().flatMap((file) => {
      const code = readFileSync(file, 'utf8');
      return GLYPHS.filter((glyph) => code.includes(glyph)).map(
        (glyph) => `${file.slice(root.length + 1)}: ${glyph}`,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('renders icons at one of the two token sizes', () => {
    expect(css).toContain('--icon: 20px');
    expect(css).toContain('--icon-sm: 16px');
    // The 16px variant thickens its stroke so both sizes read at the same weight.
    expect(/\.icon\s*\{[^}]*stroke-width:\s*1\.75/.test(css)).toBe(true);
    expect(/\.icon--sm\s*\{[^}]*stroke-width:\s*2/.test(css)).toBe(true);
  });

  it('draws visibility badges from the shared icon set', () => {
    const noteBody = readFileSync(join(root, 'src/components/NoteBody.tsx'), 'utf8');
    expect(noteBody).toContain("import Icon from './Icons'");
    expect(noteBody).not.toMatch(/<svg/);
  });
});

describe('the widths the stylesheet turns on are the named ones', () => {
  const named = new Set<number>([
    ...Object.values(BREAKPOINTS),
    // `max-width` phrases the wide breakpoint as one less.
    BREAKPOINTS.wide - 1,
    ...Object.values(CONTAINER_STEPS.card),
    ...Object.values(CONTAINER_STEPS.column),
  ]);
  it('writes every @media / @container px literal from BREAKPOINTS or CONTAINER_STEPS', () => {
    const preludes = [...css.matchAll(/@(?:media|container)([^{]*)\{/g)].map(([, text]) => text);
    const unnamed = preludes.flatMap((prelude) =>
      [...prelude.matchAll(/(\d+)px/g)].map(([, px]) => Number(px)).filter((px) => !named.has(px)),
    );
    expect(unnamed).toEqual([]);
    // And each card step is actually used, so a step cannot outlive its rules.
    for (const step of Object.values(CONTAINER_STEPS.card))
      expect(css).toContain(`@container card (max-width: ${step}px)`);
    expect(css).toContain(`@container column (max-width: ${CONTAINER_STEPS.column.picker}px)`);
  });
  it('declares :root once, at the top, and names the container steps in a comment', () => {
    expect(css.match(/^:root\s*\{/gm)).toHaveLength(1);
    for (const name of Object.keys(CONTAINER_STEPS.card)) expect(css).toContain(`card.${name}`);
  });
  it('keeps one modal scrim and one z-index ladder, all tokens', () => {
    const literals = declarations(outsideTokens, 'z-index').filter((v) => !v.startsWith('var('));
    expect(literals).toEqual([]);
    expect(declarations(outsideTokens, 'background').filter((v) => /rgba?\(/.test(v))).toEqual([]);
  });
});
