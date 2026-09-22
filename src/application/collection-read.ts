/** Counts only: no remote bodies, credentials, or traversal cursors leave the gateway. */
export interface CollectionReadProgress {
  pages: number;
  items: number;
  collection?: 'following' | 'inbox' | 'outbox';
}

/** One invocation's read budget and cancellation, independent of session/POST transport. */
export interface CollectionReadOptions {
  signal?: AbortSignal;
  onReadBudget?: (progress: CollectionReadProgress) => Promise<void>;
}

/** An intentionally canceled or superseded read, not a gateway failure. */
export class CollectionReadCancelled extends Error {
  constructor() {
    super('Collection read canceled.');
    this.name = 'CollectionReadCancelled';
  }
}

interface Operation {
  controller: AbortController;
  current: () => boolean;
  gate?: { resolve(): void; reject(error: unknown): void };
}

/** Keeps exactly one full read and one explicit continuation gate current. */
export function createCollectionReadController(
  updateBudget: (progress: CollectionReadProgress | undefined) => void,
) {
  let active: Operation | undefined;
  let budgetOwner: Operation | undefined;
  let generation = 0;
  const live = (operation: Operation) =>
    active === operation && !operation.controller.signal.aborted && operation.current();

  function clearBudget(operation: Operation) {
    if (budgetOwner !== operation) return;
    budgetOwner = undefined;
    updateBudget(undefined);
  }

  function cancelActive() {
    const operation = active;
    if (!operation) return;
    active = undefined;
    const gate = operation.gate;
    operation.gate = undefined;
    const error = new CollectionReadCancelled();
    operation.controller.abort(error);
    gate?.reject(error);
    if (gate) clearBudget(operation);
  }

  return {
    cancel() {
      ++generation;
      cancelActive();
    },
    continueReading(): boolean {
      const operation = active;
      if (!operation || !live(operation) || !operation.gate) return false;
      const gate = operation.gate;
      operation.gate = undefined;
      clearBudget(operation);
      gate.resolve();
      return true;
    },
    async run<T>(
      read: (options: CollectionReadOptions) => Promise<T>,
      current: () => boolean,
    ): Promise<T> {
      if (!current()) throw new CollectionReadCancelled();
      const started = ++generation;
      cancelActive();
      // Aborting transport or clearing progress can synchronously start a newer read.
      if (started !== generation || !current()) throw new CollectionReadCancelled();
      const operation: Operation = { controller: new AbortController(), current };
      active = operation;
      const signal = operation.controller.signal;
      let rejectCanceled: (reason: unknown) => void;
      const canceled = new Promise<never>((_, reject) => {
        rejectCanceled = reject;
      });
      const onAbort = () => rejectCanceled(new CollectionReadCancelled());
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await Promise.race([
          read({
            signal,
            onReadBudget: async (progress) => {
              if (!live(operation)) throw new CollectionReadCancelled();
              if (operation.gate) throw new Error('A collection continuation is already pending.');
              return new Promise<void>((resolve, reject) => {
                operation.gate = { resolve, reject };
                budgetOwner = operation;
                updateBudget({
                  pages: progress.pages,
                  items: progress.items,
                  ...(['following', 'inbox', 'outbox'].includes(progress.collection ?? '')
                    ? { collection: progress.collection }
                    : {}),
                });
              });
            },
          }),
          canceled,
        ]);
        if (!live(operation)) throw new CollectionReadCancelled();
        return result;
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (active === operation) {
          active = undefined;
          if (operation.gate) {
            operation.gate.reject(new CollectionReadCancelled());
            operation.gate = undefined;
            clearBudget(operation);
          }
        }
      }
    },
  };
}

export type CollectionReadController = ReturnType<typeof createCollectionReadController>;
