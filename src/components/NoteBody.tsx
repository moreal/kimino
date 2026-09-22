import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Attachment, TimelineNote } from '../domain/social';
import { safeContent } from '../infrastructure/sanitize';
import { createImageResource } from '../presentation/image-resource';
import { useImageRead, createImageObjectUrl } from '../presentation/solid/image-read-context';
import { contentCopy } from '../presentation/copy';
import { warnedRevealed } from '../presentation/note-display';
import { useRevealWarned } from '../presentation/solid/reveal-preference';
import Icon from './Icons';
import WarningGate from './WarningGate';
import {
  attachmentAction,
  attachmentAlt,
  attachmentKindLabel,
  attachmentSummary,
  hasContentWarning,
  visibilityInfo,
  visibilityText,
  visibilityWord,
} from '../presentation/note-body';

/** One attachment row; media is never fetched until the reader asks for it. */
function AttachmentRow(props: { attachment: Attachment; noteId: string; restricted: boolean }) {
  const reader = useImageRead();
  const protectedRead = () => props.restricted && !!reader?.enabled();
  const [source, setSource] = createSignal<string>();
  const [loaded, setLoaded] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let image: HTMLImageElement | undefined;
  let disposed = false;
  const resource = createImageResource({
    load: (signal) => reader!.load(props.noteId, props.attachment.url, signal),
    createResource: createImageObjectUrl,
    update: (state) => {
      image = undefined;
      setSource(state.url);
      setLoaded(state.phase === 'loading' || state.phase === 'ready');
      setLoading(state.phase === 'loading' || state.phase === 'ready');
      setFailed(state.phase === 'failed');
    },
  });
  const hide = () => {
    resource.hide();
    image = undefined;
    setSource(undefined);
    setLoaded(false);
    setLoading(false);
    setFailed(false);
  };
  createEffect(
    () => [props.attachment.url, props.noteId, protectedRead(), reader?.identity()] as const,
    () => hide(),
  );
  onCleanup(() => {
    disposed = true;
    resource.dispose();
    image = undefined;
  });
  const alt = () => attachmentAlt(props.attachment);
  return (
    <li class="attachment" data-kind={props.attachment.kind}>
      <div class="attachment-row">
        <span class="attachment-kind">
          <Icon name={props.attachment.kind} class="icon--sm" />
          {attachmentKindLabel(props.attachment.kind)}
        </span>
        <span
          class={props.attachment.alt ? 'attachment-alt' : 'attachment-alt attachment-alt--none'}
        >
          {alt()}
        </span>
        <Show
          when={props.attachment.kind === 'image'}
          fallback={
            <a
              class="attachment-action"
              href={props.attachment.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {attachmentAction(props.attachment.kind)}
              <Icon name="external" class="icon--sm" />
            </a>
          }
        >
          <button
            type="button"
            class="attachment-action"
            onClick={() => {
              if (loaded()) {
                hide();
                return;
              }
              if (protectedRead()) {
                void resource.show();
              } else {
                setFailed(false);
                setLoading(true);
                setSource(props.attachment.url);
                setLoaded(true);
              }
            }}
          >
            {loaded()
              ? contentCopy.hideImage
              : failed()
                ? contentCopy.retryImage
                : contentCopy.loadImage}
          </button>
        </Show>
      </div>
      <Show when={failed()}>
        <p class="attachment-error" role="alert">
          {contentCopy.imageFailed}
        </p>
      </Show>
      <Show when={loading()}>
        <p class="attachment-status" role="status">
          {contentCopy.imageLoading}
        </p>
      </Show>
      <Show when={props.attachment.kind === 'image' && loaded() && source()}>
        <img
          class="attachment-image"
          src={source()}
          alt={props.attachment.alt ?? ''}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          ref={(element) => {
            image = element;
          }}
          onLoad={(event) => {
            if (!disposed && event.currentTarget === image) setLoading(false);
          }}
          onError={(event) => {
            if (disposed || event.currentTarget !== image) return;
            if (protectedRead()) resource.failed(source());
            else {
              image = undefined;
              setSource(undefined);
              setLoading(false);
              setLoaded(false);
              setFailed(true);
            }
          }}
        />
      </Show>
    </li>
  );
}

/** Body of a note: visibility indicator, content warning gate, sanitized text, attachments on demand. */
export default function NoteBody(props: {
  note: TimelineNote;
  /**
   * The per-note toggle behind a content warning, held by the view model so a re-read of
   * the timeline does not close it again. With the browser preference that opens every
   * warned note, the same toggle closes this one instead.
   */
  revealed: boolean;
  onToggleReveal: (id: string) => void;
}) {
  const alwaysOpen = useRevealWarned();
  const expanded = () => warnedRevealed(alwaysOpen(), props.revealed);
  const toggle = () => props.onToggleReveal(props.note.id);
  const warned = () => hasContentWarning(props.note);
  const body = () => (
    <>
      <div class="note-content" innerHTML={safeContent(props.note.content)} />
      <Show when={props.note.attachments.length}>
        <ul
          class="attachments"
          aria-label={contentCopy.attachmentsLabel(attachmentSummary(props.note.attachments))}
        >
          <For each={props.note.attachments}>
            {(attachment) => (
              <AttachmentRow
                attachment={attachment}
                noteId={props.note.id}
                restricted={
                  props.note.visibility !== 'public' && props.note.visibility !== 'unlisted'
                }
              />
            )}
          </For>
        </ul>
      </Show>
    </>
  );
  return (
    <>
      <Show when={props.note.visibility !== 'public'}>
        {/* The word is drawn for everyone; the reader hears the whole sentence instead. */}
        <span class="visibility-badge" title={visibilityText(props.note.visibility)}>
          <Icon name={visibilityInfo(props.note.visibility).icon} class="icon--sm" />
          <span class="visibility-word" aria-hidden="true">
            {visibilityWord(props.note.visibility)}
          </span>
          <span class="sr-only">{visibilityText(props.note.visibility)}</span>
        </span>
      </Show>
      <Show when={warned()} fallback={body()}>
        <WarningGate summary={props.note.summary!} expanded={expanded()} onToggle={toggle} />
        <Show when={expanded()}>{body()}</Show>
      </Show>
    </>
  );
}
