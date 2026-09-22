import type { ImageReadGateway } from '../application/image-reader';
import {
  GatewayHttpError,
  GatewayProtocolError,
  GatewayUnreachable,
  SessionError,
} from '../application/gateway-errors';
import { IMAGE_LIMITS, matchesImageHeader, type ImageMediaType } from '../domain/images';
import { safeUrl, sameOrigin } from '../domain/activitystreams';
import { unexpected } from './errors';

const rasterType = (value: unknown): value is ImageMediaType =>
  value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';

function httpsAddress(value: string): string {
  try {
    if (!value || /[\u0000-\u0020\u007f]/.test(value)) throw new Error();
    const url = new URL(safeUrl(value));
    if (url.protocol !== 'https:' || url.hash) throw new Error();
    return url.href;
  } catch {
    throw unexpected(
      'Image addresses must be absolute HTTPS URLs without credentials or fragments.',
    );
  }
}

/** Explicit ONI proxy transport. Remote image origins never receive browser requests or tokens. */
export function createOniImageReadGateway(deps: {
  actorUrl: string;
  proxyUrl(): Promise<string | undefined>;
  fetch: typeof fetch;
  token?: string;
  signal?: AbortSignal;
}): ImageReadGateway {
  return {
    async load(target, callerSignal) {
      callerSignal.throwIfAborted();
      deps.signal?.throwIfAborted();
      const mediaType = target.mediaType;
      if (!rasterType(mediaType)) throw new SessionError({ kind: 'media-unsupported' });
      const imageUrl = httpsAddress(target.url);
      const actorUrl = httpsAddress(deps.actorUrl);
      const deadline = new AbortController();
      const timer = setTimeout(
        () => deadline.abort(new DOMException('Image read deadline exceeded.', 'TimeoutError')),
        10000,
      );
      const signal = AbortSignal.any([
        callerSignal,
        deadline.signal,
        ...(deps.signal ? [deps.signal] : []),
      ]);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let responseBody: ReadableStream<Uint8Array> | null = null;
      let rejectAborted!: (reason: unknown) => void;
      const aborted = new Promise<never>((_, reject) => {
        rejectAborted = reject;
      });
      const onAbort = () => {
        void reader?.cancel().catch(() => undefined);
        rejectAborted(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        signal.throwIfAborted();
        const advertised = await Promise.race([deps.proxyUrl(), aborted]);
        signal.throwIfAborted();
        if (!advertised) throw new SessionError({ kind: 'media-unsupported' });
        const proxy = httpsAddress(advertised);
        if (!sameOrigin(proxy, actorUrl))
          throw unexpected('Image proxy must remain on the configured actor origin.');
        const headers: Record<string, string> = {
          Accept: mediaType,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (deps.token) headers.Authorization = `Bearer ${deps.token}`;
        const fetching = deps
          .fetch(proxy, {
            method: 'POST',
            headers,
            body: new URLSearchParams({ id: imageUrl }).toString(),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            redirect: 'error',
            signal,
          })
          .then((response) => {
            // A transport ignoring abort still cannot return late bytes or retain its stream.
            if (signal.aborted) {
              void response.body?.cancel().catch(() => undefined);
              throw signal.reason;
            }
            return response;
          });
        const response = await Promise.race([fetching, aborted]);
        responseBody = response.body;
        signal.throwIfAborted();
        if (response.redirected) throw unexpected('Redirected image responses are unsupported.');
        if (response.status !== 200) throw new GatewayHttpError(response.status);
        const contentType = response.headers.get('Content-Type');
        if (
          !contentType ||
          contentType.includes(',') ||
          contentType.split(';')[0].trim().toLowerCase() !== mediaType
        )
          throw unexpected('Image response does not match the requested raster media type.');
        const length = response.headers.get('Content-Length');
        if (length !== null && Number(length) > IMAGE_LIMITS.bytes)
          throw new SessionError({ kind: 'media-invalid', reason: 'size' });
        if (!responseBody) throw unexpected('Image response body is missing.');
        reader = responseBody.getReader();
        // A fixed bounded buffer avoids unbounded bookkeeping for many tiny chunks.
        const buffer = new Uint8Array(IMAGE_LIMITS.bytes);
        let size = 0;
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          if (value.byteLength > IMAGE_LIMITS.bytes - size)
            throw new SessionError({ kind: 'media-invalid', reason: 'size' });
          buffer.set(value, size);
          size += value.byteLength;
        }
        signal.throwIfAborted();
        const bytes = buffer.subarray(0, size);
        if (!matchesImageHeader(bytes, mediaType))
          throw new SessionError({ kind: 'media-invalid', reason: 'data' });
        return { bytes: size === buffer.length ? buffer : bytes.slice(), mediaType };
      } catch (error) {
        callerSignal.throwIfAborted();
        deps.signal?.throwIfAborted();
        if (
          error instanceof SessionError ||
          error instanceof GatewayHttpError ||
          error instanceof GatewayProtocolError
        )
          throw error;
        throw new GatewayUnreachable(
          deadline.signal.aborted ? 'Image read timed out.' : 'Image read could not be completed.',
        );
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        } else if (responseBody) void responseBody.cancel().catch(() => undefined);
      }
    },
  };
}
