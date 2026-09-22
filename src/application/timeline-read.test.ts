import { expect, it, vi } from 'vitest';
import {
  createTimelineReadController,
  TimelineReadCancelled,
  type TimelineReadProgress,
} from './timeline-read';

it('does not overwrite a newer run started while clearing the previous budget', async () => {
  let visible: TimelineReadProgress | undefined;
  let replaceOnClear = false;
  let replacement: Promise<string> | undefined;
  const replacementBudget = { pages: 200, items: 4000 };
  const reads = createTimelineReadController((progress) => {
    visible = progress;
    if (progress === undefined && replaceOnClear) {
      replaceOnClear = false;
      replacement = reads.run(
        async (options) => {
          await options.onReadBudget!(replacementBudget);
          return 'replacement';
        },
        () => true,
      );
    }
  });
  const first = reads.run(
    async (options) => {
      await options.onReadBudget!({ pages: 100, items: 2000 });
      return 'first';
    },
    () => true,
  );
  const firstResult = first.catch((error: unknown) => error);
  replaceOnClear = true;
  const attemptedRead = vi.fn(async () => 'superseded');
  const superseded = reads.run(attemptedRead, () => true);
  const supersededResult = superseded.catch((error: unknown) => error);
  expect(attemptedRead).not.toHaveBeenCalled();
  expect(visible).toEqual(replacementBudget);
  expect(reads.continueReading()).toBe(true);
  await expect(replacement).resolves.toBe('replacement');
  expect(await firstResult).toBeInstanceOf(TimelineReadCancelled);
  expect(await supersededResult).toBeInstanceOf(TimelineReadCancelled);
  expect(visible).toBeUndefined();
});

it('does not hide a replacement gate published by an abort listener', async () => {
  let visible: TimelineReadProgress | undefined;
  let replacement: Promise<string> | undefined;
  const replacementBudget = { pages: 300, items: 6000 };
  const reads = createTimelineReadController((progress) => {
    visible = progress;
  });
  const first = reads.run(
    async (options) => {
      options.signal!.addEventListener(
        'abort',
        () => {
          replacement = reads.run(
            async (next) => {
              await next.onReadBudget!(replacementBudget);
              return 'replacement';
            },
            () => true,
          );
        },
        { once: true },
      );
      await options.onReadBudget!({ pages: 100, items: 2000 });
      return 'first';
    },
    () => true,
  );
  const firstResult = first.catch((error: unknown) => error);
  reads.cancel();
  expect(visible).toEqual(replacementBudget);
  expect(reads.continueReading()).toBe(true);
  await expect(replacement).resolves.toBe('replacement');
  expect(await firstResult).toBeInstanceOf(TimelineReadCancelled);
  expect(visible).toBeUndefined();
});
