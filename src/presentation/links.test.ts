import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './links';
describe('display helpers', () => {
  it('rejects executable and credentialed links', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('https://user:secret@example.com')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,test')).toBeUndefined();
    expect(safeHttpUrl('https://example.com/notes/1')).toBe('https://example.com/notes/1');
  });
});
