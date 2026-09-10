import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRoot, flush } from 'solid-js';
import { useClock } from './clock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

it('ticks once a minute while a component uses it and stops after the last one is disposed', () => {
  const start = Date.now();
  createRoot((dispose) => {
    const now = useClock();
    // No synchronous write during setup (Solid 2 forbids it); the value is just a timestamp.
    expect(typeof now()).toBe('number');
    vi.advanceTimersByTime(60_000);
    flush();
    expect(now()).toBe(start + 60_000);
    dispose();
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('shares one interval between users and keeps it while any user remains', () => {
  const disposeFirst = createRoot((dispose) => {
    useClock();
    return dispose;
  });
  const disposeSecond = createRoot((dispose) => {
    useClock();
    return dispose;
  });
  expect(vi.getTimerCount()).toBe(1);
  disposeFirst();
  expect(vi.getTimerCount()).toBe(1);
  disposeSecond();
  expect(vi.getTimerCount()).toBe(0);
});
