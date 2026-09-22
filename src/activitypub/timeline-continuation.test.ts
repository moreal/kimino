import { expect, it } from 'vitest';
import { ActivityPubClient } from './client';

const actor = 'https://social.test/alice';
const note = `${actor}/note`;
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/activity+json' } });

it('continues a full timeline without publishing a partial result or repeating pages', async () => {
  const reads: string[] = [];
  const budgets: number[] = [];
  const client = new ActivityPubClient({
    actorUrl: actor,
    maxPages: 1,
    fetch: async (input) => {
      const url = String(input);
      reads.push(url);
      if (url === actor)
        return response({ id: actor, inbox: `${actor}/inbox`, outbox: `${actor}/outbox` });
      if (url.endsWith('/inbox')) return response({ type: 'OrderedCollection', items: [] });
      if (url.endsWith('/outbox'))
        return response({
          type: 'OrderedCollection',
          items: [
            {
              type: 'Create',
              id: `${actor}/create`,
              actor,
              object: { type: 'Note', id: note, attributedTo: actor, content: 'complete only' },
            },
          ],
          next: `${actor}/last`,
        });
      return response({ type: 'OrderedCollectionPage', items: [] });
    },
  });
  const timeline = await client.loadTimeline({
    onReadBudget: async ({ pages }) => {
      budgets.push(pages);
    },
  });
  expect(timeline.notes).toHaveLength(1);
  expect(budgets).toEqual([1]);
  expect(reads).toEqual([actor, `${actor}/inbox`, `${actor}/outbox`, `${actor}/last`]);
});

it('aborting a full-read fetch does not abort a later request on the same client', async () => {
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const client = new ActivityPubClient({
    actorUrl: actor,
    fetch: async (input, init) => {
      if (String(input) === actor) {
        signal = init?.signal ?? undefined;
        started();
        return new Promise<Response>((_, reject) =>
          signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }),
        );
      }
      expect(init?.signal?.aborted).toBe(false);
      return response({ id: note, type: 'Note', attributedTo: actor });
    },
  });
  const cancellation = new AbortController();
  const read = client.loadTimeline({ signal: cancellation.signal });
  const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
  await ready;
  cancellation.abort();
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(await client.noteExists({ id: note } as Parameters<typeof client.noteExists>[0])).toBe(
    true,
  );
});
