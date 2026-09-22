import type { CollectionReadOptions, CollectionReadProgress } from '../application/collection-read';
import { GatewayReadLimit } from '../application/gateway-errors';

/** Await an explicit next chunk without retaining a cancellation listener on an abandoned gate. */
export async function awaitReadBudget(
  limit: number,
  progress: CollectionReadProgress,
  { signal, onReadBudget }: CollectionReadOptions,
): Promise<void> {
  signal?.throwIfAborted();
  if (!onReadBudget) throw new GatewayReadLimit('pages', limit);
  let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((accept, reject) => {
      onAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      Promise.resolve()
        .then(() => {
          signal?.throwIfAborted();
          return onReadBudget(progress);
        })
        .then(accept, reject);
    });
    signal?.throwIfAborted();
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
