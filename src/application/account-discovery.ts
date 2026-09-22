import {
  parseAccountHandle,
  type AccountHandle,
  type DiscoveryResult,
} from '../domain/account-discovery';

export type DiscoveryErrorKind =
  | 'invalid-handle'
  | 'unavailable'
  | 'not-found'
  | 'invalid-response'
  | 'too-large';

/** Typed discovery failure; remote response bodies never become presentation text. */
export class DiscoveryError extends Error {
  constructor(readonly kind: DiscoveryErrorKind) {
    super(kind);
    this.name = 'DiscoveryError';
  }
}

/** Credential-free handle resolution. Lookup never follows the returned actor. */
export interface AccountDiscoveryGateway {
  resolve(handle: AccountHandle, signal: AbortSignal): Promise<DiscoveryResult>;
}

export interface AccountDiscoveryState {
  readonly input: string;
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly result?: DiscoveryResult;
  readonly error?: DiscoveryErrorKind;
}

/** Owns lookup ordering and cancellation independently of rendering and networking. */
export function createAccountDiscovery(
  gateway: AccountDiscoveryGateway | undefined,
  notify: () => void,
) {
  let state: AccountDiscoveryState = { input: '', phase: 'idle' };
  let generation = 0;
  let cancellation: AbortController | undefined;
  let disposed = false;

  function invalidate() {
    ++generation;
    cancellation?.abort();
    cancellation = undefined;
  }
  function replace(next: AccountDiscoveryState) {
    state = next;
    notify();
  }

  return {
    getSnapshot: (): AccountDiscoveryState => state,
    setInput(input: string) {
      if (disposed) return;
      invalidate();
      replace({ input, phase: 'idle' });
    },
    async lookup(): Promise<void> {
      if (disposed) return;
      invalidate();
      const started = generation;
      const input = state.input;
      const handle = parseAccountHandle(input);
      if (!handle) {
        replace({ input, phase: 'error', error: 'invalid-handle' });
        return;
      }
      if (!gateway) {
        replace({ input, phase: 'error', error: 'unavailable' });
        return;
      }
      const controller = new AbortController();
      cancellation = controller;
      const current = () => !disposed && generation === started;
      replace({ input, phase: 'loading' });
      try {
        // A synchronous subscriber can reset/dispose when loading is announced.
        if (!current()) return;
        const result = await gateway.resolve(handle, controller.signal);
        if (current()) replace({ input, phase: 'ready', result });
      } catch (error) {
        if (current())
          replace({
            input,
            phase: 'error',
            error: error instanceof DiscoveryError ? error.kind : 'unavailable',
          });
      } finally {
        if (current()) cancellation = undefined;
      }
    },
    reset() {
      if (disposed) return;
      invalidate();
      replace({ input: '', phase: 'idle' });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      // No notification after disposal, and no retained result from a previous account.
      state = { input: '', phase: 'idle' };
    },
  };
}
