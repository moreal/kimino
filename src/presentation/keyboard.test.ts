import { describe, expect, it } from 'vitest';
import { nextCursor, shortcutFor, shortcutRows, type ShortcutKey } from './keyboard';

const press = (key: string, patch: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key,
  editable: false,
  onCard: false,
  ...patch,
});

describe('shortcutFor', () => {
  it('maps letters to intents anywhere outside editable fields', () => {
    expect(shortcutFor(press('j'))).toBe('next');
    expect(shortcutFor(press('k'))).toBe('previous');
    expect(shortcutFor(press('o'))).toBe('open');
    expect(shortcutFor(press('r'))).toBe('reply');
    expect(shortcutFor(press('s'))).toBe('save');
    expect(shortcutFor(press('l'))).toBe('like');
    expect(shortcutFor(press('b'))).toBe('share');
    expect(shortcutFor(press('?', { shiftKey: true }))).toBe('help');
    expect(shortcutFor(press('x'))).toBeUndefined();
  });
  it('only takes arrows, Enter and Escape when the card itself has focus', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'])
      expect(shortcutFor(press(key))).toBeUndefined();
    expect(shortcutFor(press('ArrowDown', { onCard: true }))).toBe('next');
    expect(shortcutFor(press('ArrowUp', { onCard: true }))).toBe('previous');
    expect(shortcutFor(press('Enter', { onCard: true }))).toBe('open');
    expect(shortcutFor(press('Escape', { onCard: true }))).toBe('leave');
  });
  it('takes letters, arrows and Escape from a control inside the card, but leaves Enter to it', () => {
    // After a reply composer closes, focus rests on the reply button: j/k still walk.
    expect(shortcutFor(press('j', { inCard: true }))).toBe('next');
    expect(shortcutFor(press('ArrowDown', { inCard: true }))).toBe('next');
    expect(shortcutFor(press('ArrowUp', { inCard: true }))).toBe('previous');
    expect(shortcutFor(press('Escape', { inCard: true }))).toBe('leave');
    // Enter on a button is that button.
    expect(shortcutFor(press('Enter', { inCard: true }))).toBeUndefined();
  });
  it('stays quiet while typing or with modifier keys', () => {
    expect(shortcutFor(press('j', { editable: true }))).toBeUndefined();
    expect(shortcutFor(press('Enter', { editable: true, onCard: true }))).toBeUndefined();
    expect(shortcutFor(press('j', { ctrlKey: true }))).toBeUndefined();
    expect(shortcutFor(press('j', { metaKey: true }))).toBeUndefined();
    expect(shortcutFor(press('j', { altKey: true }))).toBeUndefined();
    expect(shortcutFor(press('J', { shiftKey: true }))).toBeUndefined();
  });
  it('documents every action exactly once', () => {
    const actions = shortcutRows.map((row) => row.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toContain('next');
    expect(actions).toContain('help');
  });
});

describe('nextCursor', () => {
  const ids = ['a', 'b', 'c'];
  it('steps from the focused card and stops at the ends', () => {
    expect(nextCursor(ids, 'a', 1)).toBe('b');
    expect(nextCursor(ids, 'b', -1)).toBe('a');
    expect(nextCursor(ids, 'c', 1)).toBeUndefined();
    expect(nextCursor(ids, 'a', -1)).toBeUndefined();
  });
  it('re-enters the remembered card from outside, else the first or last', () => {
    expect(nextCursor(ids, undefined, 1, 'b')).toBe('b');
    expect(nextCursor(ids, undefined, -1, 'b')).toBe('b');
    expect(nextCursor(ids, undefined, 1, 'gone')).toBe('a');
    expect(nextCursor(ids, undefined, -1)).toBe('c');
    expect(nextCursor(ids, 'gone', 1)).toBe('a');
    expect(nextCursor([], 'a', 1)).toBeUndefined();
  });
});
