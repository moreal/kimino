import { createSignal, Show } from 'solid-js';
import { connectionCopy as text } from '../presentation/copy';
import Icon from './Icons';

/**
 * One line under the header, right after a connect that left the token in memory: this
 * session ends on reload, and the connect form has an option that would keep it in this tab.
 * It is a reminder, not a prompt - it changes nothing, stores nothing either way, and it is
 * offered at most once per page session so it can be dismissed for good. On a phone the
 * sentence is clipped to one line until 자세히 opens it (the control is hidden elsewhere).
 */
export default function SessionHint(props: { shown: boolean; onDismiss: () => void }) {
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={props.shown}>
      <div class={open() ? 'session-hint session-hint--open' : 'session-hint'}>
        <Icon name="lock" class="icon--sm" />
        <p id="session-hint-text">{text.sessionHint}</p>
        <button
          type="button"
          class="text-button session-hint-more"
          aria-expanded={open() ? 'true' : 'false'}
          aria-controls="session-hint-text"
          onClick={() => setOpen((value) => !value)}
        >
          {open() ? text.sessionHintLess : text.sessionHintMore}
        </button>
        <button
          type="button"
          class="icon-button session-hint-dismiss"
          aria-label={text.sessionHintDismiss}
          title={text.sessionHintDismiss}
          onClick={props.onDismiss}
        >
          <Icon name="close" class="icon--sm" />
        </button>
      </div>
    </Show>
  );
}
