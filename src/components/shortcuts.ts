import { nextCursor, type ShortcutKey } from '../presentation/keyboard';

/** Focus is inside an input, textarea, select or contenteditable element. */
export const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]') ||
    !!target.closest('[contenteditable=""], [contenteditable="true"]'));

/** Focus is inside a composer form: its Escape belongs to the composer, whatever it is on. */
export const inComposer = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('form.composer');

/** An element that can take focus now: attached, drawn (not `display: none`) and enabled. */
export const canTakeFocus = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  el.isConnected &&
  el.getClientRects().length > 0 &&
  !el.matches(':disabled');

/**
 * Where focus goes when a dialog closes: back to the control that opened it, or - when that
 * control left the page, was hidden or was disabled while the dialog was up (a card that was
 * filtered out, a sidebar control the layout folded away) - to the page heading, so focus
 * never falls back to `body`.
 */
export const restoreFocus = (opener: Element | null) => {
  if (canTakeFocus(opener)) {
    opener.focus();
    return;
  }
  document.getElementById('page-heading')?.focus({ preventScroll: true });
};

/** The note card an event happened in, if any. */
export const cardOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>('article.note-card') : null;

/**
 * The parts of a key event the pure shortcut mapping needs. The card is resolved from
 * wherever focus is inside it (`closest`), so the shortcuts keep working from a card's
 * reply button once its composer has closed, not only from the card itself.
 */
export function shortcutKey(event: KeyboardEvent): ShortcutKey {
  const card = cardOf(event.target);
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    editable: isEditable(event.target),
    onCard: !!card && card === event.target,
    inCard: !!card,
  };
}

/**
 * j/k over a list of cards: the card the ring lands on is a pure rule (`nextCursor`); this
 * moves focus there and scrolls it into view without jumping. Returns the id it landed on,
 * so a roving tab stop can remember it, or nothing when there was nowhere to go.
 */
export function moveCursor(
  cards: readonly HTMLElement[],
  target: EventTarget | null,
  delta: 1 | -1,
  remembered?: string,
): string | undefined {
  const ids = cards.map((card) => card.dataset.note ?? '');
  const id = nextCursor(ids, cardOf(target)?.dataset.note, delta, remembered);
  if (id === undefined) return undefined;
  const next = cards[ids.indexOf(id)];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
  return id;
}
