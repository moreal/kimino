import { For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { TimelineNote } from '../domain/social';
import type { FeedState } from '../presentation/feed-view-model';
import { copy, disconnectLabel, syncSummary } from '../presentation/copy';
import { readableText } from '../presentation/feed';
import { repliesPeek } from '../presentation/feed-selectors';
import { actorLabelOf, actorName, nameFromIri } from '../presentation/actor-name';
import { relativeTime } from '../presentation/time';
import { connectionDotClass } from '../presentation/view-flags';
import { useClock } from '../presentation/solid/clock';
import Icon from './Icons';
import SessionHint from './SessionHint';

/**
 * Desktop right column once connected: one account line (the sidebar already carries the
 * navigation), then either the open conversation (passed in by the shell) or a peek at
 * replies addressed to me.
 */
export default function ContextColumn(props: {
  state: FeedState;
  onDisconnect: () => void;
  onThread: (note: TimelineNote) => void;
  /** The session reminder, shown under the account line on the desktop layout. */
  sessionHint?: boolean;
  onDismissHint?: () => void;
  /** The conversation to show instead of the replies peek (desktop, a note is focused). */
  thread?: JSX.Element;
  /** The account a remembered tab is reconnecting: its line is drawn before the timeline. */
  pendingAccount?: { id: string };
  /** The confirmation toast, anchored at the foot of this column on the desktop layout. */
  toast?: JSX.Element;
}) {
  const now = useClock();
  const replies = () => repliesPeek(props.state);
  /** The peek repeats the 받은 답글 list while that list is the one on screen: hidden then. */
  const peekShown = () => props.state.view !== 'replies';
  const account = () => props.state.actor ?? props.pendingAccount;
  /**
   * Before the actor document arrives only the IRI can name the account, and only when it
   * carries a username: a root-hosted account would otherwise be greeted by its host.
   */
  const identity = () => {
    const actor = props.state.actor;
    if (actor) return actorName(actor.id, actor);
    const name = props.pendingAccount ? nameFromIri(props.pendingAccount.id) : undefined;
    return name ? actorName(props.pendingAccount!.id) : undefined;
  };
  const accountLine = () => {
    const name = identity();
    return name ? copy.accountLine(name.primary) : copy.accountConnecting;
  };
  return (
    <aside class="context-column">
      <Show when={account()}>
        <div class="context-account">
          {/* Lit only once a real actor document is in: while a remembered tab reconnects
              the line says 연결 중… and the dot stays grey with it, and the preview's sample
              account is not a connection either. */}
          <span class={connectionDotClass(props.state)} aria-hidden="true" />
          {/* The name the cards use, and under it the address that tells this account
                  apart from another with the same name. */}
          <span
            class="context-identity"
            title={syncSummary(
              props.state.loadedAt,
              props.state.timeline?.diagnostics.ignored,
              undefined,
              props.state.timeline?.partial,
            )}
          >
            <span class="context-handle">{accountLine()}</span>
            <Show when={identity()?.secondary}>
              {(handle) => <span class="context-address">{handle()}</span>}
            </Show>
          </span>
          <button
            type="button"
            class="icon-button context-disconnect"
            aria-label={disconnectLabel(props.state.demo)}
            title={disconnectLabel(props.state.demo)}
            onClick={props.onDisconnect}
          >
            <Icon name="log-out" />
          </button>
        </div>
      </Show>
      <Show when={props.state.actor}>
        {(actor) => (
          <>
            <Show when={props.sessionHint}>
              <SessionHint
                shown={props.state.sessionHint}
                onDismiss={() => props.onDismissHint?.()}
              />
            </Show>
            {/* Replies to me, when there are any; otherwise one muted line and no card, so
                the column does not teach the reader what an empty list is for. */}
            <Show
              when={props.thread}
              fallback={
                <Show when={peekShown()}>
                  <Show
                    when={replies().length}
                    fallback={
                      <p class="replies-peek replies-peek-empty">{copy.repliesPeekEmpty}</p>
                    }
                  >
                    <section class="replies-peek" aria-labelledby="replies-peek-heading">
                      <h2 id="replies-peek-heading" class="replies-peek-heading">
                        <Icon name="reply" class="icon--sm" />
                        {copy.repliesPeek}
                      </h2>
                      <For each={replies()}>
                        {(note) => (
                          <button
                            type="button"
                            class="peek-item"
                            onClick={() => props.onThread(note)}
                            aria-label={copy.repliesPeekItem(actorLabelOf(note.author, actor()))}
                          >
                            <span class="peek-meta">
                              <strong>{actorLabelOf(note.author, actor())}</strong>
                              <time datetime={note.published}>
                                {relativeTime(note.published, now())}
                              </time>
                            </span>
                            <span class="peek-text">
                              <Show when={note.summary}>
                                <Icon name="warning" class="icon--sm" />
                              </Show>
                              {note.summary || readableText(note.content)}
                            </span>
                          </button>
                        )}
                      </For>
                    </section>
                  </Show>
                </Show>
              }
            >
              <div class="thread-panel">{props.thread}</div>
            </Show>
          </>
        )}
      </Show>
      <footer class="site-footer">{copy.siteFooter}</footer>
      {props.toast}
    </aside>
  );
}
