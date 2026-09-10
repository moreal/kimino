import { expect, it } from 'vitest';
import { createGuard } from './guard';

it('treats work started before next() as stale', () => {
  const guard = createGuard();
  const started = guard.current();
  expect(guard.isCurrent(started)).toBe(true);
  expect(guard.next()).toBe(started + 1);
  expect(guard.isCurrent(started)).toBe(false);
  expect(guard.isCurrent(guard.current())).toBe(true);
});
