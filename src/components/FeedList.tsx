import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import {
  copy,
  emptyState,
  feedFoot,
  hiddenActivities,
  joinLine,
  lastChecked,
  reachLine,
  refusedActivities,
  unsupportedActivities,
} from '../presentation/copy';
import { feedFootLine } from '../presentation/feed-selectors';
import { shortcutFor, type ShortcutAction } from '../presentation/keyboard';
import { useClock } from '../presentation/solid/clock';
import Composer from './Composer';
import FeedSkeleton from './FeedSkeleton';
import Icon from './Icons';
import NoteWithReply from './NoteWithReply';
import SessionHint from './SessionHint';
import UnavailableSaved from './UnavailableSaved';
import { cardOf, moveCursor, shortcutKey } from './shortcuts';

export default function FeedList(props: {
  state: FeedState;
  vm: FeedViewModel;
  onThread: (note: TimelineNote) => void;
  /** Notes whose reply composer is shown in the thread column instead of here (desktop). */
  replyElsewhere?: (id: string) => boolean;
  /** The session reminder is shown here, under the composer (narrow layouts). */
  sessionHint?: boolean;
}) {
  const empty = () => emptyState(props.state.view, props.state.query, !!props.state.authorFilter);
  const now = useClock();
  let list: HTMLElement | undefined;
  let statusEl: HTMLElement | undefined;
  /**
   * Roving tab stop: exactly one card is in the tab order (the last one navigated to, or the
   * first), so Tab reaches the list in a couple of stops and j/k move a visible ring between
   * cards without adding every card to the tab sequence.
   */
  const [cursor, setCursor] = createSignal<string | undefined>(undefined);
  // The remembered card left the list (filter, list switch, delete): fall back to the first.
  createEffect(
    () => !!cursor() && !props.state.visibleNotes.some((note) => note.id === cursor()),
    (stale) => {
      if (stale) setCursor(undefined);
    },
  );
  const tabindexFor = (note: TimelineNote, index: number) =>
    cursor() ? (cursor() === note.id ? 0 : -1) : index === 0 ? 0 : -1;
  const cards = () => Array.from(list?.querySelectorAll<HTMLElement>('article.note-card') ?? []);
  const currentNote = (target: EventTarget | null) => {
    const id = cardOf(target)?.dataset.note ?? cursor();
    return props.state.notes.find((note) => note.id === id);
  };
  /** Which card the ring lands on is a pure rule; this only moves focus there. */
  const move = (target: EventTarget | null, delta: 1 | -1) => {
    const id = moveCursor(cards(), target, delta, cursor());
    if (id !== undefined) setCursor(id);
  };
  const perform = (action: ShortcutAction, event: KeyboardEvent) => {
    const note = currentNote(event.target);
    switch (action) {
      case 'next':
      case 'previous':
        move(event.target, action === 'next' ? 1 : -1);
        return true;
      case 'help':
        props.vm.toggleHelp();
        return true;
      case 'leave':
        list?.focus({ preventScroll: true });
        return true;
      case 'open':
        if (note) props.onThread(note);
        return !!note;
      case 'reply':
        if (note) props.vm.chooseReply(note);
        return !!note;
      case 'save':
        if (note) props.vm.toggleSave(note);
        return !!note;
      case 'like':
      case 'share':
        if (note) void props.vm.react(note, action);
        return !!note;
    }
  };
  /**
   * A modal sheet owns the keyboard while it is up: no reply composer opens behind its
   * backdrop, no second dialog stacks on it. The one exception is `?` on the shortcut list
   * itself, which closes what it opened.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || props.state.loading) return;
    const action = shortcutFor(shortcutKey(event));
    if (!action) return;
    const toggleHelp = action === 'help' && props.state.helpOpen;
    const inDialog = event.target instanceof Element && !!event.target.closest('[role="dialog"]');
    if (!toggleHelp && (props.state.actorSheet || props.state.helpOpen || inDialog)) return;
    if (perform(action, event)) event.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  /**
   * A long list needs a way back. The control appears once about two screens have gone by,
   * is a real button (so Tab reaches it), and hands focus to the top of the list rather than
   * only moving the viewport.
   */
  const [scrolledFar, setScrolledFar] = createSignal(false);
  const onScroll = () => setScrolledFar(window.scrollY > window.innerHeight * 2);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onCleanup(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  });
  const toTop = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    list?.focus({ preventScroll: true });
  };
  /** One more page of loaded notes; when that is the last one, focus lands on the list's foot. */
  const showMore = () => {
    const last = props.state.lastPage;
    props.vm.showMore();
    if (last) queueMicrotask(() => statusEl?.focus({ preventScroll: true }));
  };
  const dropped = () => unsupportedActivities(props.state.timeline?.diagnostics.ignored ?? 0);
  /** Activities the client understood and refused; said apart from the unsupported ones. */
  const refused = () => refusedActivities(props.state.timeline?.diagnostics.rejected ?? 0);
  /** What the client read from the server's own collections, and what it could not reach. */
  const reach = () => props.state.timeline?.reach;
  const unreached = () => (reach()?.missing ?? 0) > 0;
  /** One count for everything read and not shown; the reasons wait behind the disclosure. */
  const hidden = () =>
    hiddenActivities(
      props.state.timeline?.diagnostics.ignored,
      props.state.timeline?.diagnostics.rejected,
    );
  const status = () =>
    joinLine(
      // Under a search or in the saved list the count names what it counts (round 17).
      feedFootLine(props.state),
      hidden(),
      lastChecked(props.state.loadedAt, now(), props.state.timeline?.partial),
    );
  return (
    <>
      <Show when={!props.state.demo && props.state.actor}>
        <div class="main-composer">
          {/* The draft comes from the state this component already tracks, never from
              `vm.draft`: a plain snapshot read would freeze the counter and the value. */}
          <Composer
            draft={props.state.drafts.new ?? ''}
            onDraft={(value) => props.vm.setDraft('new', value)}
            error={props.state.composeError?.key === 'new' ? props.state.composeError : undefined}
            onSubmit={props.vm.publish}
          />
        </div>
      </Show>
      {/* Said once, right after a connect that left the token in memory, under the composer
          rather than over the list: it changes nothing and stores nothing either way. */}
      <Show when={props.sessionHint}>
        <SessionHint shown={props.state.sessionHint} onDismiss={props.vm.dismissSessionHint} />
      </Show>
      <Show when={props.state.view === 'saved'}>
        <p class="scope-note">{copy.savedScope}</p>
        <UnavailableSaved ids={props.state.missingSaved} onRemove={props.vm.removeSaved} />
      </Show>
      <section
        id="timeline"
        class="timeline"
        aria-label={copy.listLabel}
        aria-busy={props.state.loading ? 'true' : 'false'}
        tabindex={-1}
        ref={(el) => (list = el)}
        onFocusIn={(event) => {
          const id = cardOf(event.target)?.dataset.note;
          if (id) setCursor(id);
        }}
      >
        <Show when={!props.state.loading} fallback={<FeedSkeleton />}>
          <For
            each={props.state.visibleNotes}
            fallback={
              <div class="empty-state">
                <Icon name="sparkle" class="empty-state-icon" />
                <h2>{empty().heading}</h2>
                <p>{empty().body}</p>
                <Show when={props.state.query}>
                  <button class="secondary-button" onClick={() => props.vm.setQuery('')}>
                    {copy.clearSearch}
                  </button>
                </Show>
                <Show when={!props.state.query && props.state.authorFilter}>
                  <button class="secondary-button" onClick={props.vm.clearAuthorFilter}>
                    {copy.actor.clearFilter}
                  </button>
                </Show>
              </div>
            }
          >
            {(note, index) => (
              <NoteWithReply
                note={note}
                state={props.state}
                vm={props.vm}
                onThread={props.onThread}
                tabindex={tabindexFor(note, index())}
                replyElsewhere={props.replyElsewhere?.(note.id)}
              />
            )}
          </For>
        </Show>
      </section>
      {/* The foot of the list: what part of the loaded notes is on screen, how many activities
          were read and not shown, and when the timeline was last read - one quiet line. The
          reasons, and how far the read got through the server, wait behind 자세히. */}
      <Show when={!props.state.loading && props.state.actor}>
        <footer class="feed-foot">
          <Show when={props.state.remaining > 0}>
            <button type="button" class="secondary-button feed-more" onClick={showMore}>
              {feedFoot.more}
              <span class="feed-more-count">{feedFoot.remaining(props.state.remaining)}</span>
            </button>
          </Show>
          {/* The count and its 자세히 share one line: the disclosure follows the sentence it
              opens instead of standing alone under it. */}
          <div class="feed-status-row">
            <p class="feed-status" tabindex={-1} ref={(el) => (statusEl = el)}>
              {status()}
            </p>
            {/* Only when something was withheld or never arrived: a read that showed everything
              has nothing to disclose. */}
            <Show when={dropped() || refused() || unreached()}>
              <details class="feed-details">
                <summary>{feedFoot.details}</summary>
                <Show when={dropped()}>
                  {(text) => <p class="feed-status-dropped">{text()}</p>}
                </Show>
                {/* A refusal is not a gap in support: the server holds these and the client
                  declined to show them, so they are counted and named separately. */}
                <Show when={refused()}>
                  {(text) => <p class="feed-status-refused">{text()}</p>}
                </Show>
                {/* What the server said it holds against what this client actually read. There
                  is no "load older" here on purpose: the collection's own next links were
                  followed to their end, so anything still missing has no page to ask for. */}
                <Show when={reachLine(reach())}>
                  {(text) => (
                    <p class={unreached() ? 'feed-reach feed-reach--short' : 'feed-reach'}>
                      {text()}
                    </p>
                  )}
                </Show>
              </details>
            </Show>
          </div>
        </footer>
      </Show>
      <Show when={scrolledFar()}>
        <button type="button" class="to-top" onClick={toTop} title={feedFoot.toTopLabel}>
          <Icon name="arrow-up" />
          {feedFoot.toTop}
        </button>
      </Show>
    </>
  );
}
