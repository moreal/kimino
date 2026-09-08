import { For, Show } from 'solid-js';
import type { FeedState } from '../presentation/feed-view-model';
import type { FeedView } from '../presentation/feed';
import { disconnectLabel, navItems, type NavIcon } from '../presentation/copy';

/** Simple line icons drawn with the current text color; labels carry the meaning. */
const iconPaths: Record<NavIcon, string> = {
  home: 'M4 11 12 4l8 7M6 10v10h5v-5h2v5h5V10',
  reply: 'M9 14 4 9l5-5M4 9h9a7 7 0 0 1 7 7v4',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  bookmark: 'M6 4h12v16l-6-4-6 4z',
};
function NavGlyph(props: { icon: NavIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="nav-icon"
    >
      <path d={iconPaths[props.icon]} />
    </svg>
  );
}

export default function Sidebar(props: {
  state: FeedState;
  onNavigate: (view: FeedView) => void;
  onCompose: () => void;
  onDisconnect: () => void;
}) {
  return (
    <aside class="sidebar">
      <button class="brand" onClick={() => props.onNavigate('all')} aria-label="Kimino 홈">
        <span class="brand-mark">
          k<span>•</span>
        </span>
        kimino<span class="brand-period">.</span>
      </button>
      <p class="brand-caption">조금 더 가까운 대화</p>
      <Show when={props.state.actor}>
        <nav class="main-nav" aria-label="메인 메뉴">
          <For each={navItems}>
            {(item) => (
              <button
                class={props.state.view === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => props.onNavigate(item.id)}
                aria-current={props.state.view === item.id ? 'page' : undefined}
              >
                <NavGlyph icon={item.icon} />
                {item.label}
              </button>
            )}
          </For>
          <Show when={!props.state.demo}>
            <button class="primary-button sidebar-compose" onClick={props.onCompose}>
              새 글 쓰기 <span aria-hidden="true">＋</span>
            </button>
          </Show>
        </nav>
        {/* Shown only while the context column (and its profile card) is hidden. */}
        <button class="text-button sidebar-disconnect" onClick={props.onDisconnect}>
          {disconnectLabel(props.state.demo)}
        </button>
      </Show>
      <div class="sidebar-bottom">
        <span class="connection-dot" /> 시간 순서대로, 광고 없이
      </div>
    </aside>
  );
}
