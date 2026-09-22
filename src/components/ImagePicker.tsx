import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import type { ImageDraft } from '../domain/images';
import type { ImageUploadState } from '../application/image-types';
import type { ComposeVisibility } from '../domain/social';
import {
  imageAccept,
  imageAudienceAllowed,
  imageDraftProblem,
  imageFileProblem,
  imageLimits,
  imageMediaType,
  imageSelectionProblem,
  localImagePreview,
} from '../presentation/image-authoring';
import { imageProblemText, imageUploadText, mediaCopy } from '../presentation/copy-media';

export default function ImagePicker(props: {
  images: readonly ImageDraft[];
  uploads: Readonly<Record<string, ImageUploadState>>;
  enabled: boolean;
  privateEnabled?: boolean;
  visibility: ComposeVisibility;
  busy: boolean;
  onAdd: (image: Omit<ImageDraft, 'id'>) => void;
  onRemove: (id: string) => void;
  onAlt: (id: string, alt: string) => void;
  onResolve: (id: string) => Promise<void>;
  onReading: (busy: boolean) => void;
}) {
  const [error, setError] = createSignal('');
  const [reading, setReading] = createSignal(false);
  const [resolving, setResolving] = createSignal<string>();
  const allowed = () =>
    props.enabled && imageAudienceAllowed(props.visibility, props.privateEnabled);
  let input: HTMLInputElement | undefined;
  let fieldset: HTMLFieldSetElement | undefined;
  let reader: FileReader | undefined;
  let generation = 0;
  let disposed = false;
  const setReadingState = (value: boolean) => {
    setReading(value);
    props.onReading(value);
  };
  const cancelReading = () => {
    generation++;
    reader?.abort();
    reader = undefined;
    // Cancellation observes the current read; it does not subscribe to future reads.
    if (untrack(reading)) setReadingState(false);
  };
  createEffect(allowed, (value) => {
    if (!value) cancelReading();
  });
  onCleanup(() => {
    const wasReading = untrack(reading);
    disposed = true;
    generation++;
    reader?.abort();
    reader = undefined;
    // Solid 2 cleanup runs inside an owned scope: never write signals there.
    if (wasReading) queueMicrotask(() => props.onReading(false));
  });

  async function selectFiles(files: readonly File[]) {
    if (!files.length || !allowed() || props.busy || reading()) return;
    setError('');
    if (props.images.length + files.length > imageLimits.count) {
      setError(imageProblemText('count'));
      return;
    }
    for (const file of files) {
      const problem = imageFileProblem(file);
      if (problem) {
        setError(imageProblemText(problem));
        return;
      }
    }
    const current = ++generation;
    const focusedAtSelection = document.activeElement;
    const firstNewIndex = props.images.length;
    const active = () => !disposed && current === generation && allowed();
    setReadingState(true);
    try {
      const additions: ImageDraft[] = [];
      for (const [index, file] of files.entries()) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const next = new FileReader();
          reader = next;
          next.onload = () => (typeof next.result === 'string' ? resolve(next.result) : reject());
          next.onerror = () => reject();
          next.onabort = () => reject();
          next.readAsDataURL(file);
        });
        if (!active()) return;
        const image: ImageDraft = {
          id: `selection-${current}-${index}`,
          dataUrl,
          mediaType: imageMediaType(file.type)!,
          bytes: file.size,
          alt: '',
        };
        const problem = imageDraftProblem(image);
        if (problem) {
          setError(imageProblemText(problem));
          return;
        }
        additions.push(image);
      }
      const problem = imageSelectionProblem([...props.images, ...additions]);
      if (problem) {
        setError(imageProblemText(problem));
        return;
      }
      for (const { id: _id, ...image } of additions) props.onAdd(image);
      queueMicrotask(() =>
        requestAnimationFrame(() => {
          // Guide the explicit add action to its description without stealing focus
          // if the writer has moved elsewhere while the file was being read.
          if (!active() || document.activeElement !== focusedAtSelection) return;
          const alt = fieldset?.querySelectorAll<HTMLTextAreaElement>('.image-picker-alt textarea')[
            firstNewIndex
          ];
          alt?.focus({ preventScroll: true });
          alt?.scrollIntoView({ block: 'nearest' });
        }),
      );
    } catch {
      if (active()) setError(mediaCopy.readFailed);
    } finally {
      if (current === generation && !disposed) {
        reader = undefined;
        setReadingState(false);
      }
    }
  }

  async function resolveUpload(id: string) {
    if (resolving() || props.busy || !props.enabled) return;
    setError('');
    setResolving(id);
    const current = generation;
    try {
      await props.onResolve(id);
    } catch {
      if (!disposed && current === generation) setError(mediaCopy.resolveFailed);
    } finally {
      if (!disposed) setResolving(undefined);
    }
  }

  return (
    <fieldset class="image-picker" ref={(el) => (fieldset = el)}>
      <legend class="sr-only">{mediaCopy.legend}</legend>
      <div class="image-picker-toolbar">
        <button
          type="button"
          class="quiet-button"
          disabled={
            !allowed() || props.busy || reading() || props.images.length >= imageLimits.count
          }
          onClick={() => input?.click()}
        >
          {mediaCopy.add}
        </button>
        <span class="image-picker-count">{mediaCopy.count(props.images.length)}</span>
        <input
          ref={(el) => {
            input = el;
          }}
          hidden
          type="file"
          accept={imageAccept}
          multiple
          tabindex={-1}
          aria-label={mediaCopy.add}
          disabled={!allowed() || props.busy || reading()}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void selectFiles(files);
          }}
        />
      </div>
      <p class="image-picker-help">
        {!imageAudienceAllowed(props.visibility, props.privateEnabled)
          ? mediaCopy.scope
          : !props.enabled
            ? mediaCopy.unsupported
            : mediaCopy.limits}
      </p>
      <Show
        when={
          props.enabled &&
          (imageAudienceAllowed(props.visibility, props.privateEnabled) || props.images.length > 0)
        }
      >
        <p class="image-picker-disclosure">
          {props.visibility === 'public' || props.visibility === 'unlisted'
            ? mediaCopy.beforeSubmit
            : mediaCopy.beforePrivateSubmit}
        </p>
      </Show>
      <Show when={reading()}>
        <p role="status" class="image-picker-status">
          {mediaCopy.reading}
        </p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="image-picker-error">
          {error()}
        </p>
      </Show>
      <Show when={props.images.length > 0}>
        <p class="image-picker-help">{mediaCopy.altHelp}</p>
        <ol class="image-picker-list" aria-label={mediaCopy.list}>
          <For each={props.images} keyed={(image) => image.id}>
            {(image, index) => (
              <li class="image-picker-item">
                <Show when={localImagePreview(image())}>
                  {(src) => (
                    <img
                      class="image-picker-preview"
                      src={src()}
                      alt={image().alt || mediaCopy.preview(index() + 1)}
                      width={120}
                      height={90}
                    />
                  )}
                </Show>
                <div class="image-picker-details">
                  <label class="image-picker-alt">
                    <span>{mediaCopy.altLabel(index() + 1)}</span>
                    <textarea
                      rows={2}
                      maxlength={imageLimits.alt}
                      value={image().alt}
                      disabled={props.busy || !props.enabled}
                      onInput={(event) => props.onAlt(image().id, event.currentTarget.value)}
                    />
                  </label>
                  <p class="image-picker-status" role="status">
                    {imageUploadText(props.uploads[image().id])}
                  </p>
                  <div class="image-picker-actions">
                    <button
                      type="button"
                      class="quiet-button"
                      disabled={props.busy || !!resolving()}
                      onClick={() => props.onRemove(image().id)}
                    >
                      {mediaCopy.remove(index() + 1)}
                    </button>
                    <Show
                      when={
                        props.uploads[image().id]?.phase === 'unresolved' &&
                        props.uploads[image().id]?.location
                      }
                    >
                      <button
                        type="button"
                        class="quiet-button"
                        disabled={props.busy || !!resolving() || !props.enabled}
                        onClick={() => void resolveUpload(image().id)}
                      >
                        {resolving() === image().id ? mediaCopy.resolving : mediaCopy.resolve}
                      </button>
                    </Show>
                  </div>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </fieldset>
  );
}
