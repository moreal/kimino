import { createEffect, For } from 'solid-js';
import { copy } from '../presentation/copy';
import { shortcutRows, type ShortcutAction } from '../presentation/keyboard';
import Icon from './Icons';
import { restoreFocus } from './shortcuts';

/** The shortcut list as a small dialog: `?` or the sidebar button opens it, Escape closes it. */
/** The rows list j/k as one action, so 'previous' has no line of its own. */
const actionCopy: Partial<Record<ShortcutAction, string>> = copy.shortcuts.actions;

export default function ShortcutsDialog(props: { open: boolean; onClose: () => void }) {
  let dialog: HTMLDialogElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  createEffect(
    () => props.open,
    (open) => {
      if (!dialog) return;
      if (open && !dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
        closeButton?.focus();
      } else if (!open && dialog.open) {
        dialog.close();
        restoreFocus(opener);
      }
    },
  );
  return (
    <dialog
      class="shortcuts-dialog"
      role="dialog"
      aria-labelledby="shortcuts-heading"
      ref={(element) => (dialog = element)}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          props.onClose();
      }}
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
    </dialog>
  );
}
