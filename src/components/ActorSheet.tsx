import { createEffect, onCleanup, Show } from 'solid-js';
import { copy } from '../presentation/copy';
import type { ActorProfile } from '../presentation/note-display';
import Icon from './Icons';
import { restoreFocus } from './shortcuts';

/**
 * A small in-app sheet about one author, built only from what the loaded timeline says:
 * handle, server, how many of their notes are loaded, a link to the profile on its server,
 * and a client-side "only this person" filter. No follower counts, no follow/mute/block:
 * this client has none of those.
 */
export default function ActorSheet(props: {
  profile?: ActorProfile;
  onClose: () => void;
  onFilter: (id: string) => void;
  /** Given for the connected account only: the sheet is where it disconnects. */
  onDisconnect?: () => void;
  disconnectLabel?: string;
}) {
  let closeButton: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  createEffect(
    () => !!props.profile,
    (open, wasOpen) => {
      if (open) {
        opener = document.activeElement;
        queueMicrotask(() => closeButton?.focus());
      } else if (wasOpen) restoreFocus(opener);
    },
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (props.profile && event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  return (
    <Show when={props.profile}>
      {(profile) => (
        <div class="shortcuts-backdrop" onClick={props.onClose}>
          <section
            class="shortcuts-dialog actor-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="actor-sheet-heading"
            onClick={(event) => event.stopPropagation()}
          >
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
          </section>
        </div>
      )}
    </Show>
  );
}
