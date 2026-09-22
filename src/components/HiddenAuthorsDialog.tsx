import { createEffect, For, Show } from 'solid-js';
import type { ActorProfile } from '../presentation/note-display';
import { readingCopy } from '../presentation/copy-reading';
import Icon from './Icons';
import { restoreFocus } from './shortcuts';

/** Native modal containment keeps keyboard focus out of the reading surface. */
export default function HiddenAuthorsDialog(props: {
  open: boolean;
  authors: readonly ActorProfile[];
  demo: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
}) {
  let dialog: HTMLDialogElement | undefined;
  let close: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  createEffect(
    () => props.open,
    (open) => {
      if (!dialog) return;
      if (open && !dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
        close?.focus();
      } else if (!open && dialog.open) {
        dialog.close();
        restoreFocus(opener);
      }
    },
  );
  return (
    <dialog
      class="reading-dialog"
      role="dialog"
      aria-labelledby="hidden-authors-heading"
      aria-describedby="hidden-authors-scope"
      ref={(el) => (dialog = el)}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class="reading-dialog-body">
        <header class="shortcuts-header">
          <h2 id="hidden-authors-heading">{readingCopy.heading}</h2>
          <button
            class="icon-button"
            type="button"
            aria-label={readingCopy.close}
            ref={(el) => (close = el)}
            onClick={props.onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <p id="hidden-authors-scope" class="reading-scope">
          {readingCopy.scope}
        </p>
        <p class="reading-scope">{readingCopy.unloadedScope}</p>
        <Show when={props.demo}>
          <p class="reading-scope">{readingCopy.demoScope}</p>
        </Show>
        <Show
          when={props.authors.length}
          fallback={
            <p class="reading-empty" role="status">
              {readingCopy.empty}
            </p>
          }
        >
          <ul class="hidden-authors-list">
            {/* Profile values change on reload; stable IDs preserve the focused row. */}
            <For each={props.authors} keyed={(author) => author.id}>
              {(author) => (
                <li>
                  <span class="hidden-author-identity">
                    <strong>{author().name}</strong>
                    <Show when={author().handle}>
                      <span>{author().handle}</span>
                    </Show>
                  </span>
                  <button
                    class="secondary-button"
                    type="button"
                    onClick={() => {
                      props.onRestore(author().id);
                      // The row that held focus is removed; keep focus inside the modal.
                      queueMicrotask(() => close?.focus());
                    }}
                  >
                    {readingCopy.restore(author().name)}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </dialog>
  );
}
