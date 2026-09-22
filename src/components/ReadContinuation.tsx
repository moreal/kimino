import { onCleanup } from 'solid-js';
import { historyCopy as text } from '../presentation/copy-history';

/** Only counts cross this boundary; the application owns the pending read. */
export default function ReadContinuation(props: {
  progress: { pages: number; items: number };
  refreshing: boolean;
  onContinue: () => unknown;
  onCancel: () => void;
}) {
  let focusFrame: number | undefined;
  onCleanup(() => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
  });
  const act = (element: HTMLButtonElement, action: () => unknown) => {
    const main = element.closest<HTMLElement>('main');
    action();
    main?.focus({ preventScroll: true });
  };
  return (
    <section class="read-continuation" aria-labelledby="history-heading">
      <h2 id="history-heading">{text.heading}</h2>
      <p role="status">{text.progress(props.progress.pages, props.progress.items)}</p>
      <p>{props.refreshing ? text.refresh : text.initial}</p>
      <div class="read-continuation-actions">
        <button
          type="button"
          class="primary-button"
          ref={(element) => {
            focusFrame = requestAnimationFrame(() => {
              if (!props.refreshing && element.isConnected) element.focus();
            });
          }}
          onClick={(event) => act(event.currentTarget, props.onContinue)}
        >
          {text.continue}
        </button>
        <button
          type="button"
          class="secondary-button"
          onClick={(event) => act(event.currentTarget, props.onCancel)}
        >
          {text.cancel}
        </button>
      </div>
    </section>
  );
}
