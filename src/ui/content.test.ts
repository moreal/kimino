import { describe, expect, it } from 'vitest';
import { safeHttpUrl, actorLabel } from './content';
describe('display helpers', () => {
  it('rejects executable and credentialed links', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('https://user:secret@example.com')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,test')).toBeUndefined();
    expect(safeHttpUrl('https://example.com/notes/1')).toBe('https://example.com/notes/1');
  });
  it('labels root and named actors without breaking invalid input', () => {
    expect(actorLabel('https://example.com/')).toBe('example.com');
    expect(actorLabel('https://example.com/users/alice')).toBe('alice@example.com');
    expect(actorLabel('bad')).toBe('bad');
  });
});
