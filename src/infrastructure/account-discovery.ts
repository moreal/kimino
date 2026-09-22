import { DiscoveryError, type AccountDiscoveryGateway } from '../application/account-discovery';
import { parseAccountHandle, parseAccountDiscovery } from '../domain/account-discovery';
const MAX_BYTES = 256 * 1024;

/** Independent transport: it accepts no account credentials and never fetches actor profiles. */
export function createAccountDiscoveryGateway(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): AccountDiscoveryGateway {
  return {
    async resolve(handle, callerSignal) {
      callerSignal.throwIfAborted();
      const parsed = parseAccountHandle(handle.display);
      if (
        !parsed ||
        (Object.keys(parsed) as (keyof typeof parsed)[]).some((key) => parsed[key] !== handle[key])
      )
        throw new DiscoveryError('invalid-handle');
      const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(10000)]);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let responseBody: ReadableStream<Uint8Array> | null = null;
      let abortRead: (() => void) | undefined;
      try {
        const response = await fetcher(parsed.endpoint, {
          method: 'GET',
          headers: { Accept: 'application/jrd+json, application/json' },
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal,
        });
        responseBody = response.body;
        if (response.status === 404) throw new DiscoveryError('not-found');
        if (!response.ok) throw new DiscoveryError('unavailable');
        const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
        if (!['application/jrd+json', 'application/json'].includes(mime ?? ''))
          throw new DiscoveryError('invalid-response');
        const length = response.headers.get('Content-Length');
        if (length !== null && Number(length) > MAX_BYTES) throw new DiscoveryError('too-large');
        if (!response.body) throw new DiscoveryError('invalid-response');
        reader = response.body.getReader();
        const aborted = new Promise<never>((_, reject) => {
          abortRead = () => {
            void reader?.cancel().catch(() => undefined);
            reject(signal.reason);
          };
          signal.addEventListener('abort', abortRead, { once: true });
          if (signal.aborted) abortRead();
        });
        let bytes = 0;
        let text = '';
        const decoder = new TextDecoder('utf-8', { fatal: true });
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) throw new DiscoveryError('too-large');
          try {
            text += decoder.decode(value, { stream: true });
          } catch {
            throw new DiscoveryError('invalid-response');
          }
        }
        signal.throwIfAborted();
        try {
          text += decoder.decode();
        } catch {
          throw new DiscoveryError('invalid-response');
        }
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          throw new DiscoveryError('invalid-response');
        }
        const result = parseAccountDiscovery(value, parsed);
        if (!result) throw new DiscoveryError('invalid-response');
        return result;
      } catch (error) {
        callerSignal.throwIfAborted();
        if (error instanceof DiscoveryError) throw error;
        throw new DiscoveryError('unavailable');
      } finally {
        if (abortRead) signal.removeEventListener('abort', abortRead);
        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        } else if (responseBody) void responseBody.cancel().catch(() => undefined);
      }
    },
  };
}
