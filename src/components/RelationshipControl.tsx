import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import type { RelationshipState } from '../application/relationship-types';
import { relationshipProjection } from '../presentation/relationships';
import { relationshipCopy as copy } from '../presentation/copy-relationships';

export default function RelationshipControl(props: {
  target: string;
  state?: RelationshipState;
  self?: string;
  demo: boolean;
  onFollow: (target: string) => Promise<void>;
  onUnfollow: (target: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const projection = () =>
    relationshipProjection(props.target, props.state, props.self, props.demo);
  const [localError, setLocalError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let generation = 0;
  createEffect(
    () => JSON.stringify([props.self, props.target]),
    (key, previous) => {
      if (key === previous) return;
      generation++;
      setLocalError('');
      setBusy(false);
    },
  );
  onCleanup(() => {
    generation++;
  });
  async function act(action: () => Promise<void>) {
    if (busy()) return;
    const current = generation;
    setBusy(true);
    setLocalError('');
    try {
      await action();
    } catch {
      if (current === generation) setLocalError(copy.operationFailed);
    } finally {
      if (current === generation) setBusy(false);
    }
  }
  return (
    <div class="relationship-control">
      <p class="relationship-address">{props.target}</p>
      <p class="relationship-status" role="status">
        {projection().label}
      </p>
      <Show when={projection().help}>
        <p class="relationship-help">{projection().help}</p>
      </Show>
      <Show when={projection().error || localError()}>
        <p class="relationship-error" role="alert">
          {projection().error || localError()}
        </p>
      </Show>
      <div class="relationship-actions">
        <Show when={projection().canFollow}>
          <button
            type="button"
            class="secondary-button"
            disabled={busy()}
            onClick={() => {
              if (projection().canFollow) void act(() => props.onFollow(props.target));
            }}
          >
            {copy.follow}
          </button>
        </Show>
        <Show when={projection().canUnfollow}>
          <button
            type="button"
            class="quiet-button"
            disabled={busy()}
            onClick={() => {
              if (projection().canUnfollow) void act(() => props.onUnfollow(props.target));
            }}
          >
            {projection().status === 'following' ? copy.unfollow : copy.withdraw}
          </button>
        </Show>
        <Show
          when={
            !props.demo &&
            !projection().canFollow &&
            !projection().canUnfollow &&
            props.target !== props.self
          }
        >
          <button
            type="button"
            class="quiet-button"
            disabled={
              busy() ||
              props.state?.phase === 'loading' ||
              Object.keys(props.state?.pending ?? {}).length > 0
            }
            onClick={() => void act(props.onRefresh)}
          >
            {copy.refresh}
          </button>
        </Show>
      </div>
    </div>
  );
}
