import { Show } from 'solid-js';
import type { FeedState } from '../presentation/feed-view-model';
import { copy, disconnectLabel, syncSummary } from '../presentation/copy';
import { actorLabel } from '../ui/content';

export default function ContextColumn(props: { state: FeedState; onDisconnect: () => void }) {
  return (
    <aside class="context-column">
      <Show
        when={props.state.actor}
        fallback={
          <div class="welcome-aside">
            <span class="section-kicker">더 조용한 소셜</span>
            <h2>
              모든 이야기에
              <br />
              숫자가 필요하진
              <br />
              않으니까.
            </h2>
            <p>
              알고리즘 대신 시간의 순서로.
              <br />
              스크롤 너머의 사람에게 집중하는 공간.
            </p>
            <span class="large-flower" aria-hidden="true">
              ✳
            </span>
          </div>
        }
      >
        {(actor) => (
          <>
            <section class="context-card profile-card">
              <span class="eyebrow">
                {props.state.demo ? copy.demoAccount : copy.connectedAccount}
              </span>
              <div class="avatar self profile-avatar">{(actor().name || '나').slice(0, 1)}</div>
              <h2>{actor().name || actor().preferredUsername || '나의 계정'}</h2>
              <p class="profile-address">{actorLabel(actor().id)}</p>
              <span class="status-pill">
                <span class="connection-dot" />
                {props.state.demo ? copy.demoStatus : copy.connectedStatus}
              </span>
              <p class="profile-meta">
                {syncSummary(props.state.loadedAt, props.state.timeline?.diagnostics.ignored)}
              </p>
              <button class="disconnect-button" onClick={props.onDisconnect}>
                {disconnectLabel(props.state.demo)}
              </button>
            </section>
            <section class="reading-note">
              <span class="section-kicker">작은 사용 안내</span>
              <h2>이야기를 이어가세요.</h2>
              <p>
                <strong>답글</strong> 수를 누르면 원문과 답글을 함께 읽고, <strong>저장</strong>으로
                다시 읽을 글을 모아둘 수 있어요.
              </p>
              <p>초안은 이 탭에서만 유지돼요. 새로고침이나 연결 해제 전에 게시해주세요.</p>
            </section>
          </>
        )}
      </Show>
      <footer class="site-footer">KIMINO · OPEN SOCIAL, AT YOUR PACE</footer>
    </aside>
  );
}
