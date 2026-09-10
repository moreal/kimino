/**
 * A monotonic generation counter. Long-running work captures `current()` when it starts
 * and checks `isCurrent()` before applying results, so a session that was replaced or
 * disconnected in the meantime never receives late updates.
 */
export function createGuard() {
  let generation = 0;
  return {
    /** Invalidates every in-flight operation and returns the new generation. */
    next: () => ++generation,
    current: () => generation,
    isCurrent: (started: number) => started === generation,
  };
}
