import { For, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import { copy, emptyState } from '../presentation/copy';
import Composer from './Composer';
import NoteWithReply from './NoteWithReply';
import UnavailableSaved from './UnavailableSaved';

export default function FeedList(props: {
  state: FeedState;
  vm: FeedViewModel;
  onThread: (note: TimelineNote) => void;
}) {
  const empty = () => emptyState(props.state.view, props.state.query);
  return (
    <>
      <Show when={!props.state.demo && props.state.actor}>
        <div class="main-composer">
          <Composer
            draft={props.vm.draft('new')}
            onDraft={(value) => props.vm.setDraft('new', value)}
            disabled={props.state.busy}
            onSubmit={props.vm.publish}
          />
        </div>
      </Show>
      <div class="feed-tools">
        <label class="search-field">
          <span aria-hidden="true">⌕</span>
          <span class="sr-only">불러온 글 검색</span>
          <input
            type="search"
            placeholder="글 내용이나 작성자 검색"
            value={props.state.query}
            onInput={(event) => props.vm.setQuery(event.currentTarget.value)}
          />
        </label>
        <span class="feed-count">{props.state.notes.length}개의 글</span>
      </div>
      <Show when={props.state.view === 'saved'}>
        <p class="scope-note">{copy.savedScope}</p>
        <UnavailableSaved ids={props.state.missingSaved} onRemove={props.vm.removeSaved} />
      </Show>
      <section
        class="timeline"
        aria-label="게시글 목록"
        aria-busy={props.state.loading ? 'true' : 'false'}
      >
        <Show
          when={!props.state.loading}
          fallback={
            <div class="skeleton-list" aria-hidden="true">
              <For each={[0, 1, 2]}>
                {() => (
                  <div class="skeleton-card">
                    <div class="skeleton-avatar" />
                    <div class="skeleton-lines">
                      <div class="skeleton-line short" />
                      <div class="skeleton-line" />
                      <div class="skeleton-line" />
                    </div>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <For
            each={props.state.notes}
            fallback={
              <div class="empty-state">
                <span aria-hidden="true">✳</span>
                <h2>{empty().heading}</h2>
                <p>{empty().body}</p>
                <Show when={props.state.query}>
                  <button class="secondary-button" onClick={() => props.vm.setQuery('')}>
                    검색 지우기
                  </button>
                </Show>
              </div>
            }
          >
            {(note) => (
              <NoteWithReply
                note={note}
                state={props.state}
                vm={props.vm}
                onThread={props.onThread}
              />
            )}
          </For>
        </Show>
      </section>
    </>
  );
}
