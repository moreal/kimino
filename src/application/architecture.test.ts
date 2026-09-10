import { expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Every non-test .ts/.tsx file under `directory`, recursively; a directory with none fails.
 * `*.test-support.ts` modules are test doubles shared between test files, not sources.
 */
function sources(directory: string): string[] {
  const files = readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name) && !/\.test(?:-support)?\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
  expect(files.length, `${directory}: nothing to scan`).toBeGreaterThan(0);
  return files;
}
/** Static `from '...'`, side-effect `import '...'` and dynamic `import('...')` specifiers. */
function imports(code: string): string[] {
  return [...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}
/**
 * Specifiers that bring runtime values in, through `import ... from` or `export ... from`:
 * `type` declarations and specifier lists where every name is `type`-qualified are erased
 * by the compiler. A default or namespace binding is always a value.
 */
function runtimeImports(code: string): string[] {
  const statements = code.matchAll(
    /\b(?:import|export)\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\}|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+['"]([^'"]+)['"]/g,
  );
  return [...statements]
    .filter(([, erased, clause]) => {
      if (erased) return false;
      const braces = clause.match(/^\{([\s\S]*)\}$/);
      if (!braces) return true;
      return braces[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .some((name) => !/^type\s/.test(name));
    })
    .map(([, , , specifier]) => specifier);
}
const layerPattern = (layers: string[]) => new RegExp(`(?:^|/)(?:${layers.join('|')})(?:/|$|\\.)`);
/**
 * The module path of `dependency` relative to `src/`, or nothing for a package import.
 * Root-absolute `/src/...` specifiers resolve like relative ones.
 */
function target(file: string, dependency: string): string | undefined {
  if (dependency.startsWith('/src/')) return dependency.slice('/src/'.length);
  if (!dependency.startsWith('.')) return undefined;
  return resolve(file, '..', dependency).replace(resolve('src') + '/', '');
}
/** Fails when `file` imports any module path inside one of `layers`, except `allow`ed paths. */
function forbid(file: string, layers: string[], allow: RegExp[] = [], only = imports) {
  const code = readFileSync(file, 'utf8');
  for (const dependency of only(code)) {
    const path = target(file, dependency);
    if (!path || allow.some((pattern) => pattern.test(path))) continue;
    expect(layerPattern(layers).test(path), `${file}: imports ${dependency}`).toBe(false);
  }
  return code;
}
/**
 * Browser globals that only adapters and the Solid bridge may touch, whether reached plainly,
 * optionally chained (`document?.`) or through a frame (`self.`, `top.`, `parent.`).
 */
const domGlobals =
  /\b(?:window|document|localStorage|sessionStorage|fetch|navigator|globalThis)\s*(?:\?\.|[.(])|\bmatchMedia\s*\(|(?<![.\w])(?:self|top|parent)\s*\??\.\s*(?:location|document|window|opener|frames|postMessage|origin|history|navigator|localStorage|sessionStorage|fetch)\b/;
/**
 * The wall clock. Domain and application take time in through their arguments (`now`), so
 * the only places that read it are the composition root and the adapters.
 */
const clockGlobals = /\bDate\.now\s*\(|\bnew\s+Date\b/;
/** Storage in particular is never read from a view: it comes in through the ports. */
const storageGlobals = /\b(?:localStorage|sessionStorage)\s*[.(]/;
const bridge = (file: string) => file.startsWith(join('src', 'presentation', 'solid') + '/');

it('domain and application do not import framework, browser adapters, or transport', () => {
  for (const layer of ['domain', 'application'])
    for (const file of sources(`src/${layer}`)) {
      const code = readFileSync(file, 'utf8');
      for (const dependency of imports(code)) {
        expect(dependency.startsWith('.'), `${file}: external ${dependency}`).toBe(true);
        const path = resolve(file, '..', dependency);
        expect(
          path.startsWith(resolve('src/domain')) ||
            (layer === 'application' && path.startsWith(resolve('src/application'))),
          `${file}: outward ${dependency}`,
        ).toBe(true);
      }
      expect(code, file).not.toMatch(domGlobals);
      expect(code, file).not.toMatch(clockGlobals);
    }
});

/** Every view module: the app, its components, and route modules should any appear. */
const views = () => [
  'src/app.tsx',
  ...sources('src/components'),
  ...(existsSync('src/routes') && readdirSync('src/routes').length ? sources('src/routes') : []),
];

it('views receive adapters through composition instead of importing them', () => {
  // The sanitizer is the one infrastructure module views may reach directly: it has no
  // state to inject and every remote HTML path must visibly go through it.
  const sanitizer = [/^infrastructure\/sanitize$/];
  for (const file of views()) {
    const code = forbid(
      file,
      ['activitypub', 'infrastructure', 'bootstrap', 'entry-client'],
      sanitizer,
    );
    expect(code, file).not.toMatch(storageGlobals);
  }
});

it('views use domain and application only as types; behaviour comes through the view model', () => {
  for (const file of views()) forbid(file, ['domain', 'application'], [], runtimeImports);
});

it('presentation stays free of adapters, DOM globals, and Solid outside presentation/solid', () => {
  for (const file of sources('src/presentation')) {
    const code = forbid(file, [
      'activitypub',
      'infrastructure',
      'bootstrap',
      'components',
      'app',
      'entry-client',
    ]);
    if (!bridge(file)) expect(code, file).not.toMatch(domGlobals);
    if (!file.startsWith(join('src', 'presentation', 'solid') + '/'))
      for (const dependency of imports(code))
        expect(/^(?:solid-js|@solidjs)(?:\/|$)/.test(dependency), `${file}: ${dependency}`).toBe(
          false,
        );
  }
});

it('adapters never depend on views, presentation, or the composition root', () => {
  // Adapters may use presentation types, and the one value they may take is the port
  // contract itself (`presentation/ports`), which depends on nothing.
  const ports = [/^presentation\/ports$/];
  for (const dependency of imports(readFileSync('src/presentation/ports.ts', 'utf8')))
    expect(dependency, 'ports: must stay dependency-free').toBe('');
  for (const file of [...sources('src/infrastructure'), ...sources('src/activitypub')])
    forbid(
      file,
      ['presentation', 'components', 'app', 'bootstrap', 'entry-client'],
      ports,
      runtimeImports,
    );
});

it('the composition root wires adapters to ports without rendering anything', () => {
  // bootstrap.ts may import any layer below the views; it never reaches the views themselves.
  // It is where the clock is read and handed to the session.
  const code = forbid('src/bootstrap.ts', ['components', 'app', 'entry-client']);
  expect(code).toMatch(/now:/);
  for (const dependency of imports(code))
    expect(/^(?:solid-js|@solidjs)(?:\/|$)/.test(dependency), `bootstrap: ${dependency}`).toBe(
      false,
    );
  expect(code).not.toMatch(domGlobals);
});

it('logging is configured once, from a module that imports nothing of the app', () => {
  const code = readFileSync('src/logging.ts', 'utf8');
  for (const dependency of imports(code))
    expect(dependency.startsWith('.'), `logging: app import ${dependency}`).toBe(false);
  expect(code).toMatch(/configureSync\(/);
});

it('the entry point only wires the composition root into the app', () => {
  forbid('src/entry-client.tsx', [
    'activitypub',
    'infrastructure',
    'presentation',
    'components',
    'domain',
    'application',
  ]);
});
