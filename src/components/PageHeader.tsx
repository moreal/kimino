import { Show } from 'solid-js';
import type { FeedState } from '../presentation/feed-view-model';
import { copy } from '../presentation/copy';

/** Title, refresh, demo pill and the page-level alert/status live here; no disconnect control. */
export default function PageHeader(props: {
  state: FeedState;
  onRefresh: () => void;
  onConnectAccount: () => void;
  onDismissError: () => void;
}) {
  return (
    <>
      <header class="page-header">
        <div>
          <span class="eyebrow">{props.state.demo ? copy.demoEyebrow : copy.eyebrow}</span>
          <h1 id="conversation-heading" tabindex={-1}>
            {props.state.title}
          </h1>
        </div>
        <div class="header-actions">
          <Show when={!props.state.demo && props.state.actor}>
            <button
              class="refresh-button"
              disabled={props.state.busy}
              onClick={props.onRefresh}
              aria-label="타임라인 새로고침"
            >
              {props.state.busy ? '불러오는 중…' : '↻ 새로고침'}
            </button>
          </Show>
        </div>
      </header>
      <Show when={props.state.demo}>
        <div class="demo-pill">
          <span>{copy.demoBanner}</span>
          <button class="text-button demo-pill-action" onClick={props.onConnectAccount}>
            {copy.demoBannerAction}
          </button>
        </div>
      </Show>
      <Show when={props.state.threadMissing}>
        <p class="missing-parent">{copy.missingSelection}</p>
      </Show>
      <Show when={props.state.error}>
        <div role="alert" class="page-error">
          <strong>확인이 필요해요</strong>
          <p>{props.state.error}</p>
          <button
            type="button"
            class="page-error-dismiss"
            aria-label="알림 닫기"
            onClick={props.onDismissError}
          >
            ×
          </button>
        </div>
      </Show>
      <div role="status" aria-live="polite" class={props.state.notice ? 'notice' : 'sr-only'}>
        {props.state.notice}
      </div>
    </>
  );
}
