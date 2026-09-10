/**
 * The widths the layout turns on, named once. `app.css` writes the same numbers in its
 * `@media` and `@container` rules (a stylesheet cannot read a module), and
 * `design-system.test.ts` checks that every px literal in one of those rules is a value
 * from here, so a breakpoint cannot drift in one place without the other noticing.
 */

/** Viewport breakpoints, in CSS px. */
export const BREAKPOINTS = {
  /** From here the conversation opens beside the timeline instead of replacing it. */
  wide: 1100,
  /** From here the layout uses the gutter so the thread column fits a full action row. */
  gutter: 1280,
  /** Up to here the app is one column with the navigation as a bottom tab bar. */
  phone: 650,
} as const;

/**
 * Container steps, in CSS px, measured on the content box of the container named in the
 * key (`card` is `.note-card`, `column` is a reading column). A note card is its own
 * container so a reply nested three levels deep folds as a card of its own width, never
 * as its column would.
 */
export const CONTAINER_STEPS = {
  card: {
    /**
     * Under this width my own action row folds 수정 and 삭제 behind 관리 and takes the
     * panel's density (one type step down, the tightest padding, counted reactions keep
     * their number and fold their word), so an own card with counts is one row of actions
     * tall in the reading column of an 1100-1280 window as well as in the thread panel.
     */
    fold: 511,
    /** Under this width the row goes to the smallest type step and the small icons. */
    tight: 387,
    /** Under this width 저장 folds into the 관리 row too. */
    saveFold: 349,
    /** Under this width someone else's row folds 공유, 좋아요 and 저장 to their icons. */
    icons: 299,
  },
  column: {
    /** Under this width the visibility picker folds from four cells to an even 2x2. */
    picker: 419,
  },
} as const;

/** The `matchMedia` query for the desktop layout, from the same number the stylesheet uses. */
export const WIDE_QUERY = `(min-width: ${BREAKPOINTS.wide}px)`;

/**
 * The ceilings the composer draws (content and warning length) are the domain's; views
 * take domain values through presentation only, so they are handed on from here.
 */
export { NOTE_LIMITS } from '../domain/note-content';
