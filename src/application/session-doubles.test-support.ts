import { vi } from 'vitest';
import { createSocialSession, type TimelineGateway } from './social-session';
import type { NoteDraft, Timeline, TimelineNote } from '../domain/social';

/** A deterministic clock: one second later at every reading, from `start`. */
export function clock(start = Date.UTC(2026, 8, 9, 1, 2, 3)) {
  let readings = 0;
  return () => new Date(start + 1000 * readings++).toISOString();
}
/** A session over `create` with a deterministic clock, so `loadedAt` is never wall time. */
export const createSession = (
  create: Parameters<typeof createSocialSession>[0],
  now: () => string = clock(),
) => createSocialSession(create, { now });

export const credentials = { actorUrl: 'https://example.test/me', token: 'secret' };
export const timeline = (id = credentials.actorUrl): Timeline => ({
  actor: { id, inbox: `${id}/inbox`, outbox: `${id}/outbox` },
  notes: [],
  diagnostics: { ignored: 0, rejected: 0 },
  activities: [],
  deleted: [],
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
/**
 * The read after a write goes through `loadRecent`; this double answers it with whatever
 * `loadTimeline` currently answers, so a test that controls "the read after the write"
 * controls one function. Tests about the two reads themselves replace `loadRecent`.
 */
export function gateway(): TimelineGateway {
  const double: TimelineGateway = {
    loadTimeline: vi.fn().mockResolvedValue(timeline()),
    loadRecent: vi.fn(() => double.loadTimeline()),
    publishNote: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    withdrawReaction: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    noteExists: vi.fn().mockResolvedValue(true),
    updateNote: vi.fn().mockResolvedValue(undefined),
  };
  return double;
}
export const post = (
  content: string,
  visibility: NoteDraft['visibility'] = 'public',
): NoteDraft => ({
  content,
  visibility,
});
export const note = (extra: Partial<TimelineNote> = {}): TimelineNote => ({
  id: 'https://example.test/note',
  author: 'https://other.test/them',
  content: 'parent',
  visibility: 'public',
  attachments: [],
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
  ...extra,
});
