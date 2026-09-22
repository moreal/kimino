import { describe, expect, it, vi } from 'vitest';
import type { AccountHandle, DiscoveryResult } from '../domain/account-discovery';
import {
  createAccountDiscovery,
  DiscoveryError,
  type AccountDiscoveryGateway,
} from './account-discovery';
import { deferred } from './session-doubles.test-support';

const resultFor = (handle: AccountHandle): DiscoveryResult => ({
  handle: handle.display,
  actorUrl: 'https://people.example/alice',
});
function setup(gateway?: AccountDiscoveryGateway) {
  const notify = vi.fn();
  const port = gateway ?? { resolve: vi.fn(async (handle: AccountHandle) => resultFor(handle)) };
  const discovery = createAccountDiscovery(port, notify);
  return { discovery, notify, port };
}

describe('account discovery lifecycle', () => {
  it('does not notify on construction or fetch while input changes', () => {
    const { discovery, notify, port } = setup();
    expect(notify).not.toHaveBeenCalled();
    discovery.setInput('@Alice@people.example');
    expect(discovery.getSnapshot()).toEqual({ input: '@Alice@people.example', phase: 'idle' });
    expect(port.resolve).not.toHaveBeenCalled();
  });
  it('returns a discovery result only after the explicit lookup resolves', async () => {
    const pending = deferred<DiscoveryResult>();
    const port = { resolve: vi.fn().mockReturnValue(pending.promise) };
    const { discovery } = setup(port);
    discovery.setInput('@Alice@people.example');
    const lookup = discovery.lookup();
    expect(discovery.getSnapshot().phase).toBe('loading');
    expect(discovery.getSnapshot().result).toBeUndefined();
    const [handle, signal] = port.resolve.mock.calls[0];
    expect(handle.username).toBe('Alice');
    expect(signal.aborted).toBe(false);
    pending.resolve(resultFor(handle));
    await lookup;
    expect(discovery.getSnapshot()).toEqual({
      input: '@Alice@people.example',
      phase: 'ready',
      result: resultFor(handle),
    });
  });
  it('refuses invalid input without requesting anything and reports a missing gateway', async () => {
    const { discovery, port } = setup();
    discovery.setInput('https://people.example/actor');
    await discovery.lookup();
    expect(discovery.getSnapshot()).toMatchObject({ phase: 'error', error: 'invalid-handle' });
    expect(port.resolve).not.toHaveBeenCalled();
    const unavailable = createAccountDiscovery(undefined, vi.fn());
    unavailable.setInput('Alice@people.example');
    await unavailable.lookup();
    expect(unavailable.getSnapshot()).toEqual({
      input: 'Alice@people.example',
      phase: 'error',
      error: 'unavailable',
    });
  });
  it.each(['not-found', 'invalid-response', 'too-large', 'unavailable'] as const)(
    'preserves input and exposes typed %s failures',
    async (kind) => {
      const { discovery } = setup({ resolve: vi.fn().mockRejectedValue(new DiscoveryError(kind)) });
      discovery.setInput('@Alice@people.example');
      await discovery.lookup();
      expect(discovery.getSnapshot()).toEqual({
        input: '@Alice@people.example',
        phase: 'error',
        error: kind,
      });
    },
  );
  it('classifies unknown failures without exposing transport text', async () => {
    const { discovery } = setup({ resolve: vi.fn().mockRejectedValue(new Error('remote body')) });
    discovery.setInput('@Alice@people.example');
    await discovery.lookup();
    expect(discovery.getSnapshot().error).toBe('unavailable');
    expect(JSON.stringify(discovery.getSnapshot())).not.toContain('remote body');
  });
  it('invalidates A to B to A edits even when transport ignores abort', async () => {
    const pending = deferred<DiscoveryResult>();
    const port = { resolve: vi.fn().mockReturnValue(pending.promise) };
    const { discovery, notify } = setup(port);
    discovery.setInput('@Alice@people.example');
    const lookup = discovery.lookup();
    const [handle, signal] = port.resolve.mock.calls[0];
    discovery.setInput('@Bob@people.example');
    discovery.setInput('@Alice@people.example');
    expect(signal.aborted).toBe(true);
    notify.mockClear();
    pending.resolve(resultFor(handle));
    await lookup;
    expect(discovery.getSnapshot()).toEqual({ input: '@Alice@people.example', phase: 'idle' });
    expect(notify).not.toHaveBeenCalled();
  });
  it('a replacement lookup aborts the first and ignores its late failure', async () => {
    const old = deferred<DiscoveryResult>();
    const next = deferred<DiscoveryResult>();
    const port = {
      resolve: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise),
    };
    const { discovery } = setup(port);
    discovery.setInput('@Alice@people.example');
    const first = discovery.lookup();
    const second = discovery.lookup();
    expect(port.resolve.mock.calls[0][1].aborted).toBe(true);
    const result = resultFor(port.resolve.mock.calls[1][0]);
    next.resolve(result);
    await second;
    old.reject(new DiscoveryError('not-found'));
    await first;
    expect(discovery.getSnapshot()).toMatchObject({ phase: 'ready', result });
  });
  it('reset aborts pending work and clears all previous account input/results', async () => {
    const pending = deferred<DiscoveryResult>();
    const port = { resolve: vi.fn().mockReturnValue(pending.promise) };
    const { discovery, notify } = setup(port);
    discovery.setInput('@Alice@people.example');
    const lookup = discovery.lookup();
    discovery.reset();
    expect(port.resolve.mock.calls[0][1].aborted).toBe(true);
    expect(discovery.getSnapshot()).toEqual({ input: '', phase: 'idle' });
    notify.mockClear();
    pending.resolve(resultFor(port.resolve.mock.calls[0][0]));
    await lookup;
    expect(notify).not.toHaveBeenCalled();
    expect(discovery.getSnapshot()).toEqual({ input: '', phase: 'idle' });
  });
  it('dispose aborts pending work and prevents later requests or notifications', async () => {
    const pending = deferred<DiscoveryResult>();
    const port = { resolve: vi.fn().mockReturnValue(pending.promise) };
    const { discovery, notify } = setup(port);
    discovery.setInput('@Alice@people.example');
    const lookup = discovery.lookup();
    discovery.dispose();
    expect(port.resolve.mock.calls[0][1].aborted).toBe(true);
    notify.mockClear();
    pending.reject(new DiscoveryError('unavailable'));
    await lookup;
    discovery.setInput('@Bob@people.example');
    discovery.reset();
    await discovery.lookup();
    expect(port.resolve).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });
  it('editing after success removes the stale result before another lookup', async () => {
    const { discovery } = setup();
    discovery.setInput('@Alice@people.example');
    await discovery.lookup();
    expect(discovery.getSnapshot().result).toBeDefined();
    discovery.setInput('@Bob@people.example');
    expect(discovery.getSnapshot()).toEqual({ input: '@Bob@people.example', phase: 'idle' });
  });
});
