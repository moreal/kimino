import type { Actor, ReactionKind, Timeline, TimelineNote } from '../domain/social';

/** Transport boundary: a fulfilled publish means the server accepted the write. */
export interface TimelineGateway {
  loadTimeline(): Promise<Timeline>;
  publishNote(text: string, replyTo?: TimelineNote): Promise<unknown>;
  /** POST a Like or Announce for `note` to the outbox. Servers may return no Location. */
  react(kind: ReactionKind, note: TimelineNote): Promise<unknown>;
  /** POST an Undo of one of this actor's own reaction activities. */
  undoReaction(activity: string): Promise<unknown>;
  /** True for read-only sample content that never reaches a server. */
  readonly demo?: boolean;
}
export interface ConnectionCredentials {
  actorUrl: string;
  token?: string;
}
export type TimelineGatewayFactory = (
  options: ConnectionCredentials & { signal: AbortSignal },
) => TimelineGateway;
export interface SocialSessionSnapshot {
  readonly actor?: Actor;
  readonly timeline?: Timeline;
  /** Read-only sample mode: writes are impossible, nothing is persisted. */
  readonly demo: boolean;
  /** ISO timestamp of the last successful timeline load. */
  readonly loadedAt?: string;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
}

const emptySnapshot = (): SocialSessionSnapshot => ({
  actor: undefined,
  timeline: undefined,
  demo: false,
  loadedAt: undefined,
  busy: false,
  error: '',
  notice: '',
});

const RELOAD_FAILED = '게시되었지만 타임라인을 다시 불러오지 못했습니다. 새로고침을 눌러주세요.';
const UNDO_REJECTED =
  '서버가 취소 요청을 거절했습니다. 이 서버는 좋아요/공유 취소를 지원하지 않을 수 있어요.';
const reactionNotice: Record<ReactionKind, Record<'on' | 'off', string>> = {
  like: { on: '좋아요를 남겼습니다.', off: '좋아요를 취소했습니다.' },
  share: { on: '공유했습니다.', off: '공유를 취소했습니다.' },
};

/** Owns use-case ordering and cancellation, independent of rendering and transport. */
export function createSocialSession(createGateway: TimelineGatewayFactory) {
  let snapshot = emptySnapshot();
  const listeners = new Set<(snapshot: SocialSessionSnapshot) => void>();
  let gateway: TimelineGateway | undefined;
  let cancellation: AbortController | undefined;
  let generation = 0;
  let operation = false;

  function update(patch: Partial<SocialSessionSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }

  function finish(current: number) {
    if (current !== generation) return;
    operation = false;
    update({ busy: false });
  }

  const loaded = (timeline: Timeline) => ({
    timeline,
    actor: timeline.actor,
    loadedAt: new Date().toISOString(),
  });

  /**
   * Runs a confirmed outbox write, then reloads. A fulfilled write stays successful even
   * when the follow-up read fails; only the write itself rejects.
   */
  async function write(
    perform: (active: TimelineGateway) => Promise<unknown>,
    notice: string,
    describe: (error: unknown) => string = errorMessage,
  ) {
    if (!gateway) throw new Error('인스턴스에 먼저 연결해주세요.');
    if (operation) throw new Error('진행 중인 요청이 끝나면 다시 게시해주세요.');
    const active = gateway;
    const current = generation;
    operation = true;
    update({ busy: true, notice: '', error: '' });
    try {
      await perform(active);
      if (current !== generation) return;
      update({ notice });
      try {
        const timeline = await active.loadTimeline();
        if (current === generation) update({ ...loaded(timeline), error: '' });
      } catch {
        if (current === generation) update({ error: RELOAD_FAILED });
      }
    } catch (error) {
      const message = describe(error);
      if (current === generation) update({ error: message });
      throw new Error(message);
    } finally {
      finish(current);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: (snapshot: SocialSessionSnapshot) => void) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    async connect(credentials: ConnectionCredentials) {
      if (operation) return;
      const current = ++generation;
      operation = true;
      cancellation?.abort();
      cancellation = new AbortController();
      gateway = undefined;
      update({ ...emptySnapshot(), busy: true });
      try {
        const next = createGateway({
          actorUrl: credentials.actorUrl.trim(),
          token: credentials.token?.trim(),
          signal: cancellation.signal,
        });
        const timeline = await next.loadTimeline();
        if (current !== generation) return;
        gateway = next;
        update({ ...loaded(timeline), demo: next.demo === true });
      } catch (error) {
        if (current === generation) update({ error: errorMessage(error) });
      } finally {
        finish(current);
      }
    },
    async refresh() {
      if (!gateway || operation) return;
      const active = gateway;
      const current = generation;
      operation = true;
      update({ busy: true, error: '', notice: '' });
      try {
        const timeline = await active.loadTimeline();
        if (current === generation) update(loaded(timeline));
      } catch (error) {
        if (current === generation) update({ error: errorMessage(error) });
      } finally {
        finish(current);
      }
    },
    publish(text: string, replyTo?: TimelineNote) {
      return write((active) => active.publishNote(text, replyTo), '게시되었습니다.');
    },
    /**
     * Like/share (`active`) or withdraw this actor's own reaction (`!active`).
     * Servers without Undo support reject the withdrawal; that surfaces as a plain error.
     */
    react(note: TimelineNote, kind: ReactionKind, active: boolean) {
      const self = snapshot.actor?.id;
      const own = note.reactions.find((r) => r.kind === kind && r.actor === self);
      if (!active && gateway && !own)
        return Promise.reject(
          new Error('취소할 좋아요/공유를 찾지 못했습니다. 새로고침 후 다시 시도해주세요.'),
        );
      return write(
        (gateway) => (active ? gateway.react(kind, note) : gateway.undoReaction(own!.activity)),
        reactionNotice[kind][active ? 'on' : 'off'],
        active
          ? errorMessage
          : (error) => {
              // Transport errors carry a typed HTTP status; anything else (network, abort) passes through.
              const status = (error as { status?: unknown })?.status;
              return typeof status === 'number'
                ? `${UNDO_REJECTED} (${status})`
                : errorMessage(error);
            },
      );
    },
    disconnect() {
      cancellation?.abort();
      cancellation = undefined;
      generation++;
      gateway = undefined;
      operation = false;
      update(emptySnapshot());
    },
  };
}

export type SocialSession = ReturnType<typeof createSocialSession>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다. 다시 시도해주세요.';
}
