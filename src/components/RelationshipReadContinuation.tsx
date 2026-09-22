import { Show } from 'solid-js';
import type { CollectionReadProgress } from '../application/collection-read';
import { relationshipCopy as copy } from '../presentation/copy-relationships';

/** The application retains traversal and controls whether a write has started. */
export default function RelationshipReadContinuation(props: {
  progress: CollectionReadProgress;
  purpose?: 'refresh' | 'follow' | 'unfollow';
  target?: string;
  onContinue: () => unknown;
  onCancel: () => void;
}) {
  const progress = () => props.progress;
  const collection = () => {
    const name = progress().collection;
    return name ? copy.readCollections[name] : copy.heading;
  };
  const act = (element: HTMLButtonElement, action: () => unknown) => {
    const container = element.closest<HTMLElement>('dialog, main');
    action();
    container?.focus({ preventScroll: true });
  };
  return (
    <section class="relationship-read-continuation" aria-label={copy.readMoreHeading}>
      <h3>{copy.readMoreHeading}</h3>
      <Show when={props.purpose !== 'refresh' && props.target}>
        <p class="relationship-address">
          <strong>{props.purpose === 'follow' ? copy.readFollowTarget : copy.readTarget}</strong>{' '}
          {props.target}
        </p>
      </Show>
      <p role="status">{copy.readMoreProgress(collection(), progress().pages, progress().items)}</p>
      <p>
        {props.purpose === 'unfollow'
          ? copy.readUnfollowHelp
          : props.purpose === 'follow'
            ? copy.readFollowHelp
            : copy.readMoreHelp}
      </p>
      <div class="relationship-read-actions">
        <button
          type="button"
          class="primary-button"
          onClick={(event) => act(event.currentTarget, props.onContinue)}
        >
          {copy.continueReading}
        </button>
        <button
          type="button"
          class="secondary-button"
          onClick={(event) => act(event.currentTarget, props.onCancel)}
        >
          {copy.cancelReading}
        </button>
      </div>
    </section>
  );
}
