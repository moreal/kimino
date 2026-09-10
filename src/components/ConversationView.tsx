import { createMemo, For, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import { threadCue, visualDepth, type ConversationNode } from '../presentation/feed-selectors';
import { copy } from '../presentation/copy';
import { shortcutFor } from '../presentation/keyboard';
import { safeHttpUrl } from '../presentation/links';
import { isMentionOnly } from '../presentation/feed';
import Icon from './Icons';
import NoteWithReply from './NoteWithReply';
import { inComposer, isEditable, moveCursor, shortcutKey } from './shortcuts';

/**
 * One conversation: loaded ancestors (quiet, joined by a connector), the focused note
 * (enlarged), then every loaded reply below it as an indented tree. Indentation stops at
 * `MAX_THREAD_DEPTH - 1`; deeper replies sit flat under the last level with a "…에게" cue.
 */
export default function ConversationView(props: {
  state: FeedState;
  vm: FeedViewModel;
  thread: TimelineNote;
  onThread: (note: TimelineNote) => void;
  /** Rendered beside the timeline (desktop): carries its own focusable heading. */
  standalone?: boolean;
}) {
  let section: HTMLElement | undefined;
  // `adjacent` is read inside the prop, never here: a card is created once and keeps its
  // own state (an open 관리 row, focus) across the re-projection every state change brings.
  const card = (note: TimelineNote, focused = false, adjacent?: () => boolean) => (
    <NoteWithReply
      note={note}
      state={props.state}
      vm={props.vm}
      onThread={props.onThread}
      focused={focused}
      tabindex={-1}
      parentAdjacent={adjacent?.()}
    />
  );
  /**
   * Inside the conversation j/k walk its cards in reading order (ancestors, the focused
   * note, replies) and Escape - from anywhere in the column: the heading, a card, one of its
   * buttons - goes back to the timeline card the conversation was opened from. Only a text
   * field or an open composer keeps Escape for itself. Handled here, before the list's
   * window listener, so those keys never jump to the timeline while the reader is in the
   * thread column.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !section) return;
    if (event.key === 'Escape') {
      if (isEditable(event.target) || inComposer(event.target)) return;
      event.preventDefault();
      props.vm.leaveThread();
      return;
    }
    const action = shortcutFor(shortcutKey(event));
    if (action === 'next' || action === 'previous') {
      event.preventDefault();
      moveCursor(
        Array.from(section.querySelectorAll<HTMLElement>('article.note-card')),
        event.target,
        action === 'next' ? 1 : -1,
      );
    } else if (action === 'leave') {
      event.preventDefault();
      props.vm.leaveThread();
    }
  };
  const conversation = () => props.state.conversation;
  const ancestors = () => conversation()?.ancestors ?? [];
  /**
   * The reply tree is projected afresh on every state change, so its nodes are new objects
   * each time even when nothing under them moved. The list below keys its cards by node, so
   * a node that says the same thing about the same note is handed back as the object it
   * was: a like, a save or an open 관리 row on a reply then keeps its card, its focus and
   * its local state instead of being drawn again from scratch.
   */
  const descendants = createMemo<ConversationNode[]>((previous = []) => {
    const known = new Map(previous.map((node) => [node.note.id, node]));
    return (conversation()?.descendants ?? []).map((node) => {
      const before = known.get(node.note.id);
      return before &&
        before.note === node.note &&
        before.depth === node.depth &&
        before.flattened === node.flattened &&
        before.parentAuthor === node.parentAuthor
        ? before
        : node;
    });
  });
  /**
   * Whether the card drawn right before a node in reading order is that node's parent: the
   * focused note for the first reply, the previous reply for a reply nested under it. Then
   * the card's "원글 보기" cue would only point 40px up, and it stays off; a reply whose
   * parent is further up (a sibling's reply came between) keeps it.
   */
  const parentAdjacent = (index: number) => {
    const nodes = descendants();
    const before = index === 0 ? props.thread : nodes[index - 1]?.note;
    return !!before && nodes[index].note.inReplyTo === before.id;
  };
  const ancestorAdjacent = (index: number) => {
    const list = ancestors();
    return index > 0 && list[index].inReplyTo === list[index - 1].id;
  };
  const focusAdjacent = () => {
    const last = ancestors().at(-1);
    return !!last && props.thread.inReplyTo === last.id;
  };
  const missingParent = () => conversation()?.missingAncestor;
  /**
   * The parent above the top of this chain is known to be gone - deleted from here, or a
   * tombstone the server sent - so the column says so and offers no link to a 410.
   */
  const missingParentGone = () => {
    const id = missingParent();
    return !!id && props.state.gone.has(id);
  };
  const missingParentLink = () => safeHttpUrl(missingParent());
  /**
   * Opened from 받은 답글 on a note that only mentions me: say why my note is not above it,
   * but only when nothing is above it; a loaded parent already shows where the thread is.
   */
  const mentionOnly = () =>
    props.state.view === 'replies' &&
    ancestors().length === 0 &&
    isMentionOnly(props.state.all, props.thread, props.state.actor?.id || '');
  return (
    <section
      class="conversation"
      aria-label={copy.conversationRegion}
      ref={(el) => (section = el)}
      onKeyDown={onKeyDown}
    >
      <div class="conversation-bar">
        <button class="back-button" onClick={props.vm.closeThread}>
          <Icon name="arrow-left" />
          {copy.back}
        </button>
        <Show when={props.standalone}>
          <h2 id="conversation-heading" class="conversation-heading" tabindex={-1}>
            {copy.thread}
          </h2>
        </Show>
      </div>
      <Show when={missingParent()}>
        <Show
          when={!missingParentGone()}
          fallback={<div class="missing-parent">{copy.parentDeleted}</div>}
        >
          <div class="missing-parent">
            {copy.missingParent}{' '}
            <Show when={missingParentLink()} fallback={<span>{copy.missingParentNoLink}</span>}>
              <a href={missingParentLink()} target="_blank" rel="noopener noreferrer">
                {copy.missingParentLink}
                <Icon name="external" class="icon--sm" />
              </a>
            </Show>
          </div>
        </Show>
      </Show>
      <Show when={ancestors().length}>
        <div class="thread-ancestors" role="group" aria-label={copy.ancestorsLabel}>
          <For each={ancestors()}>
            {(parent, index) => (
              <div class="thread-parent thread-ancestor">
                {card(parent, false, () => ancestorAdjacent(index()))}
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="thread-focus">{card(props.thread, true, focusAdjacent)}</div>
      <Show when={mentionOnly()}>
        <p class="thread-note">{copy.mentionThread}</p>
      </Show>
      <h2 class="conversation-label">{copy.conversationLabel}</h2>
      <For each={descendants()} fallback={<p class="feed-footnote">{copy.noReplies}</p>}>
        {(node, index) => (
          <div
            class={node.flattened ? 'thread-reply thread-reply--flat' : 'thread-reply'}
            data-depth={visualDepth(node)}
            style={{ '--depth': String(visualDepth(node)) }}
          >
            <Show when={threadCue(node, props.state.actor)}>
              {(cue) => (
                <p class="reply-cue">
                  <Icon name="corner-down-right" class="icon--sm" />
                  {cue()}
                </p>
              )}
            </Show>
            {card(node.note, false, () => parentAdjacent(index()))}
          </div>
        )}
      </For>
    </section>
  );
}
