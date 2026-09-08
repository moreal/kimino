import { createSignal, Show, untrack } from 'solid-js';
export default function ConnectionPanel(props: {
  initialUrl: string;
  busy: boolean;
  error: string;
  onConnect: (url: string, token: string) => void;
  onExplore: () => void;
}) {
  const [url, setUrl] = createSignal(untrack(() => props.initialUrl));
  const [token, setToken] = createSignal('');
  return (
    <section class="connection-panel">
      <span class="section-kicker">나의 속도로, 나의 네트워크에서</span>
      <h1>
        소음은 줄이고,
        <br />
        대화는 가까이.
      </h1>
      <p class="welcome-description">
        시간 순서대로 읽고, 한 사람의 이야기에 집중하세요.
        <br />
        당신의 작은 소셜 공간, Kimino.
      </p>
      <button class="primary-button explore-button" onClick={props.onExplore} disabled={props.busy}>
        먼저 둘러보기 <span aria-hidden="true">→</span>
      </button>
      <p class="field-help">가입 없이 예시 글로 화면을 둘러볼 수 있어요.</p>
      <div class="connection-divider">
        <span>내 계정으로 시작하기</span>
      </div>
      <div class="compatibility-note">
        <strong>C2S 지원 계정이 필요해요</strong>
        <p>
          현재 일반 Mastodon 계정으로는 로그인할 수 없습니다. ONI 등 ActivityPub C2S를 지원하는
          서버의 계정을 연결하세요.
        </p>
      </div>
      <form
        class="connection-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onConnect(url().trim(), token().trim());
        }}
      >
        <label>
          Actor URL
          <input
            type="url"
            required
            value={url()}
            onInput={(event) => setUrl(event.currentTarget.value)}
            placeholder="https://social.example/users/me"
            disabled={props.busy}
            autocomplete="url"
          />
        </label>
        <label>
          액세스 토큰
          <input
            type="password"
            value={token()}
            onInput={(event) => setToken(event.currentTarget.value)}
            placeholder="서버에서 발급한 Bearer 토큰"
            disabled={props.busy}
            autocomplete="off"
          />
        </label>
        <Show when={props.error}>
          <div role="alert" class="page-error">
            <strong>연결하지 못했어요</strong>
            <p>{props.error}</p>
            <p>
              주소와 토큰을 확인하세요. 로컬 서버라면 아래 안내에서 인증서 설정을 확인할 수 있어요.
            </p>
          </div>
        </Show>
        <button class="primary-button" disabled={props.busy} type="submit">
          {props.busy ? '연결 중…' : '연결하기'} <span aria-hidden="true">→</span>
        </button>
        <p class="field-help">
          토큰은 이 탭의 메모리에만 보관됩니다. 새로고침하면 다시 연결해주세요.
        </p>
      </form>
      <details class="setup-help">
        <summary>ONI 로컬 계정 연결 방법</summary>
        <ol>
          <li>
            터미널에서 <code>npm run c2s:up</code>, <code>npm run c2s:seed</code>를 실행합니다.
          </li>
          <li>
            <a href="https://localhost:8443/" target="_blank" rel="noopener noreferrer">
              로컬 서버 열기 ↗
            </a>
            에서 인증서를 확인하거나 <code>.local/c2s-root.crt</code>를 신뢰합니다.
          </li>
          <li>
            Actor URL은 <code>https://localhost:8443/</code>, 토큰은{' '}
            <code>.local/c2s-credentials.json</code>의 token입니다.
          </li>
        </ol>
      </details>
    </section>
  );
}
