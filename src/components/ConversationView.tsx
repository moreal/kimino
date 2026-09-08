import { For, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import { copy } from '../presentation/copy';
import { safeHttpUrl } from '../ui/content';
import NoteWithReply from './NoteWithReply';

export default function ConversationView(props: {
  state: FeedState;
  vm: FeedViewModel;
  thread: TimelineNote;
  onThread: (note: TimelineNote) => void;
}) {
  const card = (note: TimelineNote, focused = false) => (
    <NoteWithReply
      note={note}
      state={props.state}
      vm={props.vm}
      onThread={props.onThread}
      focused={focused}
    />
  );
  const missingParentLink = () => safeHttpUrl(props.state.missingParent);
  return (
    <section class="conversation" aria-label="대화 내용">
      <button class="back-button" onClick={props.vm.closeThread}>
        ← {copy.back}
      </button>
      <For each={props.state.parents}>
        {(parent) => <div class="thread-parent">{card(parent)}</div>}
      </For>
      <Show when={props.state.missingParent}>
        <div class="missing-parent">
          {copy.missingParent}{' '}
          <Show when={missingParentLink()} fallback={<span>원문 주소를 열 수 없습니다.</span>}>
            <a href={missingParentLink()} target="_blank" rel="noopener noreferrer">
              {copy.missingParentLink}
            </a>
          </Show>
        </div>
      </Show>
      <div class="thread-focus">{card(props.thread, true)}</div>
      <h2 class="conversation-label">이어지는 답글</h2>
      <For each={props.state.replies} fallback={<p class="feed-footnote">{copy.noReplies}</p>}>
        {(note) => card(note)}
      </For>
    </section>
  );
}
