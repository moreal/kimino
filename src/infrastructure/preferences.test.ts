import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMuted, writeMuted } from './preferences';

afterEach(() => vi.unstubAllGlobals());
describe('hidden author browser preferences', () => {
  it('stores only IDs under distinct account keys and rejects malformed records', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key),
      setItem: (key: string, value: string) => store.set(key, value),
    });
    expect(writeMuted('https://one.example/me', ['https://author.example/a'])).toBe(true);
    expect(readMuted('https://one.example/me')).toEqual(['https://author.example/a']);
    expect(readMuted('https://two.example/me')).toEqual([]);
    expect([...store.keys()]).toEqual(['kimino.muted.https://one.example/me']);
    store.set('kimino.muted.bad', '{');
    expect(readMuted('bad')).toEqual([]);
    store.set('kimino.muted.bad', '[null,7,"https://a.example/"]');
    expect(readMuted('bad')).toEqual(['https://a.example/']);
  });
  it('reports storage refusal and reads unavailable storage as empty', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readMuted('me')).toEqual([]);
    expect(writeMuted('me', [])).toBe(false);
  });
});
