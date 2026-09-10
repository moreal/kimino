import { createEffect, Show } from 'solid-js';
import type { Actor, ReactionKind, TimelineNote } from '../domain/social';
import { actorLabelOf, actorName } from '../presentation/actor-name';
import { safeHttpUrl } from '../presentation/links';
import { authorHue, isEdited, replyCueText } from '../presentation/note-display';
import { shareScope } from '../presentation/note-body';
import { absoluteTime, relativeTime } from '../presentation/time';
import { copy } from '../presentation/copy';
import { avatarInitial } from '../presentation/view-flags';
import Icon from './Icons';
import { useClock } from '../presentation/solid/clock';
import NoteActions from './NoteActions';
import NoteBody from './NoteBody';

export default function NoteCard(props: {
  note: TimelineNote;
  actor?: string;
  /** The connected account: the one author whose name and username are known. */
  self?: Actor;
  onReply: (note: TimelineNote) => void;
  onThread?: (note: TimelineNote) => void;
  onOpenParent?: (note: TimelineNote) => void;
  /** Opens the in-app author sheet; without it the name links to the profile on its server. */
  onAuthor?: (author: string) => void;
  onReact?: (note: TimelineNote, kind: ReactionKind) => void;
  onSave?: (note: TimelineNote) => void;
  /** Offered on the reader's own notes only; deleting always goes through a confirmation. */
  onEdit?: (note: TimelineNote) => void;
  onDelete?: (note: TimelineNote) => void;
  confirmingDelete?: boolean;
  onCancelDelete?: () => void;
  deleteRef?: (el: HTMLButtonElement) => void;
  /** The loaded parent, so the reply cue can say whose note this answers and with what words. */
  parent?: Pick<TimelineNote, 'author' | 'content' | 'summary'>;
  /** The parent is known to be gone: the cue says so and offers no link to a 410. */
  parentGone?: boolean;
  /**
   * The parent is the card drawn right above this one (a conversation column): the cue
   * would only repeat what the eye already sees, so it is left off.
   */
  parentAdjacent?: boolean;
  /**
   * Every loaded note is the reader's own: the "내 글" badge and the handle would repeat the
   * same fact on every card, so both stay off until someone else's note is loaded.
   */
  soloAuthor?: boolean;
  saved?: boolean;
  replies?: number;
  disabled?: boolean;
  focused?: boolean;
  /** Which reaction on this note is in flight; only that button shows the pending state. */
  pending?: ReactionKind;
  /** A reaction failure to show right under the action row. */
  feedback?: string;
  /** Whether an unsent reply draft exists, so the reply button can point to it. */
  hasDraft?: boolean;
  /** Roving tab stop for list keyboard navigation: 0 for the current card, -1 for the rest. */
  tabindex?: number;
  /** Content-warning reveal held by the view model, so it survives re-reads. */
  revealed: boolean;
  onToggleReveal: (id: string) => void;
}) {
  const now = useClock();
  const name = () => actorName(props.note.author, props.self);
  const author = () => name().primary;
  let feedbackEl: HTMLElement | undefined;
  // A tap near the bottom edge would otherwise push its own feedback below the fold.
  createEffect(
    () => props.feedback,
    (feedback) => {
      if (feedback) feedbackEl?.scrollIntoView({ block: 'nearest' });
    },
  );
  const own = () => !!props.actor && props.note.author === props.actor;
  const permalink = () => safeHttpUrl(props.note.url || props.note.id);
  const parentLink = () => safeHttpUrl(props.note.inReplyTo);
  const hue = () => authorHue(props.note.author);
  /** "author: first words · 원글 보기" once the parent is loaded; the bare marker otherwise. */
  const parentCue = () =>
    props.parent ? replyCueText(props.note, props.parent, props.self) : copy.openParent;
  const time = () => (
    <time datetime={props.note.published} title={absoluteTime(props.note.published)}>
      {relativeTime(props.note.published, now())}
    </time>
  );
  return (
    <article
      class={props.focused ? 'note-card note-card--focused' : 'note-card'}
      aria-label={copy.noteBy(author())}
      data-note={props.note.id}
      tabindex={props.tabindex}
    >
      <div class="avatar" data-hue={hue()} aria-hidden="true">
        {avatarInitial(author())}
      </div>
      <div class="note-body">
        <Show when={props.note.announcedBy.length}>
          <p class="note-context shared-by">
            <Icon name="repeat" class="icon--sm" />
            {copy.sharedBy(
              props.note.announcedBy.map((id) => actorLabelOf(id, props.self)).join(', '),
            )}
          </p>
        </Show>
        <header class="note-header">
          <Show
            when={props.onAuthor}
            fallback={
              <a
                class="author"
                href={safeHttpUrl(props.note.author)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {author()}
              </a>
            }
          >
            <button
              type="button"
              class="author"
              aria-label={copy.actor.open(author())}
              title={copy.actor.open(author())}
              onClick={() => props.onAuthor?.(props.note.author)}
            >
              {author()}
            </button>
          </Show>
          {/* The address, after the name: two people with the same name on different servers
              stay apart, and a name that is only a username still shows its server. */}
          <Show when={!props.soloAuthor && name().secondary}>
            {(handle) => <span class="author-handle">{handle()}</span>}
          </Show>
          {/* On a one-person server every handle shares the host; the word says whose note
              this is without asking the reader to compare IRIs or read a colour - unless
              every loaded note is mine, when it would say nothing at all. */}
          <Show when={own() && !props.soloAuthor}>
            <span class="own-badge" title={copy.own.badgeLabel}>
              {copy.own.badge}
            </span>
          </Show>
          <Show when={permalink()} fallback={<span class="timestamp">{time()}</span>}>
            <a
              class="timestamp"
              href={permalink()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.permalink}
            >
              {time()}
            </a>
          </Show>
        </header>
        <Show when={props.note.inReplyTo && !props.parentAdjacent}>
          <Show
            when={props.parent && props.onOpenParent}
            fallback={
              <Show
                when={parentLink() && !props.parentGone}
                fallback={
                  <span class="note-context reply-context">
                    <Icon name="corner-down-right" class="icon--sm" />
                    {props.parentGone ? copy.parentDeleted : copy.parentUnavailable}
                  </span>
                }
              >
                <a
                  class="note-context reply-context"
                  href={parentLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="corner-down-right" class="icon--sm" />
                  {copy.openParent}
                  <Icon name="external" class="icon--sm icon--trail" />
                </a>
              </Show>
            }
          >
            <button
              type="button"
              class="note-context reply-context reply-context--button"
              onClick={() => props.onOpenParent?.(props.note)}
            >
              <Icon name="corner-down-right" class="icon--sm" />
              {parentCue()}
            </button>
          </Show>
        </Show>
        <NoteBody
          note={props.note}
          revealed={props.revealed}
          onToggleReveal={props.onToggleReveal}
        />
        {/* An edit is dated: "수정됨" alone would not say whether it happened just now or
            long after the note was read. */}
        <Show when={isEdited(props.note)}>
          <span class="note-context note-edited">
            <Icon name="pencil" class="icon--sm" />
            {copy.editedAt(relativeTime(props.note.updated, now()))}
            <time
              class="sr-only"
              datetime={props.note.updated}
              title={absoluteTime(props.note.updated)}
            >
              {absoluteTime(props.note.updated)}
            </time>
          </span>
        </Show>
        {/* What sharing this note would do, said before the control that does it. */}
        <Show when={shareScope(props.note.visibility)}>
          {(scope) => <p class="share-scope">{scope()}</p>}
        </Show>
        <NoteActions
          note={props.note}
          actor={props.actor}
          author={author()}
          onReply={props.onReply}
          onThread={props.onThread}
          onReact={props.onReact}
          onSave={props.onSave}
          saved={props.saved}
          replies={props.replies}
          disabled={props.disabled}
          pending={props.pending}
          hasDraft={props.hasDraft}
          own={own()}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          confirming={props.confirmingDelete}
          onCancelDelete={props.onCancelDelete}
          deleteRef={props.deleteRef}
        />
        <Show when={props.feedback}>
          <p role="alert" class="note-feedback" ref={(el) => (feedbackEl = el)}>
            {props.feedback}
          </p>
        </Show>
      </div>
    </article>
  );
}
