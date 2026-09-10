import type { Actor, Timeline } from '../domain/social';
import { iri } from '../domain/activitystreams';
import { createGuard } from './guard';
import { SessionError, toFailure, type SessionFailure, type WriteAction } from './gateway-errors';

export type SessionNotice =
  | 'published'
  | 'liked'
  | 'unliked'
  | 'shared'
  | 'unshared'
  | 'edited'
  | 'deleted'
  /** The note was already gone when the deletion was sent: done, not failed. */
  | 'already-gone';

/**
 * When the confirmation of a write is reported. A reaction or a deletion is on screen the
 * moment the server accepts it (the control flips, the card leaves), so its notice goes
 * with that. A new or edited post is only on screen once the read after the write brings
 * it back, so its notice waits for that read - and never appears when that read fails.
 */
export function noticeTiming(action: WriteAction): 'on-write' | 'after-reload' {
  switch (action) {
    case 'publish':
    case 'reply':
    case 'edit':
      return 'after-reload';
    case 'like':
    case 'unlike':
    case 'share':
    case 'unshare':
    case 'delete':
      return 'on-write';
  }
}

/** The two reads the queue asks of a gateway; the writes themselves are the caller's `perform`. */
export interface TimelineReader {
  /** The full walk of both collections: what connecting and an explicit refresh do. */
  loadTimeline(): Promise<Timeline>;
  /** The first page of each collection over `previous`; see `TimelineGateway.loadRecent`. */
  loadRecent(previous: Timeline, touched: readonly string[]): Promise<Timeline>;
}

/** The part of the session state that reads and writes move; the session adds connection state. */
export interface ReadState {
  readonly actor?: Actor;
  readonly timeline?: Timeline;
  /** ISO timestamp of the last successful timeline load, full or partial. */
  readonly loadedAt?: string;
  /**
   * ISO timestamp of the last full walk of the server's collections (connect or refresh).
   * The read after a write is partial: `loadedAt` moves, this does not, and the timeline's
   * reach still describes this read.
   */
  readonly lastFullLoadAt?: string;
  /**
   * The timeline is being read again - after a confirmed write, or on request. Nothing is
   * disabled by it: what is on screen stays usable until the newer read replaces it.
   */
  readonly refreshing: boolean;
  readonly error?: SessionFailure;
  readonly notice?: SessionNotice;
}

/** What a landed timeline puts on screen; `at` is when it landed. */
export const landed = (timeline: Timeline, at: string): Partial<ReadState> => ({
  timeline,
  actor: timeline.actor,
  loadedAt: at,
  ...(timeline.partial ? {} : { lastFullLoadAt: at }),
});

export interface WriteOptions {
  /** The confirmation to report, unless `perform` reports one of its own. */
  notice: SessionNotice;
  /** Keeps a failed read after the write in the words of the write it followed. */
  action: WriteAction;
  /** Classifies a failed POST; defaults to the gateway classification. */
  classify?: (error: unknown) => SessionFailure;
  /**
   * What the server holds differently once it accepted the write: the objects to read back,
   * and the reaction activities it removed.
   */
  changed?: { touched?: string[]; withdrawn?: string[] };
}

export interface WriteQueueHost {
  /** The session's generation: a write or a read from a session that ended lands nothing. */
  guard: ReturnType<typeof createGuard>;
  /** What is on screen now. */
  state: () => ReadState;
  /** Publishes a change to what is on screen. */
  update: (patch: Partial<ReadState>) => void;
  /** The clock a landed read is stamped with (ISO 8601). */
  now: () => string;
}

/**
 * How a read asks the server: `full` walks both collections to their end, `recent` reads
 * their first pages and lays them over what is already loaded. A recent read that fails
 * falls back to one full read before the failure is reported; without a timeline to lay
 * the pages over there is nothing to be incremental about, and the read is full.
 */
type ReadMode = 'full' | 'recent';

/**
 * Writes go out one POST at a time, in the order they were asked for, each followed by a
 * read of the timeline that only lands if nothing newer superseded it. Owns that ordering
 * and what the reads carry; the use cases that ask for writes live in the session.
 */
export function createWriteQueue(host: WriteQueueHost) {
  const { guard, state, update } = host;
  /**
   * One generation per timeline read that follows a write or a refresh request. A newer
   * write, or a newer request, starts a read of its own and the older read's result is
   * dropped: what lands on screen is always from a read that began after the last write.
   */
  const reloads = createGuard();
  /**
   * A write asked for while one is out waits for that POST alone - never for the read after
   * it - and then runs; nothing is refused for being early, and nothing on screen waits with
   * it. The first write in line starts at once, so what it clears from the screen clears now.
   */
  let queue: Promise<unknown> = Promise.resolve();
  /** Writes out or waiting their turn; while any is, a read is coming and none is needed. */
  let writes = 0;
  /**
   * The server holds something no read has brought back yet: a read that was discarded
   * for a newer write, or never started because one was waiting. The next write's read
   * covers it - and when that write fails at the POST, a read is started for it anyway, so
   * what an earlier write confirmed still lands.
   */
  let owed = false;
  /** The read in flight, if any, so a caller can wait for the screen to settle. */
  let reloading: Promise<void> = Promise.resolve();
  /**
   * Activities this session deleted and the server confirmed gone (withdrawn reactions).
   * A recent read keeps what fell off the first page, which is right for a note and wrong
   * for a row the server just removed at this client's request: those are let go here, so
   * a server that lists no activity for the removal cannot leave the reaction on screen.
   */
  let withdrawn = new Set<string>();
  /**
   * Objects the writes since the last landed read changed (edited or deleted notes). The
   * recent read reads each back; a read that lands lets go of the ones it read, so a read
   * dropped for a newer write leaves them for the read that write owes.
   */
  let touched = new Set<string>();

  async function read(
    active: TimelineReader,
    mode: ReadMode,
    live: () => boolean,
    reading: readonly string[],
  ) {
    const held = state().timeline;
    if (mode === 'recent' && held) {
      const previous = withdrawn.size
        ? { ...held, activities: held.activities.filter((a) => !withdrawn.has(iri(a) ?? '')) }
        : held;
      try {
        return await active.loadRecent(previous, reading);
      } catch {
        if (!live()) throw new Error('Superseded');
      }
    }
    return active.loadTimeline();
  }

  /**
   * Reads the timeline again in the background. Only the newest read of this session lands;
   * `onLoaded` is applied with it. A failed read is reported as `failure` - nothing already
   * on screen is touched by it, except a confirmation: a notice standing beside "could not
   * reload" would say the same thing twice, so the failure speaks alone (its words carry
   * that the write went through).
   */
  function reload(
    active: TimelineReader,
    current: number,
    onLoaded: Partial<ReadState>,
    failure: (error: unknown) => SessionFailure,
    mode: ReadMode,
  ): Promise<void> {
    const generation = reloads.next();
    owed = false;
    update({ refreshing: true });
    const landing = () => guard.isCurrent(current) && reloads.isCurrent(generation);
    const reading = [...touched];
    reloading = (async () => {
      try {
        const timeline = await read(active, mode, landing, reading);
        if (landing()) {
          // A full read is the truth about the server again: nothing it lists is let go
          // of, and nothing it did not list is owed a read back. A recent read has read
          // back what it was given; what a later write touched meanwhile stays owed.
          if (timeline.partial) for (const id of reading) touched.delete(id);
          else {
            withdrawn = new Set();
            touched = new Set();
          }
          update({
            ...landed(timeline, host.now()),
            error: undefined,
            ...onLoaded,
            refreshing: false,
          });
        }
      } catch (error) {
        if (landing()) update({ error: failure(error), refreshing: false, notice: undefined });
      }
    })();
    return reloading;
  }

  return {
    /**
     * Runs a confirmed outbox write, then reads the timeline again. The returned promise
     * settles with the write itself: fulfilled once the server accepted it, whatever the
     * read after it does. That read runs in the background (`settled()` waits for it); a
     * newer write may begin during it, in which case its result is dropped and the newer
     * write's own read lands instead. `perform` may return a notice of its own when what
     * happened is not what was asked for (an already deleted note). A write that was still
     * waiting when the session ended is refused as `not-connected`: nothing is sent for it,
     * and it is not reported as sent either. What `changed` names is recorded only for a
     * session that is still this one.
     */
    enqueue(
      active: TimelineReader,
      perform: () => Promise<SessionNotice | void>,
      { notice, action, classify = toFailure, changed = {} }: WriteOptions,
    ): Promise<void> {
      const current = guard.current();
      const turn = writes++ === 0 ? run() : queue.then(run, run);
      queue = turn.catch(() => undefined);
      return turn;

      async function run() {
        try {
          // Disconnected, or reconnected, while waiting: this write belongs to a session
          // that is over. The composer that asked keeps its draft.
          if (!guard.isCurrent(current)) throw new SessionError({ kind: 'not-connected' });
          // A read still in flight from the last write or refresh is now stale: this write
          // makes the state it would land older than what the server holds.
          if (state().refreshing) {
            reloads.next();
            owed = true;
          }
          update({ refreshing: false, notice: undefined, error: undefined });
          await send();
        } finally {
          writes--;
        }
      }
      async function send() {
        let done: SessionNotice | void;
        try {
          done = await perform();
        } catch (error) {
          const failure = classify(error);
          if (guard.isCurrent(current)) {
            update({ error: failure });
            // An earlier write's read was dropped for this one: it is read again now, and
            // the failure of this write stays on screen over what that read brings.
            if (owed && writes === 1)
              void reload(active, current, { error: failure }, () => failure, 'recent');
          }
          throw new SessionError(failure);
        }
        if (!guard.isCurrent(current)) return;
        for (const id of changed.touched ?? []) touched.add(id);
        for (const id of changed.withdrawn ?? []) withdrawn.add(id);
        const confirmed = done ?? notice;
        const timing = noticeTiming(action);
        if (timing === 'on-write') update({ notice: confirmed });
        // A write is already waiting: its read will be newer than one started now.
        if (writes > 1) {
          owed = true;
          return;
        }
        // The read after a write is incremental: the first pages hold what was just written.
        void reload(
          active,
          current,
          timing === 'after-reload' ? { notice: confirmed } : {},
          () => ({ kind: 'reload-failed', action }),
          'recent',
        );
      }
    },
    /** The full walk on request; resolves once it has settled. Yields to a write that begins meanwhile. */
    refresh(active: TimelineReader, current: number): Promise<void> {
      return reload(active, current, {}, toFailure, 'full');
    },
    /** A POST is out or waiting; its own read follows, so no read need be asked for. */
    writing: () => writes > 0,
    /** Resolves once no timeline read is in flight; for callers that wait for the screen to settle. */
    async settled() {
      let waited: Promise<void> | undefined;
      while (waited !== reloading) {
        waited = reloading;
        await waited;
      }
    },
    /**
     * Forgets what was recorded for a session that is over: the reactions let go of and the
     * objects to read back. A read still owed is forgotten too when `owed` is set - on
     * disconnect, where nothing follows it.
     */
    reset(options: { owed?: boolean } = {}) {
      withdrawn = new Set();
      touched = new Set();
      if (options.owed) owed = false;
    },
  };
}

export type WriteQueue = ReturnType<typeof createWriteQueue>;
