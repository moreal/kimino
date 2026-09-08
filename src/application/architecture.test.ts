import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(directory, entry.name))
      : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
        ? [join(directory, entry.name)]
        : [],
  );
}
it('domain and application do not import framework, browser adapters, or transport', () => {
  for (const layer of ['domain', 'application'])
    for (const file of sources(`src/${layer}`)) {
      const code = readFileSync(file, 'utf8');
      for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const dependency = match[1];
        expect(dependency.startsWith('.'), `${file}: external ${dependency}`).toBe(true);
        const target = resolve(file, '..', dependency);
        expect(
          target.startsWith(resolve('src/domain')) ||
            (layer === 'application' && target.startsWith(resolve('src/application'))),
          `${file}: outward ${dependency}`,
        ).toBe(true);
      }
      expect(code, file).not.toMatch(
        /\b(?:window|document|localStorage|sessionStorage|fetch)\s*[.(]/,
      );
    }
});
it('views receive adapters through composition instead of importing them', () => {
  for (const file of [
    'src/app.tsx',
    ...readdirSync('src/components').map((name) => `src/components/${name}`),
  ]) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(
      /from\s+['"][^'"]*(?:activitypub|infrastructure|bootstrap)[^'"]*['"]/,
    );
  }
});
it('presentation stays free of adapters and DOM globals', () => {
  for (const file of sources('src/presentation')) {
    const code = readFileSync(file, 'utf8');
    expect(code, file).not.toMatch(
      /from\s+['"][^'"]*\/(?:activitypub|infrastructure|bootstrap|components|app)(?:\/[^'"]*)?['"]/,
    );
    expect(code, file).not.toMatch(
      /\b(?:window|document|localStorage|sessionStorage|fetch)\s*[.(]/,
    );
  }
});
