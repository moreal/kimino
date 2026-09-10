import { createEffect, createMemo, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import type { FeedState, FeedViewModel } from '../presentation/feed-view-model';
import { editKey, parentState } from '../presentation/feed-selectors';
import { copy } from '../presentation/copy';
import NoteCard from './NoteCard';
import Composer from './Composer';

/** A note card with its inline reply composer, wired to the feed view model. */
export default function NoteWithReply(props: {
  note: TimelineNote;
  state: FeedState;
  vm: FeedViewModel;
  onThread: (note: TimelineNote) => void;
  focused?: boolean;
  /** Roving tab stop in list views; undefined leaves the card out of the tab order. */
  tabindex?: number;
  /** The same note is shown with its composer elsewhere (the desktop thread column). */
  replyElsewhere?: boolean;
  /** The parent card is drawn right above this one, so the reply cue says nothing new. */
  parentAdjacent?: boolean;
}) {
  // One projection per card: every read of the shared feed state goes through this single
  // computation, so a long timeline adds one subscriber per card to the store, not ten.
  const view = createMemo(() => {
    const state = props.state;
    const note = props.note;
    const parent = note.inReplyTo ? state.byId.get(note.inReplyTo) : undefined;
    const draft = state.drafts[note.id] || '';
    const replyOpen = state.reply?.id === note.id && !props.replyElsewhere;
    const key = editKey(note.id);
    return {
      actor: state.actor?.id,
      parent,
      parentGone: parentState(state.byId, note, state.gone) === 'gone',
      replies: state.replyCounts.get(note.id) ?? 0,
      draft,
      saved: state.saved.includes(note.id),
      deleting: state.deleting.has(note.id),
      revealed: state.revealed.has(note.id),
      pending: state.pending.get(note.id),
      feedback: state.actionError[note.id],
      hasDraft: !replyOpen && draft.trim().length > 0,
      replyOpen,
      error: state.composeError?.key === note.id ? state.composeError : undefined,
      // Editing and confirming a deletion belong to the same copy of the card as the reply
      // composer, so a note shown twice never opens two of either.
      editOpen: state.editing?.id === note.id && !props.replyElsewhere,
      editDraft: state.drafts[key] ?? '',
      editOptions: state.composeOptions[key],
      editError: state.composeError?.key === key ? state.composeError : undefined,
      confirming: state.confirmDelete === note.id && !props.replyElsewhere,
    };
  });
  let deleteButton: HTMLButtonElement | undefined;
  let cancelButton: HTMLButtonElement | undefined;
  /**
   * The confirmation takes focus so it is announced, and it takes it on 삭제 취소: the
   * destructive control is never what a stray Enter or Space lands on.
   */
  createEffect(
    () => view().confirming,
    (open) => {
      if (open) queueMicrotask(() => cancelButton?.focus());
    },
  );
  const cancelDelete = () => {
    props.vm.cancelDelete();
    queueMicrotask(() => deleteButton?.focus());
  };
  return (
    <div class="note-with-reply">
      <NoteCard
        note={props.note}
        actor={view().actor}
        self={props.state.actor}
        focused={props.focused}
        tabindex={props.tabindex}
        onReply={props.vm.chooseReply}
        onThread={props.onThread}
        onAuthor={props.vm.openActor}
        onOpenParent={() => {
          const target = view().parent;
          if (target) props.onThread(target);
        }}
        parent={view().parent}
        parentGone={view().parentGone}
        parentAdjacent={props.parentAdjacent}
        soloAuthor={props.state.soloAuthor}
        onReact={(note, kind) => void props.vm.react(note, kind)}
        onSave={props.vm.toggleSave}
        onEdit={props.vm.startEdit}
        onDelete={props.vm.askDelete}
        confirmingDelete={view().confirming}
        onCancelDelete={cancelDelete}
        deleteRef={(el) => (deleteButton = el)}
        saved={view().saved}
        replies={view().replies}
        revealed={view().revealed}
        onToggleReveal={props.vm.toggleReveal}
        pending={view().pending}
        feedback={view().feedback}
        hasDraft={view().hasDraft}
      />
      {/* Deleting takes two deliberate steps and names what it does before the second one.
          There is no keyboard shortcut for it, and Escape here backs out. */}
      <Show when={view().confirming}>
        <div
          class="delete-confirm"
          role="group"
          aria-label={copy.own.confirmHeading}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            event.preventDefault();
            cancelDelete();
          }}
        >
          <p class="delete-confirm-heading">{copy.own.confirmHeading}</p>
          <p class="delete-confirm-body">{copy.own.confirmBody}</p>
          <div class="delete-confirm-actions">
            <button
              type="button"
              class="secondary-button"
              ref={(el) => (cancelButton = el)}
              onClick={cancelDelete}
            >
              {copy.own.cancel}
            </button>
            <button
              type="button"
              class="danger-button"
              disabled={view().deleting}
              onClick={() => void props.vm.deleteNote(props.note)}
            >
              {copy.own.confirm}
            </button>
          </div>
        </div>
      </Show>
      <Show when={view().editOpen}>
        <div class="inline-edit">
          <Composer
            editing={props.note}
            draft={view().editDraft}
            onDraft={(value) => props.vm.setDraft(editKey(props.note.id), value)}
            options={view().editOptions}
            onOptions={(value) => props.vm.setComposeOptions(editKey(props.note.id), value)}
            error={view().editError}
            onSubmit={(draft) => props.vm.submitEdit(props.note, draft)}
            onCancel={props.vm.cancelEdit}
          />
        </div>
      </Show>
      <Show when={view().replyOpen}>
        <div class="inline-reply">
          <Composer
            replyTo={props.note}
            self={props.state.actor}
            draft={view().draft}
            onDraft={(value) => props.vm.setDraft(props.note.id, value)}
            error={view().error}
            onSubmit={props.vm.publish}
            onCancel={props.vm.dismissReply}
          />
        </div>
      </Show>
    </div>
  );
}
