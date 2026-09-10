import { createSignal, Show } from 'solid-js';
import type { ReactionKind, TimelineNote } from '../domain/social';
import { copy, joinLine } from '../presentation/copy';
import { reactedBy, withCount } from '../presentation/note-display';
import Icon from './Icons';

/**
 * The reply / share / like / save / thread row under a note card. Every control names what
 * it does in its accessible name at every width; the stylesheet's card steps decide which
 * words are drawn. A reaction that is in effect says so in its label and carries an outline,
 * so the state never rests on hue alone.
 *
 * My own note adds 수정 and 삭제. In a card under the `fold` step (the reading column of an
 * 1100-1280 window, the thread panel, a phone) those two fold behind one 관리 disclosure at
 * the end of the first row, so a card is one row of actions tall; the disclosure opens them
 * inline, Escape closes it (not while a delete confirmation is open), and the stylesheet
 * alone decides which of the two shapes is drawn. On narrower cards a like, share or 대화
 * that carries a count keeps its icon and count and folds its word, so six controls still
 * share one line; the word stays in the accessible name.
 */
export default function NoteActions(props: {
  note: TimelineNote;
  actor?: string;
  author: string;
  onReply: (note: TimelineNote) => void;
  onThread?: (note: TimelineNote) => void;
  onReact?: (note: TimelineNote, kind: ReactionKind) => void;
  onSave?: (note: TimelineNote) => void;
  saved?: boolean;
  replies?: number;
  disabled?: boolean;
  pending?: ReactionKind;
  hasDraft?: boolean;
  /** The reader wrote this note: only then are the edit and delete controls offered. */
  own?: boolean;
  onEdit?: (note: TimelineNote) => void;
  /** Opens the delete confirmation. Deleting itself never happens from this row. */
  onDelete?: (note: TimelineNote) => void;
  /** The delete confirmation for this note is open, so its control says so. */
  confirming?: boolean;
  /** Closes that confirmation; Escape on the delete control backs out the same way. */
  onCancelDelete?: () => void;
  /** Focus target for the delete control, so cancelling the confirmation can come back. */
  deleteRef?: (el: HTMLButtonElement) => void;
}) {
  const [manageOpen, setManageOpen] = createSignal(false);
  let manageToggle: HTMLButtonElement | undefined;
  const closeManage = () => {
    setManageOpen(false);
    manageToggle?.focus();
  };
  const liked = () => reactedBy(props.note, 'like', props.actor);
  const shared = () => reactedBy(props.note, 'share', props.actor);
  const likes = () => props.note.likedBy.length;
  const shares = () => props.note.announcedBy.length;
  const likeLabel = () => (liked() ? copy.reactions.liked : copy.reactions.like);
  const shareLabel = () => (shared() ? copy.reactions.shared : copy.reactions.share);
  const saveLabel = () => (props.saved ? copy.reactions.saved : copy.reactions.save);
  const save = (folded = false) => (
    <button
      class={folded ? 'text-button save-button save-button--folded' : 'text-button save-button'}
      aria-pressed={props.saved ? 'true' : 'false'}
      aria-label={saveLabel()}
      title={saveLabel()}
      onClick={() => props.onSave?.(props.note)}
    >
      <Icon name="bookmark" filled={props.saved} />
      <span class="action-label">{saveLabel()}</span>
    </button>
  );
  return (
    <footer
      class="note-actions"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        // While the delete confirmation is open, Escape here backs out of it - as it does
        // inside the confirmation - instead of falling through to the list and leaving the
        // confirmation open with its control off screen mid-decision.
        if (props.confirming) {
          if (!props.onCancelDelete) return;
          event.preventDefault();
          props.onCancelDelete();
          return;
        }
        if (!manageOpen()) return;
        event.preventDefault();
        closeManage();
      }}
    >
      <button
        class="text-button"
        disabled={props.disabled}
        onClick={() => props.onReply(props.note)}
        aria-label={copy.reply.label(props.author)}
        title={copy.reply.action}
      >
        <Icon name="reply" />
        <span class="action-label">{copy.reply.action}</span>
        <Show when={props.hasDraft}>
          <span class="draft-badge">{copy.reply.draft}</span>
        </Show>
      </button>
      <Show when={props.onReact}>
        <button
          class="text-button reaction-button share-button"
          aria-pressed={shared() ? 'true' : 'false'}
          aria-busy={props.pending === 'share' ? 'true' : undefined}
          aria-label={withCount(shareLabel(), shares())}
          data-count={shares() || undefined}
          title={shareLabel()}
          disabled={props.disabled}
          onClick={() => props.onReact?.(props.note, 'share')}
        >
          <Icon name="repeat" />
          <span class="action-label">{shareLabel()}</span>
          <Show when={shares()}>
            <span class="count">{shares()}</span>
          </Show>
        </button>
        <button
          class="text-button reaction-button like-button"
          aria-pressed={liked() ? 'true' : 'false'}
          aria-busy={props.pending === 'like' ? 'true' : undefined}
          aria-label={withCount(likeLabel(), likes())}
          data-count={likes() || undefined}
          title={likeLabel()}
          disabled={props.disabled}
          onClick={() => props.onReact?.(props.note, 'like')}
        >
          <Icon name="heart" filled={liked()} />
          <span class="action-label">{likeLabel()}</span>
          <Show when={likes()}>
            <span class="count">{likes()}</span>
          </Show>
        </button>
      </Show>
      <Show when={props.onSave}>{save()}</Show>
      {/* Without a count the name says what pressing it does; with one, the count is the
          name's second word ("대화 12") and the title says what it counts. */}
      <Show when={props.onThread}>
        <button
          class="text-button thread-button"
          data-thread={props.note.id}
          data-count={props.replies || undefined}
          aria-label={props.replies ? withCount(copy.thread, props.replies) : copy.threadOpen}
          title={props.replies ? joinLine(copy.thread, copy.threadScope) : copy.threadOpen}
          onClick={() => props.onThread?.(props.note)}
        >
          <Icon name="chat-stack" />
          <span class="action-label">{copy.thread}</span>
          <Show when={props.replies}>
            <span class="count">{props.replies}</span>
          </Show>
        </button>
      </Show>
      {/* Managing my own note comes after the five everyone gets, so the reading actions
          keep their place and their targets at every width. */}
      <Show when={props.own && (props.onEdit || props.onDelete)}>
        <button
          class="text-button manage-toggle"
          type="button"
          aria-label={copy.own.manageLabel}
          aria-expanded={manageOpen() ? 'true' : 'false'}
          title={copy.own.manageLabel}
          ref={(el) => (manageToggle = el)}
          onClick={() => setManageOpen((open) => !open)}
        >
          <Icon name="more" />
          <span class="action-label">{copy.own.manage}</span>
        </button>
      </Show>
      <div
        class="manage-group note-manage-row"
        data-open={manageOpen() || props.confirming ? '' : undefined}
      >
        <Show when={props.own && props.onSave && (props.onEdit || props.onDelete)}>
          {save(true)}
        </Show>
        <Show when={props.own && props.onEdit}>
          <button
            class="text-button edit-button"
            type="button"
            disabled={props.disabled}
            aria-label={copy.own.editLabel}
            title={copy.own.edit}
            onClick={() => props.onEdit?.(props.note)}
          >
            <Icon name="pencil" />
            <span class="action-label">{copy.own.edit}</span>
          </button>
        </Show>
        {/* Destructive, so it opens a confirmation instead of acting, and it is never bound to
          a key: `aria-expanded` ties it to the confirmation the card shows below. */}
        <Show when={props.own && props.onDelete}>
          <button
            class="text-button delete-button"
            type="button"
            disabled={props.disabled}
            aria-label={copy.own.deleteLabel}
            aria-expanded={props.confirming ? 'true' : 'false'}
            title={copy.own.delete}
            ref={(el) => props.deleteRef?.(el)}
            onClick={() => props.onDelete?.(props.note)}
          >
            <Icon name="trash" />
            <span class="action-label">{copy.own.delete}</span>
          </button>
        </Show>
      </div>
    </footer>
  );
}
