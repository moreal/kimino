import { afterEach, expect, it, vi } from 'vitest';
import { createOniImageReadGateway } from './oni-image-reader';
import { IMAGE_LIMITS } from '../domain/images';

const actorUrl = 'https://own.test/alice';
const proxy = 'https://own.test/proxy';
const target = { url: 'https://remote.test/private/image', mediaType: 'image/png' };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = new Uint8Array([255, 216, 255, 224]);
const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
const signal = () => new AbortController().signal;
const response = (bytes = png, mediaType = 'image/png') =>
  new Response(bytes, { headers: { 'Content-Type': mediaType } });
function setup(
  fetcher: typeof fetch = async () => response(),
  proxyUrl = async (): Promise<string | undefined> => proxy,
  sessionSignal?: AbortSignal,
) {
  const calls = vi.fn(fetcher);
  const discovery = vi.fn(proxyUrl);
  return {
    calls,
    discovery,
    gateway: createOniImageReadGateway({
      actorUrl,
      proxyUrl: discovery,
      fetch: calls,
      token: 'test-only-token',
      signal: sessionSignal,
    }),
  };
}
afterEach(() => vi.useRealTimers());

it('reads only the advertised own-origin proxy and returns bytes without fetching the image origin', async () => {
  const { calls, gateway } = setup();
  expect(await gateway.load(target, signal())).toEqual({ bytes: png, mediaType: 'image/png' });
  expect(calls).toHaveBeenCalledOnce();
  const [url, init] = calls.mock.calls[0];
  expect(url).toBe(proxy);
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    redirect: 'error',
  });
  const headers = new Headers(init?.headers);
  expect(headers.get('Authorization')).toBe('Bearer test-only-token');
  expect(headers.get('Accept')).toBe('image/png');
  expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  expect(new URLSearchParams(String(init?.body)).get('id')).toBe(target.url);
});

it.each([
  undefined,
  '',
  'image/svg+xml',
  'image/gif',
  'image/png, image/jpeg',
  'image/png; charset=utf-8',
])('refuses missing/unsupported expected MIME %s before discovery or fetch', async (mediaType) => {
  const { calls, discovery, gateway } = setup();
  await expect(gateway.load({ ...target, mediaType }, signal())).rejects.toThrow();
  expect(discovery).not.toHaveBeenCalled();
  expect(calls).not.toHaveBeenCalled();
});

it.each([
  'http://localhost/image',
  'javascript:bad',
  'https://user:pass@remote.test/image',
  'https://remote.test/image#part',
  '/image',
  'https://remote.test/\nimage',
])('refuses unsafe target %s without requests', async (url) => {
  const { calls, discovery, gateway } = setup();
  await expect(gateway.load({ ...target, url }, signal())).rejects.toThrow();
  expect(discovery).not.toHaveBeenCalled();
  expect(calls).not.toHaveBeenCalled();
});

it.each([
  undefined,
  '',
  'https://remote.test/proxy',
  'http://own.test/proxy',
  'https://user:pass@own.test/proxy',
  'https://own.test/proxy#part',
  '/proxy',
])('refuses absent or unsafe advertised proxy %s without sending credentials', async (url) => {
  const { calls, gateway } = setup(undefined, async () => url);
  await expect(gateway.load(target, signal())).rejects.toThrow();
  expect(calls).not.toHaveBeenCalled();
});

it.each([
  [png, 'image/png'],
  [jpeg, 'image/jpeg'],
  [webp, 'image/webp'],
] as const)('accepts matching raster header bytes and MIME %s %s', async (bytes, mediaType) => {
  const { gateway } = setup(async () => response(bytes, mediaType));
  expect(await gateway.load({ ...target, mediaType }, signal())).toEqual({ bytes, mediaType });
});

it.each([
  [png, 'image/jpeg'],
  [png, 'image/svg+xml'],
  [png, 'image/png, image/jpeg'],
  [new Uint8Array(), 'image/png'],
  [new Uint8Array([137, 80, 78]), 'image/png'],
  [new TextEncoder().encode('<svg onload="alert(1)">'), 'image/png'],
] as const)('rejects mismatched response MIME or signature', async (bytes, mime) => {
  const { gateway } = setup(async () => response(bytes, mime));
  await expect(gateway.load(target, signal())).rejects.toThrow();
});

it.each([201, 204, 206, 302, 401, 404, 500])(
  'rejects HTTP%s rather than accepting partial/redirect/error bytes',
  async (status) => {
    const { gateway } = setup(
      async () => new Response(null, { status, headers: { 'Content-Type': 'image/png' } }),
    );
    await expect(gateway.load(target, signal())).rejects.toThrow();
  },
);

it('rejects a redirected response even if an injected fetch returns 200', async () => {
  const redirected = response();
  Object.defineProperty(redirected, 'redirected', { value: true });
  await expect(setup(async () => redirected).gateway.load(target, signal())).rejects.toThrow();
});

it('checks declared size before consuming a response and cancels its body', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const { gateway } = setup(
    async () =>
      new Response(body, {
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(IMAGE_LIMITS.bytes + 1) },
      }),
  );
  await expect(gateway.load(target, signal())).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});

it('accepts exactly the byte ceiling without requiring a larger allowance', async () => {
  const bytes = new Uint8Array(IMAGE_LIMITS.bytes);
  bytes.set(png);
  const result = await setup(async () => response(bytes)).gateway.load(target, signal());
  expect(result.bytes.byteLength).toBe(IMAGE_LIMITS.bytes);
  expect(result.bytes.subarray(0, png.length)).toEqual(png);
});

it('validates signatures across chunk boundaries and returns only received bytes', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of png) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const { gateway } = setup(
    async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
  );
  expect(await gateway.load(target, signal())).toEqual({ bytes: png, mediaType: 'image/png' });
});

it('checks actual streamed size even when Content-Length understates it', async () => {
  const bytes = new Uint8Array(IMAGE_LIMITS.bytes + 1);
  bytes.set(png);
  const { gateway } = setup(
    async () =>
      new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Length': '8' } }),
  );
  await expect(gateway.load(target, signal())).rejects.toMatchObject({
    failure: { kind: 'media-invalid', reason: 'size' },
  });
});

it('cancels a rejected MIME response without reading image bytes', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const { gateway } = setup(
    async () => new Response(body, { headers: { 'Content-Type': 'text/html' } }),
  );
  await expect(gateway.load(target, signal())).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'bounds streamed bytes including an oversized single chunk (%s)',
  async (single) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new Uint8Array(IMAGE_LIMITS.bytes + (single ? 1 : 0));
        bytes.set(png);
        controller.enqueue(bytes);
        if (!single) controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    await expect(
      setup(
        async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
      ).gateway.load(target, signal()),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  },
);

it('honors both caller and session cancellation before fetching', async () => {
  for (const origin of ['caller', 'session']) {
    const aborted = new AbortController();
    aborted.abort();
    const { gateway, calls, discovery } = setup(
      undefined,
      undefined,
      origin === 'session' ? aborted.signal : undefined,
    );
    await expect(
      gateway.load(target, origin === 'caller' ? aborted.signal : signal()),
    ).rejects.toThrow();
    expect(calls).not.toHaveBeenCalled();
    expect(discovery).not.toHaveBeenCalled();
  }
});

it.each(['caller', 'session'] as const)(
  'cancels a stalled response body on %s abort',
  async (origin) => {
    const abort = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const { gateway } = setup(
      async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
      undefined,
      origin === 'session' ? abort.signal : undefined,
    );
    const result = gateway
      .load(target, origin === 'caller' ? abort.signal : signal())
      .catch((error: unknown) => error);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    abort.abort();
    expect(await result).toBeInstanceOf(Error);
    expect(cancel).toHaveBeenCalledOnce();
  },
);

it('keeps the ten-second deadline active through body consumption', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const { gateway } = setup(
    async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }),
  );
  const result = gateway.load(target, signal()).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toBeInstanceOf(Error);
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('times out proxy discovery without issuing a later request', async () => {
  vi.useFakeTimers();
  let resolve!: (url: string) => void;
  const pending = new Promise<string>((yes) => {
    resolve = yes;
  });
  const { gateway, calls } = setup(undefined, () => pending);
  const result = gateway.load(target, signal()).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toBeInstanceOf(Error);
  resolve(proxy);
  await Promise.resolve();
  expect(calls).not.toHaveBeenCalled();
});

it('does not return a late fetch response after cancellation and releases that body', async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>((yes) => {
    resolve = yes;
  });
  const cancel = vi.fn();
  const abort = new AbortController();
  const { gateway, calls } = setup(() => pending);
  const result = gateway.load(target, abort.signal).catch((error: unknown) => error);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(calls).toHaveBeenCalledOnce();
  abort.abort();
  expect(await result).toBeInstanceOf(Error);
  resolve(
    new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { 'Content-Type': 'image/png' },
    }),
  );
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(cancel).toHaveBeenCalledOnce();
});
