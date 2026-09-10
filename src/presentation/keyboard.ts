/**
 * Keyboard shortcuts for list views, as a pure mapping from a key event to an intent.
 * The component decides what the intent means for the current card; this module only
 * decides whether a key press is a shortcut at all.
 */
export type ShortcutAction =
  | 'next'
  | 'previous'
  | 'open'
  | 'reply'
  | 'save'
  | 'like'
  | 'share'
  | 'leave'
  | 'help';

/** The parts of a key event the mapping needs; the component fills them from the DOM. */
export interface ShortcutKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** Focus is inside an input, textarea, or contenteditable element. */
  editable: boolean;
  /** Focus is on a note card itself (not on one of its buttons). */
  onCard: boolean;
  /**
   * Focus is anywhere inside a note card: the card, or one of its controls - where the
   * reply button lands after a composer closes. Arrows and Escape act from there; Enter
   * stays with the control it is on.
   */
  inCard?: boolean;
}

const anywhere: Record<string, ShortcutAction> = {
  j: 'next',
  k: 'previous',
  o: 'open',
  r: 'reply',
  s: 'save',
  l: 'like',
  b: 'share',
  '?': 'help',
};
/** Keys that already mean something to buttons and links, so they only act on the card. */
const onCardOnly: Record<string, ShortcutAction> = {
  Enter: 'open',
};
/** Keys that mean nothing to a button at rest, so they act from anywhere inside a card. */
const inCardOnly: Record<string, ShortcutAction> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  Escape: 'leave',
};

/** The shortcut a key press asks for, or nothing when typing or using modifier chords. */
export function shortcutFor(event: ShortcutKey): ShortcutAction | undefined {
  if (event.editable || event.ctrlKey || event.metaKey || event.altKey) return undefined;
  // "?" arrives with Shift held; every other shortcut is a plain key.
  if (event.shiftKey && event.key !== '?') return undefined;
  if (event.onCard && onCardOnly[event.key]) return onCardOnly[event.key];
  if ((event.onCard || event.inCard) && inCardOnly[event.key]) return inCardOnly[event.key];
  return anywhere[event.key];
}

/**
 * The card j/k should land on. From inside a card (`current` is its id) the ring steps by
 * `delta` and stops at the ends; from anywhere else it re-enters the `remembered` card when
 * that is still listed, otherwise the first (down) or last (up) card.
 */
export function nextCursor(
  ids: readonly string[],
  current: string | undefined,
  delta: 1 | -1,
  remembered?: string,
): string | undefined {
  if (!ids.length) return undefined;
  if (current !== undefined && ids.includes(current)) return ids[ids.indexOf(current) + delta];
  if (remembered !== undefined && ids.includes(remembered)) return remembered;
  return ids[delta > 0 ? 0 : ids.length - 1];
}

/** The shortcut list as shown in the help panel, in learning order. */
export const shortcutRows: { keys: string[]; action: ShortcutAction }[] = [
  { keys: ['j', 'k'], action: 'next' },
  { keys: ['Enter', 'o'], action: 'open' },
  { keys: ['r'], action: 'reply' },
  { keys: ['s'], action: 'save' },
  { keys: ['l'], action: 'like' },
  { keys: ['b'], action: 'share' },
  { keys: ['Esc'], action: 'leave' },
  { keys: ['?'], action: 'help' },
];
