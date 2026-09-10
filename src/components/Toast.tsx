import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { copy } from '../presentation/copy';
import Icon from './Icons';

const VISIBLE_MS = 3000;

/**
 * Transient success feedback. On a phone it takes the tab bar's band for its three seconds
 * (full width, the same height, the whole band dismisses it), so it never stands over a
 * card's controls; on a mid-width window it is a pill fixed at the bottom edge that lets
 * taps through everywhere but its own close control; on the desktop layout the shell places
 * it at the foot of the right column, in flow, so it never stands over the reading column
 * or the end of a long thread. Polite live announcement, auto-clears after three seconds,
 * dismissible. A new `id` re-shows an identical message.
 */
export default function Toast(props: { message: string; id: number }) {
  const [shown, setShown] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    clearTimeout(timer);
    setShown('');
  };
  // Only a change after mount is a notice. The shell mounts a second copy of this when the
  // layout crosses the desktop width, and that copy must not replay the last notice.
  createEffect(
    () => [props.message, props.id] as const,
    ([message], previous) => {
      if (previous === undefined) return;
      clearTimeout(timer);
      setShown(message);
      if (!message) return;
      timer = setTimeout(() => setShown(''), VISIBLE_MS);
    },
  );
  onCleanup(() => clearTimeout(timer));
  return (
    /* On a phone the whole band takes the tap and dismisses (the button is the same action
       for the keyboard); elsewhere the region lets pointer events through and the click
       never lands here. */
    <div class="toast-region" onClick={hide}>
      <div role="status" aria-live="polite" class={shown() ? 'toast' : 'sr-only'}>
        {shown()}
      </div>
      <Show when={shown()}>
        <button type="button" class="toast-dismiss" aria-label={copy.dismiss} onClick={hide}>
          <Icon name="close" class="icon--sm" />
        </button>
      </Show>
    </div>
  );
}
