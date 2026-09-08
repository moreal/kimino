import { createSignal, Show } from 'solid-js';
import type { TimelineNote } from '../domain/social';
import { actorLabel, safeContent } from '../ui/content';

/** Failures are reported by the page-level alert; the composer only keeps the draft. */
export default function Composer(props: {
  replyTo?: TimelineNote;
  onSubmit: (text: string, replyTo?: TimelineNote) => Promise<void>;
  onCancel?: () => void;
  draft?: string;
  onDraft?: (value: string) => void;
  disabled?: boolean;
}) {
  const [localText, setLocalText] = createSignal('');
  const text = () => props.draft ?? localText();
  const setText = (value: string) => {
    setLocalText(value);
    props.onDraft?.(value);
  };
  const [pending, setPending] = createSignal(false);
  let submitting = false;
  async function submit(event?: Event) {
    event?.preventDefault();
    const draft = text().trim();
    if (!draft || submitting || props.disabled) return;
    submitting = true;
    setPending(true);
    try {
      await props.onSubmit(draft, props.replyTo);
      setText('');
    } catch {
      /* The draft stays; the failure is shown in the page alert. */
    } finally {
      submitting = false;
      setPending(false);
    }
  }
  return (
    <form class="composer" onSubmit={submit}>
      <Show when={props.replyTo}>
        <div class="reply-heading">
          <span>{actorLabel(props.replyTo!.author)}님에게 답글</span>
          <button
            type="button"
            class="text-button"
            onClick={() => props.onCancel?.()}
            disabled={pending() || props.disabled}
          >
            취소
          </button>
        </div>
      </Show>
      <Show when={props.replyTo}>
        <blockquote class="compose-parent">
          <div innerHTML={safeContent(props.replyTo!.content)} />
        </blockquote>
      </Show>
      <div class="compose-row">
        <div class="avatar self" aria-hidden="true">
          나
        </div>
        <label class="compose-input">
          <span class="sr-only">{props.replyTo ? '답글 내용' : '새 글'}</span>
          <textarea
            placeholder={props.replyTo ? '대화를 이어가 보세요.' : '지금, 어떤 생각을 하고 있나요?'}
            value={text()}
            disabled={pending() || props.disabled}
            maxlength={5000}
            rows={3}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submit(event);
            }}
          />
        </label>
      </div>
      <footer class="composer-footer">
        <span class="visibility">
          ◎ 공개 <span class="visibility-hint">· 누구나 볼 수 있어요</span>
        </span>
        <div class="compose-controls">
          <span class="character-count">{text().length.toLocaleString()} / 5,000</span>
          <button
            class="primary-button"
            type="submit"
            disabled={pending() || props.disabled || !text().trim()}
          >
            {pending() ? '게시 중…' : props.replyTo ? '답글 게시하기' : '게시하기'}{' '}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </footer>
      <p class="draft-hint">{text() ? '이 탭 안에서 초안 유지 · ' : ''}Ctrl / ⌘ + Enter로 게시</p>
    </form>
  );
}
