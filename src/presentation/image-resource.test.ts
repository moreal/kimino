import { describe, expect, it, vi } from 'vitest';
import type { ReadImage } from '../application/image-reader';
import { createImageResource, type ImageResourceState } from './image-resource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const image: ReadImage = { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' };

function setup() {
  const pending: ReturnType<typeof deferred<ReadImage>>[] = [];
  const signals: AbortSignal[] = [];
  const releases: ReturnType<typeof vi.fn>[] = [];
  const states: ImageResourceState[] = [];
  const load = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    const next = deferred<ReadImage>();
    pending.push(next);
    return next.promise;
  });
  const createResource = vi.fn(() => {
    const release = vi.fn();
    releases.push(release);
    return { url: `local-resource-${releases.length}`, release };
  });
  const update = vi.fn((state: ImageResourceState) => states.push(state));
  const controller = createImageResource({ load, createResource, update });
  return { controller, load, createResource, update, pending, signals, releases, states };
}

describe('explicit image resource lifecycle', () => {
  it('loads only after show and ignores repeated show while loading or ready', async () => {
    const f = setup();
    expect(f.load).not.toHaveBeenCalled();
    expect(f.createResource).not.toHaveBeenCalled();
    const showing = f.controller.show();
    await f.controller.show();
    expect(f.load).toHaveBeenCalledTimes(1);
    expect(f.states).toEqual([{ phase: 'loading' }]);
    f.pending[0].resolve(image);
    await showing;
    expect(f.createResource).toHaveBeenCalledWith(image);
    expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'local-resource-1' });
    await f.controller.show();
    expect(f.load).toHaveBeenCalledTimes(1);
  });

  it('aborts on hide and never allocates a resource for a late successful read', async () => {
    const f = setup();
    const showing = f.controller.show();
    f.controller.hide();
    expect(f.signals[0].aborted).toBe(true);
    f.pending[0].resolve(image);
    await showing;
    expect(f.createResource).not.toHaveBeenCalled();
    expect(f.states.at(-1)).toEqual({ phase: 'hidden' });
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps a reopened image when an older read completes with %s',
    async (completion) => {
      const f = setup();
      const old = f.controller.show();
      f.controller.hide();
      const current = f.controller.show();
      f.pending[1].resolve(image);
      await current;
      if (completion === 'resolve') f.pending[0].resolve(image);
      else f.pending[0].reject(new Error('old read'));
      await old;
      expect(f.createResource).toHaveBeenCalledTimes(1);
      expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'local-resource-1' });
      expect(f.releases[0]).not.toHaveBeenCalled();
    },
  );

  it('releases each replaced or hidden resource exactly once', async () => {
    const f = setup();
    const first = f.controller.show();
    f.pending[0].resolve(image);
    await first;
    f.controller.hide();
    f.controller.hide();
    expect(f.releases[0]).toHaveBeenCalledTimes(1);
    const second = f.controller.show();
    f.pending[1].resolve(image);
    await second;
    expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'local-resource-2' });
    f.controller.dispose();
    f.controller.dispose();
    f.controller.hide();
    expect(f.releases[0]).toHaveBeenCalledTimes(1);
    expect(f.releases[1]).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'disposal aborts and suppresses late %s, future reads and state callbacks',
    async (completion) => {
      const f = setup();
      const showing = f.controller.show();
      f.controller.dispose();
      expect(f.signals[0].aborted).toBe(true);
      const updates = f.update.mock.calls.length;
      if (completion === 'resolve') f.pending[0].resolve(image);
      else f.pending[0].reject(new Error('disposed read'));
      await showing;
      await f.controller.show();
      f.controller.hide();
      f.controller.failed();
      expect(f.createResource).not.toHaveBeenCalled();
      expect(f.load).toHaveBeenCalledTimes(1);
      expect(f.update).toHaveBeenCalledTimes(updates);
    },
  );

  it('keeps failure until an explicit retry succeeds', async () => {
    const f = setup();
    const failed = f.controller.show();
    f.pending[0].reject(new Error('read refused'));
    await failed;
    expect(f.states.at(-1)).toEqual({ phase: 'failed' });
    expect(f.load).toHaveBeenCalledTimes(1);
    const retry = f.controller.show();
    f.pending[1].resolve(image);
    await retry;
    expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'local-resource-1' });
  });

  it('turns synchronous load and resource-allocation errors into retryable failures', async () => {
    const f = setup();
    f.load.mockImplementationOnce(() => {
      throw new Error('load setup');
    });
    await f.controller.show();
    expect(f.states.at(-1)).toEqual({ phase: 'failed' });
    f.createResource.mockImplementationOnce(() => {
      throw new Error('allocation');
    });
    const failed = f.controller.show();
    f.pending[0].resolve(image);
    await failed;
    expect(f.states.at(-1)).toEqual({ phase: 'failed' });
    const retry = f.controller.show();
    f.pending[1].resolve(image);
    await retry;
    expect(f.states.at(-1)?.phase).toBe('ready');
  });

  it('releases only the current resource for decode failure and ignores stale URLs', async () => {
    const f = setup();
    const first = f.controller.show();
    f.controller.failed('local-resource-1');
    expect(f.states.at(-1)?.phase).toBe('loading');
    f.pending[0].resolve(image);
    await first;
    f.controller.failed('not-current');
    expect(f.releases[0]).not.toHaveBeenCalled();
    f.controller.failed('local-resource-1');
    f.controller.failed('local-resource-1');
    expect(f.releases[0]).toHaveBeenCalledTimes(1);
    expect(f.states.at(-1)).toEqual({ phase: 'failed' });
    const retry = f.controller.show();
    f.pending[1].resolve(image);
    await retry;
    f.controller.failed('local-resource-1');
    expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'local-resource-2' });
    expect(f.releases[1]).not.toHaveBeenCalled();
    f.controller.failed();
    expect(f.releases[1]).toHaveBeenCalledTimes(1);
    expect(f.states.at(-1)).toEqual({ phase: 'failed' });
    f.controller.hide();
    expect(f.releases[1]).toHaveBeenCalledTimes(1);
  });
});
