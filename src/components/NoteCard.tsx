import { createEffect, Show } from 'solid-js';
import type { ReactionKind, TimelineNote } from '../domain/social';
import { actorLabel, safeContent, safeHttpUrl } from '../ui/content';
import { absoluteTime, relativeTime } from '../presentation/time';
import { useClock } from '../presentation/clock';

export default function NoteCard(props: {
  note: TimelineNote;
  actor?: string;
  onReply: (note: TimelineNote) => void;
  onThread?: (note: TimelineNote) => void;
  onOpenParent?: (note: TimelineNote) => void;
  onReact?: (note: TimelineNote, kind: ReactionKind) => void;
  onSave?: (note: TimelineNote) => void;
  parentLoaded?: boolean;
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
}) {
  const now = useClock();
  const author = () => actorLabel(props.note.author);
  let feedbackEl: HTMLElement | undefined;
  // A tap near the bottom edge would otherwise push its own feedback below the fold.
  createEffect(
    () => props.feedback,
    (feedback) => {
      if (feedback) feedbackEl?.scrollIntoView({ block: 'nearest' });
    },
  );
  const permalink = () => safeHttpUrl(props.note.url || props.note.id);
  const parentLink = () => safeHttpUrl(props.note.inReplyTo);
  const liked = () => !!props.actor && (props.note.likedBy ?? []).includes(props.actor);
  const shared = () => !!props.actor && (props.note.announcedBy ?? []).includes(props.actor);
  const likes = () => (props.note.likedBy ?? []).length;
  const shares = () => (props.note.announcedBy ?? []).length;
  const withCount = (label: string, count: number) => (count > 0 ? `${label} ${count}` : label);
  /** Purely presentational: a stable 0..5 palette index derived from the author IRI. */
  const hue = () => {
    let hash = 0;
    for (const char of props.note.author) hash = (hash * 31 + char.charCodeAt(0)) % 6;
    return hash;
  };
  const time = () => (
    <time datetime={props.note.published} title={absoluteTime(props.note.published)}>
      {relativeTime(props.note.published, now())}
    </time>
  );
  return (
    <article
      class={props.focused ? 'note-card note-card--focused' : 'note-card'}
      aria-label={`${author()}의 글`}
    >
      <div class="avatar" data-hue={hue()} aria-hidden="true">
        {author().slice(0, 1).toUpperCase()}
      </div>
      <div class="note-body">
        <Show when={props.note.announcedBy.length}>
          <p class="note-context">↗ {props.note.announcedBy.map(actorLabel).join(', ')}님이 공유</p>
        </Show>
        <header class="note-header">
          <a
            class="author"
            href={safeHttpUrl(props.note.author)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {author()}
          </a>
          <Show when={permalink()} fallback={<span class="timestamp">{time()}</span>}>
            <a
              class="timestamp"
              href={permalink()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="원문 보기"
            >
              {time()}
            </a>
          </Show>
        </header>
        <Show when={props.note.inReplyTo}>
          <Show
            when={props.parentLoaded && props.onOpenParent}
            fallback={
              <Show
                when={parentLink()}
                fallback={<span class="note-context reply-context">↳ 답글</span>}
              >
                <a
                  class="note-context reply-context"
                  href={parentLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ↳ 답글 · 원문 보기 ↗
                </a>
              </Show>
            }
          >
            <button
              type="button"
              class="note-context reply-context reply-context--button"
              onClick={() => props.onOpenParent?.(props.note)}
            >
              ↳ 답글 · 원글 대화 열기
            </button>
          </Show>
        </Show>
        <div class="note-content" innerHTML={safeContent(props.note.content)} />
        <Show
          when={
            props.note.updated &&
            Date.parse(props.note.updated) > Date.parse(props.note.published || '')
          }
        >
          <span class="note-context">수정됨</span>
        </Show>
        <footer class="note-actions">
          <button
            class="text-button"
            disabled={props.disabled}
            onClick={() => props.onReply(props.note)}
            aria-label={`${author()}에게 답글 달기`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M8 9h8M8 13h5M5 19l1-4a8 8 0 1 1 3 3z" />
            </svg>
            답글
            <Show when={props.hasDraft}>
              <span class="draft-badge">초안 있음</span>
            </Show>
          </button>
          <Show when={props.onReact}>
            <button
              class="text-button reaction-button share-button"
              aria-pressed={shared() ? 'true' : 'false'}
              aria-busy={props.pending === 'share' ? 'true' : undefined}
              aria-label={withCount('공유', shares())}
              disabled={props.disabled}
              onClick={() => props.onReact?.(props.note, 'share')}
            >
              <span aria-hidden="true">↻</span> {withCount('공유', shares())}
            </button>
            <button
              class="text-button reaction-button like-button"
              aria-pressed={liked() ? 'true' : 'false'}
              aria-busy={props.pending === 'like' ? 'true' : undefined}
              aria-label={withCount('좋아요', likes())}
              disabled={props.disabled}
              onClick={() => props.onReact?.(props.note, 'like')}
            >
              <span aria-hidden="true">{liked() ? '♥' : '♡'}</span> {withCount('좋아요', likes())}
            </button>
          </Show>
          <Show when={props.onSave}>
            <button
              class="text-button save-button"
              aria-pressed={props.saved ? 'true' : 'false'}
              onClick={() => props.onSave?.(props.note)}
            >
              {props.saved ? '저장됨' : '저장'}
            </button>
          </Show>
          <Show when={props.onThread}>
            <button
              class="text-button thread-button"
              data-thread={props.note.id}
              onClick={() => props.onThread?.(props.note)}
            >
              대화 보기
              <Show when={props.replies}>
                {' '}
                <span class="count">답글 {props.replies}</span>
              </Show>
            </button>
          </Show>
        </footer>
        <Show when={props.feedback}>
          <p role="alert" class="note-feedback" ref={(el) => (feedbackEl = el)}>
            {props.feedback}
          </p>
        </Show>
      </div>
    </article>
  );
}
