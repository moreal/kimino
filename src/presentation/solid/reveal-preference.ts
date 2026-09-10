import { createContext, useContext } from 'solid-js';

/**
 * The browser-wide "open every content-warned note" preference, read by each note body
 * without threading a prop through every card. The shell provides the accessor; outside a
 * provider the preference is off, which is also what a fresh browser has.
 */
export const RevealWarnedContext = createContext<() => boolean>(() => false);
export const useRevealWarned = () => useContext(RevealWarnedContext);
