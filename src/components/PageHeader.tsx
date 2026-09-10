import { Show } from 'solid-js';
import type { FeedState } from '../presentation/feed-view-model';
import { actorLabelOf } from '../presentation/actor-name';
import { copy } from '../presentation/copy';
import FailureAlert from './FailureAlert';
import Icon from './Icons';

/**
 * One compact row: wordmark (small screens only) + view name, inline search and refresh.
 * Below it, at most one line of preview status and a non-sticky, dismissible page alert.
 */
export default function PageHeader(props: {
  state: FeedState;
  onRefresh: () => void;
  onConnectAccount: () => void;
  onDismissError: () => void;
  onQuery: (query: string) => void;
  onClearFilter: () => void;
  /** Opens the connected account's sheet (below the desktop width, where the column is hidden). */
  onAccount?: () => void;
  /** The heading, decided with the thread placement (the list name while a thread sits aside). */
  title: string;
  /** The list is on screen, so search applies to it. */
  listVisible: boolean;
  /** Desktop: the conversation sits in the right column. */
  threadAside?: boolean;
}) {
  let searchInput: HTMLInputElement | undefined;
  return (
    <>
      <header class="page-header">
        <div class="page-title">
          <span class="header-wordmark" aria-hidden="true">
            kimino
          </span>
          <h1 id="page-heading" tabindex={-1}>
            {props.title}
          </h1>
        </div>
        <div class="header-actions">
          <Show when={props.listVisible}>
            {/* The label wraps the icon (a tap on it opens the field); the clear control is a
                sibling, so it is never a click on the label. */}
            <div class="search-field">
              <label class="search-label" for="feed-search">
                <Icon name="search" />
                <span class="sr-only">{copy.search}</span>
              </label>
              <input
                id="feed-search"
                type="search"
                placeholder={copy.searchPlaceholder}
                aria-describedby="feed-search-help"
                value={props.state.query}
                ref={(el) => (searchInput = el)}
                onInput={(event) => props.onQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  // The browser's own Escape empties a search field; this makes it certain,
                  // and keeps the key from leaving the field's owner.
                  if (event.key !== 'Escape' || !props.state.query) return;
                  event.preventDefault();
                  props.onQuery('');
                }}
              />
              <span id="feed-search-help" class="sr-only">
                {copy.searchHelp}
              </span>
              <Show when={props.state.query}>
                <button
                  type="button"
                  class="icon-button search-clear"
                  aria-label={copy.clearSearch}
                  title={copy.clearSearch}
                  onClick={() => {
                    props.onQuery('');
                    searchInput?.focus();
                  }}
                >
                  <Icon name="close" class="icon--sm" />
                </button>
              </Show>
            </div>
          </Show>
          <Show when={!props.state.demo && props.state.actor}>
            {(actor) => (
              <button
                type="button"
                class="icon-button account-button"
                aria-label={copy.accountButton(actorLabelOf(actor().id, actor()))}
                title={copy.accountButton(actorLabelOf(actor().id, actor()))}
                aria-haspopup="dialog"
                onClick={props.onAccount}
              >
                <Icon name="person" />
              </button>
            )}
          </Show>
          <Show when={!props.state.demo && props.state.actor}>
            <button
              class="icon-button refresh-button"
              disabled={props.state.refreshing}
              aria-busy={props.state.refreshing ? 'true' : undefined}
              onClick={props.onRefresh}
              aria-label={copy.refreshLabel}
              title={copy.refreshLabel}
            >
              <Icon name="refresh" class={props.state.refreshing ? 'icon--spin' : undefined} />
            </button>
          </Show>
        </div>
      </header>
      <Show when={props.state.demo}>
        <div class="demo-pill">
          <span>{copy.demoBanner}</span>
          <button class="text-button demo-pill-action" onClick={props.onConnectAccount}>
            {copy.demoBannerAction}
            <Icon name="arrow-right" class="icon--sm" />
          </button>
        </div>
      </Show>
      <Show when={props.state.authorFilter}>
        {(filter) => (
          <div class="filter-chip" role="status">
            <Icon name="filter" class="icon--sm" />
            <span>{copy.actor.filtering(filter().name)}</span>
            <button
              type="button"
              class="icon-button filter-chip-clear"
              aria-label={copy.actor.clearFilter}
              title={copy.actor.clearFilter}
              onClick={props.onClearFilter}
            >
              <Icon name="close" class="icon--sm" />
            </button>
          </div>
        )}
      </Show>
      <Show when={props.state.threadMissing && !props.threadAside}>
        <p class="missing-parent">{copy.missingSelection}</p>
      </Show>
      <Show when={props.state.error}>
        <FailureAlert
          heading={copy.alertHeading}
          lines={[props.state.error]}
          detail={props.state.errorDetail}
          action={() => (
            <button
              type="button"
              class="page-error-dismiss"
              aria-label={copy.dismiss}
              onClick={props.onDismissError}
            >
              <Icon name="close" class="icon--sm" />
            </button>
          )}
        />
      </Show>
    </>
  );
}
