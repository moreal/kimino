import { createEffect, For, onCleanup, Show } from 'solid-js';
import { copy } from '../presentation/copy';
import { shortcutRows, type ShortcutAction } from '../presentation/keyboard';
import Icon from './Icons';
import { restoreFocus } from './shortcuts';

/** The shortcut list as a small dialog: `?` or the sidebar button opens it, Escape closes it. */
/** The rows list j/k as one action, so 'previous' has no line of its own. */
const actionCopy: Partial<Record<ShortcutAction, string>> = copy.shortcuts.actions;

export default function ShortcutsDialog(props: { open: boolean; onClose: () => void }) {
  let closeButton: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  createEffect(
    () => props.open,
    (open, wasOpen) => {
      if (open) {
        opener = document.activeElement;
        queueMicrotask(() => closeButton?.focus());
      } else if (wasOpen) restoreFocus(opener);
    },
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (props.open && event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  return (
    <Show when={props.open}>
      <div class="shortcuts-backdrop" onClick={props.onClose}>
        <section
          class="shortcuts-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-heading"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="shortcuts-header">
            <h2 id="shortcuts-heading">{copy.shortcuts.heading}</h2>
            <button
              type="button"
              class="icon-button"
              aria-label={copy.shortcuts.close}
              onClick={props.onClose}
              ref={(el) => (closeButton = el)}
            >
              <Icon name="close" />
            </button>
          </header>
          <p class="shortcuts-hint">{copy.shortcuts.hint}</p>
          <p class="shortcuts-hint">{copy.shortcuts.threadHint}</p>
          <dl class="shortcuts-list">
            <For each={shortcutRows}>
              {(row) => (
                <div class="shortcut-row">
                  <dt>
                    <For each={row.keys}>{(key) => <kbd>{key}</kbd>}</For>
                  </dt>
                  <dd>{actionCopy[row.action]}</dd>
                </div>
              )}
            </For>
          </dl>
        </section>
      </div>
    </Show>
  );
}
