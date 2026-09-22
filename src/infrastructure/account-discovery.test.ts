import { expect, it, vi } from 'vitest';
import { createAccountDiscoveryGateway } from './account-discovery';
import { parseAccountHandle } from '../domain/account-discovery';
const handle = parseAccountHandle('@alice@example.org')!;
const signal = () => new AbortController().signal;
const body = {
  subject: handle.resource,
  links: [{ rel: 'self', type: 'application/activity+json', href: 'https://actor.example/alice' }],
};
it('makes exactly one credential-free WebFinger GET and never fetches a profile', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const gateway = createAccountDiscoveryGateway(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(body, { headers: { 'Content-Type': 'application/jrd+json' } });
  });
  expect(await gateway.resolve(handle, signal())).toEqual({
    handle: handle.display,
    actorUrl: 'https://actor.example/alice',
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    url: handle.endpoint,
    init: {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/jrd+json, application/json' },
    },
  });
  expect(new Headers(calls[0].init?.headers).has('Authorization')).toBe(false);
});
it.each([
  [404, 'not-found'],
  [401, 'unavailable'],
  [500, 'unavailable'],
  [302, 'unavailable'],
] as const)('classifies HTTP%s', async (status, kind) => {
  await expect(
    createAccountDiscoveryGateway(async () => new Response(null, { status })).resolve(
      handle,
      signal(),
    ),
  ).rejects.toMatchObject({ kind });
});
it.each([
  new Response('bad', { headers: { 'Content-Type': 'application/json' } }),
  Response.json({ ...body, subject: 'acct:other@example.org' }),
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'text/html' } }),
])('rejects malformed or non-JSON discovery documents', async (response) => {
  await expect(
    createAccountDiscoveryGateway(async () => response).resolve(handle, signal()),
  ).rejects.toMatchObject({ kind: 'invalid-response' });
});
it('bounds streamed bytes even without Content-Length', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(256 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await expect(
    createAccountDiscoveryGateway(
      async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    ).resolve(handle, signal()),
  ).rejects.toMatchObject({ kind: 'too-large' });
});
it('enforces timeout through a stalled response body and cancels its reader', async () => {
  const timeout = new AbortController();
  const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  let cancelled = false;
  try {
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const pending = createAccountDiscoveryGateway(
      async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    ).resolve(handle, signal());
    await Promise.resolve();
    timeout.abort(new DOMException('Timed out', 'TimeoutError'));
    await expect(pending).rejects.toMatchObject({ kind: 'unavailable' });
    expect(cancelled).toBe(true);
    expect(spy).toHaveBeenCalledWith(10000);
  } finally {
    spy.mockRestore();
  }
});
it('honors caller cancellation before issuing a request', async () => {
  const abort = new AbortController();
  abort.abort();
  const fetcher = vi.fn();
  await expect(
    createAccountDiscoveryGateway(fetcher).resolve(handle, abort.signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects a forged gateway handle instead of fetching its endpoint', async () => {
  const fetcher = vi.fn();
  await expect(
    createAccountDiscoveryGateway(fetcher).resolve(
      { ...handle, endpoint: 'https://evil.test/' },
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid-handle' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('classifies interrupted body streams as unavailable', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new TypeError('network body lost'));
    },
  });
  await expect(
    createAccountDiscoveryGateway(
      async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    ).resolve(handle, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('cancels an oversized declared body without consuming it', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    createAccountDiscoveryGateway(
      async () =>
        new Response(stream, {
          headers: { 'Content-Type': 'application/json', 'Content-Length': String(256 * 1024 + 1) },
        }),
    ).resolve(handle, signal()),
  ).rejects.toMatchObject({ kind: 'too-large' });
  expect(cancelled).toBe(true);
});
