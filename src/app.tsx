import { Show, untrack } from 'solid-js';
import type { TimelineNote } from './domain/social';
import type { SocialSession } from './application/social-session';
import type { Preferences } from './presentation/ports';
import { createFeedViewModel, type FocusPort } from './presentation/feed-view-model';
import { useStore } from './presentation/use-store';
import ConnectionPanel from './components/ConnectionPanel';
import Sidebar from './components/Sidebar';
import PageHeader from './components/PageHeader';
import FeedList from './components/FeedList';
import ConversationView from './components/ConversationView';
import ContextColumn from './components/ContextColumn';

/** DOM-only concerns the view model delegates: focus management and scroll restoration. */
const focusPort: FocusPort = {
  focusReplyComposer: () =>
    queueMicrotask(() =>
      document.querySelector<HTMLTextAreaElement>('.inline-reply textarea')?.focus(),
    ),
  focusMainComposer: () =>
    queueMicrotask(() =>
      document.querySelector<HTMLTextAreaElement>('.main-composer textarea')?.focus(),
    ),
  focusHeading: () =>
    queueMicrotask(() => document.getElementById('conversation-heading')?.focus()),
  restore: (noteId, scrollY) =>
    queueMicrotask(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('[data-thread]'))
        .find((button) => button.dataset.thread === noteId)
        ?.focus({ preventScroll: true });
      window.scrollTo(0, scrollY);
    }),
};

export default function App(props: { session: SocialSession; preferences: Preferences }) {
  const session = untrack(() => props.session);
  const vm = createFeedViewModel(
    session,
    untrack(() => props.preferences),
    focusPort,
  );
  const state = useStore(vm, () => {
    vm.dispose();
    session.disconnect();
  });
  const openThread = (note: TimelineNote) => vm.openThread(note, window.scrollY);
  return (
    <div class="app-shell">
      <a href="#main-content" class="skip-link">
        본문으로 건너뛰기
      </a>
      <Sidebar
        state={state()}
        onNavigate={vm.navigate}
        onCompose={vm.compose}
        onDisconnect={vm.disconnect}
      />
      <main id="main-content" class="main-column" tabindex={-1}>
        <Show
          when={state().actor || state().loading}
          fallback={
            <ConnectionPanel
              initialUrl={
                untrack(() => props.preferences.read('actor')) || 'https://localhost:8443/'
              }
              busy={state().busy}
              error={state().error}
              onConnect={vm.connect}
              onExplore={vm.explore}
            />
          }
        >
          <PageHeader
            state={state()}
            onRefresh={() => void vm.refresh()}
            onConnectAccount={vm.disconnect}
            onDismissError={vm.dismissError}
          />
          <Show
            when={state().thread}
            fallback={<FeedList state={state()} vm={vm} onThread={openThread} />}
          >
            {(thread) => (
              <ConversationView state={state()} vm={vm} thread={thread()} onThread={openThread} />
            )}
          </Show>
        </Show>
      </main>
      <ContextColumn state={state()} onDisconnect={vm.disconnect} />
    </div>
  );
}
