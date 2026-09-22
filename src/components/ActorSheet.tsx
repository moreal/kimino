import type { JSX } from '@solidjs/web';
import { relationshipCopy } from '../presentation/copy-relationships';
import { createEffect, Show } from 'solid-js';
import { copy } from '../presentation/copy';
import { readingCopy } from '../presentation/copy-reading';
import type { ActorProfile } from '../presentation/note-display';
import Icon from './Icons';
import { restoreFocus } from './shortcuts';

/**
 * A small in-app sheet about one author, built only from what the loaded timeline says:
 * handle, server, how many of their notes are loaded, a link to the profile on its server,
 * and local include/hide reading controls. Hiding is not server-side blocking.
 */
export default function ActorSheet(props: {
  profile?: ActorProfile;
  relationship?: JSX.Element;
  onPeople?: () => void;
  onClose: () => void;
  onFilter: (id: string) => void;
  onHide?: (id: string) => void;
  demo?: boolean;
  /** Given for the connected account only: the sheet is where it disconnects. */
  onDisconnect?: () => void;
  disconnectLabel?: string;
}) {
  let dialog: HTMLDialogElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  createEffect(
    () => !!props.profile,
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
      class="shortcuts-dialog actor-sheet"
      role="dialog"
      aria-labelledby="actor-sheet-heading"
      ref={(el) => (dialog = el)}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <Show when={props.profile}>
        {(profile) => (
          <div class="actor-sheet-body">
            <header class="shortcuts-header">
              <div class="actor-sheet-title">
                <span class="eyebrow">{copy.actor.heading}</span>
                {/* The same two labels the card carries: the name, then the address. */}
                <h2 id="actor-sheet-heading">{profile().name}</h2>
                <Show when={profile().handle}>
                  {(handle) => <p class="actor-handle">{handle()}</p>}
                </Show>
              </div>
              <button
                type="button"
                class="icon-button"
                aria-label={copy.actor.close}
                onClick={props.onClose}
                ref={(el) => (closeButton = el)}
              >
                <Icon name="close" />
              </button>
            </header>
            <dl class="actor-facts">
              <Show when={profile().host}>
                <div>
                  <dt>{copy.actor.server}</dt>
                  <dd>{profile().host}</dd>
                </div>
              </Show>
              <div>
                <dt>{copy.actor.loaded(profile().loaded)}</dt>
                <dd class="actor-facts-scope">{copy.actor.filterScope}</dd>
              </div>
            </dl>
            {props.relationship}
            <Show when={props.onPeople}>
              <button type="button" class="text-button actor-people-link" onClick={props.onPeople}>
                {relationshipCopy.open}
              </button>
            </Show>
            <div class="actor-sheet-actions">
              <button
                type="button"
                class="secondary-button"
                onClick={() => props.onFilter(profile().id)}
              >
                <Icon name="filter" class="icon--sm" />
                {copy.actor.filter}
              </button>
              <Show when={props.onDisconnect}>
                <button
                  type="button"
                  class="secondary-button actor-sheet-disconnect"
                  onClick={props.onDisconnect}
                >
                  <Icon name="log-out" class="icon--sm" />
                  {props.disconnectLabel}
                </button>
              </Show>
              <Show when={profile().url}>
                <a
                  class="actor-sheet-link"
                  href={profile().url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.actor.viewOnServer}
                  <Icon name="external" class="icon--sm icon--trail" />
                </a>
              </Show>
            </div>
            <Show when={props.onHide}>
              <div class="actor-reading-control">
                <button
                  type="button"
                  class="secondary-button"
                  onClick={() => props.onHide?.(profile().id)}
                >
                  <Icon name="filter" class="icon--sm" />
                  {readingCopy.hide}
                </button>
                <p class="reading-scope">{readingCopy.scope}</p>
                <Show when={props.demo}>
                  <p class="reading-scope">{readingCopy.demoScope}</p>
                </Show>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </dialog>
  );
}
