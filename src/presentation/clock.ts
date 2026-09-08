import { createSignal, onCleanup } from 'solid-js';

const TICK = 60_000;
const [now, setNow] = createSignal(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
let users = 0;

/**
 * A shared minute clock for relative time labels. The interval starts with the first
 * component that calls this and stops when the last one is disposed, so nothing leaks.
 */
export function useClock(): () => number {
  // Never write the signal synchronously here: Solid 2 forbids reactive writes
  // inside component setup. The first tick refreshes stale values after a pause.
  if (users++ === 0) timer = setInterval(() => setNow(Date.now()), TICK);
  onCleanup(() => {
    if (--users === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  return now;
}
