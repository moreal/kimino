import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Actor, ComposeVisibility, NoteDraft, TimelineNote } from '../domain/social';
import { safeContent } from '../infrastructure/sanitize';
import { contentCopy, copy, joinLine } from '../presentation/copy';
import type { FailureMessage } from '../presentation/copy-failures';
import type { ComposeOptions } from '../presentation/feed-selectors';
import { NOTE_LIMITS } from '../presentation/design-tokens';
import { actorLabelOf } from '../presentation/actor-name';
import {
  effectiveReplyVisibility,
  hasContentWarning,
  replyVisibility,
  replyWarning,
  visibilityInfo,
  visibilityOptions,
  visibilityText,
} from '../presentation/note-body';
import FailureAlert from './FailureAlert';
import Icon from './Icons';
import WarningGate from './WarningGate';

/**
 * The draft ceiling, the domain's. It is not a `maxlength`: silently swallowing the tail of
 * a pasted paragraph loses words the writer cannot see. The count says how far over it is
 * and the publish button refuses until the draft fits.
 */
const LIMIT = NOTE_LIMITS.content;

/** A rejected publish is shown right here, under the button that sent it; the draft stays. */
export default function Composer(props: {
  replyTo?: TimelineNote;
  /** The connected account, so a reply to my own note names me the way the card does. */
  self?: Actor;
  /**
   * Editing this note instead of writing a new one. The form carries the stored words and
   * warning; the scope is shown but not offered, because an edit rewrites the text of a
   * published note and never its audience.
   */
  editing?: TimelineNote;
  onSubmit: (draft: NoteDraft, replyTo?: TimelineNote) => Promise<void>;
  onCancel?: () => void;
  draft?: string;
  onDraft?: (value: string) => void;
  /** Warning/visibility kept by the owner alongside `draft`; local state otherwise. */
  options?: ComposeOptions;
  onOptions?: (value: ComposeOptions) => void;
  /** The failure of this composer's last publish, owned by the feed view model. */
  error?: FailureMessage;
  disabled?: boolean;
}) {
  const [localText, setLocalText] = createSignal('');
  const text = () => props.draft ?? localText();
  const setText = (value: string) => {
    setLocalText(value);
    props.onDraft?.(value);
  };
  const limits = () => replyVisibility(props.replyTo);
  /**
   * A reply starts from its parent: the parent's visibility limit and, so a warned
   * conversation stays warned, the parent's own warning. Both stay editable.
   */
  const defaults = (): ComposeOptions => ({
    summary: replyWarning(props.replyTo),
    visibility: limits().initial,
  });
  const [localOptions, setLocalOptions] = createSignal<ComposeOptions>(defaults());
  const options = () => props.options ?? localOptions();
  const setOptions = (patch: Partial<ComposeOptions>) => {
    const next = { ...options(), ...patch };
    setLocalOptions(next);
    props.onOptions?.(next);
  };
  // A persisted or stale choice wider than the parent is narrowed by the domain rule.
  const visibility = (): ComposeVisibility =>
    effectiveReplyVisibility(options().visibility, props.replyTo);
  /** The parent's own content warning stays closed in the preview until the writer opens it. */
  const [parentOpen, setParentOpen] = createSignal(false);
  const [warning, setWarning] = createSignal(false);
  const warningOpen = () => warning() || options().summary.length > 0;
  let warningInput: HTMLInputElement | undefined;
  const toggleWarning = () => {
    const opening = !warningOpen();
    if (!opening) setOptions({ summary: '' });
    setWarning(opening);
    // Adding a warning is a request to write one: put the caret in the field it just opened.
    if (opening) queueMicrotask(() => warningInput?.focus());
  };
  /**
   * The main composer starts as a one-line prompt and expands when the writer focuses it.
   * It does not fold back on blur: shrinking under the pointer would move whatever the
   * writer taps next (an option, a card button) away before the click lands.
   */
  const [expanded, setExpanded] = createSignal(false);
  const collapsed = () => !expanded() && !text() && !options().summary;
  const [pending, setPending] = createSignal(false);
  /** Past the ceiling the publish is refused here, before a request the server would reject. */
  const over = () => text().length > LIMIT;
  let submitting = false;
  async function submit(event?: Event) {
    event?.preventDefault();
    const draft = text().trim();
    if (!draft || over() || submitting || props.disabled) return;
    submitting = true;
    setPending(true);
    try {
      const summary = options().summary.trim();
      await props.onSubmit(
        { content: draft, summary: summary || undefined, visibility: visibility() },
        props.replyTo,
      );
      setText('');
      setLocalOptions(defaults());
      setWarning(false);
      setExpanded(false);
    } catch {
      /* The draft stays; the failure is shown in the page alert. */
    } finally {
      submitting = false;
      setPending(false);
    }
  }
  const busy = () => pending() || props.disabled;
  let errorEl: HTMLElement | undefined;
  // On a phone the composer can sit well below the page alert; bring the failure to the writer.
  createEffect(
    () => props.error,
    (error) => {
      if (!error || !errorEl) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      errorEl.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      errorEl.focus({ preventScroll: true });
    },
  );
  /**
   * Escape closes a reply composer from anywhere inside it - the text, the warning field,
   * its toggle, the visibility radios - with the same draft-preserving semantics; the owner
   * keeps whatever was typed. Handled on the form so the conversation's own Escape (which
   * checks `defaultPrevented`) never fires instead.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if ((!props.replyTo && !props.editing) || !props.onCancel || pending()) return;
    event.preventDefault();
    props.onCancel();
  };
  return (
    <form
      class={collapsed() ? 'composer composer--collapsed' : 'composer'}
      onSubmit={submit}
      onKeyDown={onKeyDown}
    >
      <Show when={props.editing}>
        <div class="reply-heading">
          <span>{copy.editComposer.heading}</span>
        </div>
      </Show>
      <Show when={props.replyTo}>
        <div class="reply-heading">
          <span>{copy.composer.replyHeading(actorLabelOf(props.replyTo!.author, props.self))}</span>
        </div>
      </Show>
      <Show when={props.replyTo}>
        {(parent) => (
          <blockquote class="compose-parent">
            {/* A warning the reader has not opened still stands here: quoting the body into
                the composer would walk straight past the gate the card puts in front of it. */}
            <Show
              when={hasContentWarning(parent())}
              fallback={<div innerHTML={safeContent(parent().content)} />}
            >
              <WarningGate
                summary={parent().summary!}
                expanded={parentOpen()}
                onToggle={() => setParentOpen((value) => !value)}
              />
              <Show when={parentOpen()}>
                <div innerHTML={safeContent(parent().content)} />
              </Show>
            </Show>
          </blockquote>
        )}
      </Show>
      <Show when={warningOpen()}>
        <label class="compose-warning">
          <span class="compose-warning-label">
            <Icon name="warning" class="icon--sm" />
            {contentCopy.warningLabel}
          </span>
          <input
            type="text"
            placeholder={contentCopy.warningPlaceholder}
            value={options().summary}
            maxlength={NOTE_LIMITS.summary}
            disabled={busy()}
            ref={(el) => (warningInput = el)}
            onInput={(event) => setOptions({ summary: event.currentTarget.value })}
          />
        </label>
      </Show>
      <div class="compose-row">
        <div class="avatar self" aria-hidden="true">
          {copy.composer.self}
        </div>
        <label class="compose-input">
          <span class="sr-only">
            {props.editing
              ? copy.editComposer.heading
              : props.replyTo
                ? copy.composer.replyLabel
                : copy.composer.newLabel}
          </span>
          {/* An edit starts full, so it asks no question: no placeholder at all. */}
          <textarea
            placeholder={
              props.editing
                ? undefined
                : props.replyTo
                  ? copy.composer.replyPlaceholder
                  : copy.composer.newPlaceholder
            }
            value={text()}
            disabled={busy()}
            rows={3}
            onFocus={() => setExpanded(true)}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submit(event);
            }}
          />
        </label>
      </div>
      <div class="compose-options">
        {/* The scope of a published note is reported, not offered: this client cannot
            reproduce the original recipients faithfully, so an edit leaves them alone. One
            line says so; the footer does not repeat the word under it. */}
        <Show
          when={!props.editing}
          fallback={
            <p class="compose-scope compose-scope--fixed">
              {copy.editComposer.scopeFixed(visibilityText(props.editing!.visibility))}
            </p>
          }
        >
          <fieldset class="visibility-picker" disabled={busy()}>
            <legend class="sr-only">{contentCopy.visibilityLegend}</legend>
            <For each={visibilityOptions}>
              {(option) => (
                <label
                  class={
                    option.value === visibility()
                      ? 'visibility-option visibility-option--active'
                      : 'visibility-option'
                  }
                >
                  <input
                    type="radio"
                    name={props.replyTo ? `visibility-${props.replyTo.id}` : 'visibility-new'}
                    value={option.value}
                    checked={option.value === visibility()}
                    disabled={limits().disabled.includes(option.value)}
                    onChange={() => setOptions({ visibility: option.value })}
                  />
                  <span>{option.label}</span>
                </label>
              )}
            </For>
          </fieldset>
        </Show>
        <button
          type="button"
          class={
            warningOpen()
              ? 'text-button warning-toggle warning-toggle--on'
              : 'text-button warning-toggle'
          }
          aria-pressed={warningOpen() ? 'true' : 'false'}
          onClick={toggleWarning}
          disabled={busy()}
        >
          {warningOpen() ? contentCopy.removeWarning : contentCopy.addWarning}
        </button>
      </div>
      <Show when={limits().hint}>
        <p class="visibility-limit">{limits().hint}</p>
      </Show>
      <Show when={!collapsed()}>
        <p class="compose-scope">{contentCopy.noAttachments}</p>
      </Show>
      {/* A reply or edit composer opens where its card is, which can be low in the window:
          its submit row is brought into view once it is laid out, moving as little as
          possible, so 게시하기 is never just below the fold of the card that opened it. */}
      <footer
        class="composer-footer"
        ref={(el) => {
          if (!props.replyTo && !props.editing) return;
          queueMicrotask(() =>
            requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' })),
          );
        }}
      >
        <Show when={!props.editing}>
          <span class="visibility">
            {visibilityInfo(visibility()).label}{' '}
            <span class="visibility-hint">· {visibilityInfo(visibility()).description}</span>
          </span>
        </Show>
        <div class="compose-controls">
          {/* The number itself is not a live region: it would speak on every keystroke.
              Only crossing the ceiling is worth interrupting a writer for. */}
          <span class={over() ? 'character-count character-count--over' : 'character-count'}>
            {text().length.toLocaleString()} / {LIMIT.toLocaleString()}
            <Show when={over()}> · {contentCopy.overLimit}</Show>
          </span>
          <span aria-live="polite" class="sr-only">
            {over() ? contentCopy.overLimitHelp : ''}
          </span>
          <button
            class="primary-button"
            type="submit"
            disabled={busy() || over() || !text().trim()}
          >
            {props.editing
              ? pending()
                ? copy.editComposer.pending
                : copy.editComposer.submit
              : pending()
                ? copy.composer.publishing
                : props.replyTo
                  ? copy.composer.publishReply
                  : copy.composer.publish}
            <Icon name="external" />
          </button>
          <Show when={(props.replyTo || props.editing) && props.onCancel}>
            <button
              type="button"
              class="text-button compose-cancel"
              onClick={() => props.onCancel?.()}
              disabled={busy()}
            >
              {props.editing ? copy.editComposer.cancel : copy.composer.cancel}
            </button>
          </Show>
        </div>
      </footer>
      <Show when={props.error}>
        {(error) => (
          <FailureAlert
            class="compose-error"
            heading={props.editing ? copy.composer.editFailed : copy.publishFailed}
            lines={[`${error().text} ${copy.draftKept}`]}
            detail={error().detail}
            ref={(el) => (errorEl = el)}
          />
        )}
      </Show>
      <p class="draft-hint">
        {joinLine(
          text() ? copy.composer.draftKeptHere : '',
          props.editing ? copy.composer.submitKeyEdit : copy.composer.submitKey,
          props.replyTo || props.editing ? copy.composer.escapeCloses : '',
        )}
      </p>
      {/* What the "수정됨" marker depends on, once, behind a disclosure: it is the same on
          every edit, so it is not printed in full on every edit. */}
      <Show when={props.editing}>
        <details class="edit-marker-hint">
          <summary>{copy.editComposer.hintSummary}</summary>
          <p>{copy.editComposer.hint}</p>
        </details>
      </Show>
    </form>
  );
}
