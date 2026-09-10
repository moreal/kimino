import { createSignal, Show, untrack } from 'solid-js';
import type { TimelineNote } from './domain/social';
import type { SocialSession } from './application/social-session';
import type { Preferences } from './presentation/ports';
import {
  createPersistence,
  noSessionStore,
  restoredAccount,
  type SessionStore,
} from './presentation/session-restore';
import { createFeedViewModel, type FocusPort } from './presentation/feed-view-model';
import { threadPlacement } from './presentation/feed-selectors';
import { useStore } from './presentation/solid/use-store';
import { useMediaQuery } from './presentation/solid/media';
import { RevealWarnedContext } from './presentation/solid/reveal-preference';
import { copy, disconnectLabel } from './presentation/copy';
import { WIDE_QUERY } from './presentation/design-tokens';
import { actorSheetIsSelf } from './presentation/view-flags';
import Icon from './components/Icons';
import ConnectionPanel from './components/ConnectionPanel';
import CompatibilityNote from './components/CompatibilityNote';
import Sidebar from './components/Sidebar';
import PageHeader from './components/PageHeader';
import FeedList from './components/FeedList';
import ConversationView from './components/ConversationView';
import ContextColumn from './components/ContextColumn';
import ShortcutsDialog from './components/ShortcutsDialog';
import ActorSheet from './components/ActorSheet';
import Toast from './components/Toast';
import { inComposer, isEditable } from './components/shortcuts';

const cardsFor = (id: string | undefined, within = '') =>
  Array.from(document.querySelectorAll<HTMLElement>(`${within} article.note-card`)).filter(
    (card) => card.dataset.note === id,
  );

/** The skip link's targets by the placement's name: the list, or the main column itself. */
const SKIP_TARGETS = { list: '#timeline', main: '#main-content' } as const;

/** After the pending state change has been rendered and laid out. */
const afterRender = (work: () => void) => queueMicrotask(() => requestAnimationFrame(work));

/** DOM-only concerns the view model delegates: focus management and scroll restoration. */
const focusPort: FocusPort = {
  focusReplyComposer: () =>
    queueMicrotask(() =>
      document.querySelector<HTMLTextAreaElement>('.inline-reply textarea')?.focus(),
    ),
  focusEditComposer: () =>
    queueMicrotask(() =>
      document.querySelector<HTMLTextAreaElement>('.inline-edit textarea')?.focus(),
    ),
  // A deleted note takes its card - and the focus that was on it - away with it.
  focusList: () =>
    afterRender(() =>
      (document.getElementById('timeline') ?? document.getElementById('main-content'))?.focus({
        preventScroll: true,
      }),
    ),
  // The same note can be on screen twice (timeline and thread column); the composer that
  // just closed belonged to the last copy in document order, the thread column's.
  focusReplyButton: (noteId) =>
    queueMicrotask(() =>
      cardsFor(noteId).at(-1)?.querySelector<HTMLButtonElement>('.note-actions button')?.focus(),
    ),
  focusMainComposer: () =>
    queueMicrotask(() =>
      document.querySelector<HTMLTextAreaElement>('.main-composer textarea')?.focus(),
    ),
  // The conversation's own heading when it sits in the right column; otherwise the page
  // heading, which is the conversation's title on one column.
  focusHeading: () =>
    queueMicrotask(() =>
      (
        document.getElementById('conversation-heading') ?? document.getElementById('page-heading')
      )?.focus(),
    ),
  // Leaving a conversation can put the whole list back on screen (a narrow window replaces
  // it while a thread is open), so both of these wait for that frame: before it, the page is
  // shorter than the offset being restored and the browser would clamp the scroll.
  restore: (noteId, scrollY) =>
    afterRender(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('[data-thread]'))
        .find((button) => button.dataset.thread === noteId)
        ?.focus({ preventScroll: true });
      window.scrollTo(0, scrollY);
    }),
  focusCard: (noteId, scrollY) =>
    afterRender(() => {
      cardsFor(noteId, '#timeline')[0]?.focus({ preventScroll: true });
      window.scrollTo(0, scrollY);
    }),
};

/**
 * A render halt shows a plain-language message instead of a blank page. Lives here, not in
 * the entry point, so the words come from the copy module like every other sentence.
 */
export function RenderFailure(error: () => unknown) {
  const message = () => {
    const value = error();
    return value instanceof Error ? value.message : String(value);
  };
  return (
    <div role="alert" class="app-error">
      <p>{copy.renderFailure}</p>
      <details>
        <summary>{copy.renderFailureDetail}</summary>
        <pre>{message()}</pre>
      </details>
    </div>
  );
}

export default function App(props: {
  session: SocialSession;
  preferences: Preferences;
  /** Opt-in tab-scoped persistence; omitted means the token is memory-only. */
  sessionStore?: SessionStore;
}) {
  const session = untrack(() => props.session);
  const preferences = untrack(() => props.preferences);
  const store = untrack(() => props.sessionStore) ?? noSessionStore;
  const vm = createFeedViewModel(session, preferences, focusPort);
  const persistence = createPersistence(vm, store);
  const wide = useMediaQuery(WIDE_QUERY);
  /** The view model with the actions that also touch the tab record routed through persistence. */
  const { connect, restore, ...persisted } = persistence;
  const shell = { ...vm, ...persisted };
  const openThread = (note: TimelineNote) => shell.openThread(note, window.scrollY);
  // Whose tab this is, read before the first request: the navigation and the account line
  // are drawn for it at once, while the list still shows the loading skeleton. Once the
  // restore has settled - either way - it is forgotten, so a later connection to another
  // account (or the preview) never loads under the previous account's name.
  const [remembered, setRemembered] = createSignal(untrack(() => restoredAccount(store.read())));
  // Start restoring before the store bridge reads its first snapshot so a remembered tab
  // opens on the loading skeleton instead of flashing the connection form.
  void restore().finally(() => setRemembered(undefined));
  const state = useStore(vm, () => {
    vm.dispose();
    session.disconnect();
  });
  const connected = () => !!state().actor || state().loading;
  /** The remembered account stands in until the real one arrives, or the reconnect fails. */
  const pendingAccount = () => (!state().actor && state().loading ? remembered() : undefined);
  /** Browser preference: warned notes open by themselves. Held by the view model like the density. */
  const revealWarned = () => state().revealWarned;
  /* A fixed pill at the bottom of the viewport, or the foot of the right column on the
     desktop layout: a confirmation never moves the composer or the first card and never
     stands over the reading column's actions; taps pass through it. */
  const toast = () => <Toast message={state().notice} id={state().noticeId} />;
  const placement = () => threadPlacement(state(), wide());
  const conversation = (standalone: boolean) => (
    <Show when={state().conversation?.focused}>
      {(thread) => (
        <ConversationView
          state={state()}
          vm={shell}
          thread={thread()}
          onThread={openThread}
          standalone={standalone}
        />
      )}
    </Show>
  );
  /**
   * On one column the conversation heading is the page heading, outside the conversation
   * itself, so Escape there is caught at the column: back to the card the thread came from.
   */
  const onMainKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!state().conversation || placement().listVisible) return;
    if (isEditable(event.target) || inComposer(event.target)) return;
    event.preventDefault();
    shell.leaveThread();
  };
  const missingSelection = () => (
    <Show when={state().threadMissing}>
      <div class="conversation-bar">
        <button class="back-button" onClick={shell.closeThread}>
          <Icon name="arrow-left" />
          {copy.back}
        </button>
      </div>
      <p class="missing-parent">{copy.missingSelection}</p>
    </Show>
  );
  return (
    <RevealWarnedContext value={revealWarned}>
      <div
        class={connected() ? 'app-shell' : 'app-shell app-shell--landing'}
        data-density={state().density}
      >
        <a
          href={SKIP_TARGETS[placement().skipTarget]}
          class="skip-link"
          onClick={(event) => {
            const target = document.querySelector<HTMLElement>(
              SKIP_TARGETS[placement().skipTarget],
            );
            if (!target) return;
            event.preventDefault();
            target.focus({ preventScroll: false });
          }}
        >
          {copy.skipLink}
        </a>
        <Sidebar
          state={state()}
          onNavigate={shell.navigate}
          onCompose={shell.compose}
          onDisconnect={shell.disconnect}
          onShortcuts={shell.toggleHelp}
          onDensity={shell.setDensity}
          revealWarned={revealWarned()}
          onRevealWarned={shell.setRevealWarned}
          pendingAccount={pendingAccount()}
        />
        <main id="main-content" class="main-column" tabindex={-1} onKeyDown={onMainKeyDown}>
          <Show
            when={connected()}
            fallback={
              <ConnectionPanel
                initialUrl={untrack(() => preferences.read('actor')) || ''}
                busy={state().connecting}
                error={state().error}
                errorDetail={state().errorDetail}
                onConnect={(url, token, remember) => void connect(url, token, remember)}
                onExplore={() => void shell.explore()}
              />
            }
          >
            <PageHeader
              state={state()}
              title={placement().title}
              listVisible={placement().listVisible}
              threadAside={placement().aside}
              onRefresh={() => void shell.refresh()}
              onConnectAccount={shell.disconnect}
              onDismissError={shell.dismissError}
              onQuery={shell.setQuery}
              onClearFilter={shell.clearAuthorFilter}
              onAccount={() => {
                const id = state().actor?.id;
                if (id) shell.openActor(id);
              }}
            />
            <Show when={!wide()}>{toast()}</Show>
            <Show when={placement().listVisible} fallback={conversation(false)}>
              <FeedList
                state={state()}
                vm={shell}
                onThread={openThread}
                replyElsewhere={(id) => placement().inConversation.has(id)}
                sessionHint={!wide()}
              />
            </Show>
          </Show>
        </main>
        <Show
          when={connected()}
          fallback={
            <aside class="context-column landing-aside">
              <CompatibilityNote />
            </aside>
          }
        >
          <ContextColumn
            state={state()}
            onDisconnect={shell.disconnect}
            onThread={openThread}
            sessionHint={wide()}
            onDismissHint={shell.dismissSessionHint}
            pendingAccount={pendingAccount()}
            toast={wide() ? toast() : undefined}
            thread={
              placement().aside ? (
                <>
                  {conversation(true)}
                  {missingSelection()}
                </>
              ) : undefined
            }
          />
        </Show>
        <ShortcutsDialog open={state().helpOpen} onClose={shell.closeHelp} />
        <ActorSheet
          profile={state().actorSheet}
          onClose={shell.closeActor}
          onFilter={shell.filterAuthor}
          onDisconnect={actorSheetIsSelf(state()) ? shell.disconnect : undefined}
          disconnectLabel={disconnectLabel(state().demo)}
        />
      </div>
    </RevealWarnedContext>
  );
}
