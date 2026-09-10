import { For, Show } from 'solid-js';
import type { FeedState } from '../presentation/feed-view-model';
import type { FeedView } from '../presentation/feed';
import type { Density } from '../presentation/ports';
import { copy, disconnectLabel, navItems } from '../presentation/copy';
import { connectionDotClass } from '../presentation/view-flags';
import Icon from './Icons';

export default function Sidebar(props: {
  state: FeedState;
  onNavigate: (view: FeedView) => void;
  onCompose: () => void;
  onDisconnect: () => void;
  onShortcuts: () => void;
  onDensity: (density: Density) => void;
  /** Browser preference: every content-warned note opens by itself. */
  revealWarned: boolean;
  onRevealWarned: (on: boolean) => void;
  /**
   * The account a remembered tab is reconnecting, before its timeline arrives: the
   * navigation is drawn for it at once, on the list the tab was left on.
   */
  pendingAccount?: { id: string; view: FeedView };
}) {
  const compact = () => props.state.density === 'compact';
  const connected = () => !!props.state.actor || !!props.pendingAccount;
  const view = () => (props.state.actor ? props.state.view : props.pendingAccount?.view);
  return (
    <aside
      class={[
        'sidebar',
        connected() ? 'sidebar--connected' : '',
        // A real account keeps its exit in the account line / sheet; only the preview,
        // which has nothing to write, leaves its exit in the tab bar.
        connected() && !props.state.demo ? 'sidebar--account' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button class="brand" onClick={() => props.onNavigate('all')} aria-label={copy.sidebar.home}>
        <span class="brand-mark" aria-hidden="true">
          k
        </span>
        kimino<span class="brand-period">.</span>
      </button>
      <p class="brand-caption">{copy.sidebar.caption}</p>
      <Show when={connected()}>
        <nav class="main-nav" aria-label={copy.sidebar.nav}>
          <For each={navItems}>
            {(item) => (
              <button
                class={view() === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => props.onNavigate(item.id)}
                aria-current={view() === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} class="nav-icon" />
                <span>{item.label}</span>
              </button>
            )}
          </For>
          <Show when={!props.state.demo}>
            {/* On a phone this is the fifth tab of the bottom bar, so writing is one tap away
                however far the list has been scrolled. */}
            <button class="primary-button sidebar-compose" onClick={props.onCompose}>
              <span>{copy.compose}</span>
              <Icon name="plus" class="nav-icon" />
            </button>
          </Show>
          {/* Shown only while the context column (and its profile card) is hidden. */}
          <button class="nav-item sidebar-disconnect" onClick={props.onDisconnect}>
            <Icon name="log-out" class="nav-icon" />
            <span>{disconnectLabel(props.state.demo)}</span>
          </button>
        </nav>
      </Show>
      <Show when={connected()}>
        <button
          type="button"
          class="sidebar-shortcuts"
          onClick={props.onShortcuts}
          aria-haspopup="dialog"
        >
          <kbd>?</kbd> {copy.shortcuts.button}
        </button>
        {/* Desktop only (hidden below 1100px): two browser settings drawn as switches, so an
            "on" state is a knob at the far end of its track, never the filled pill that marks
            the current list above. */}
        <button
          type="button"
          role="switch"
          class="sidebar-switch sidebar-density"
          aria-checked={compact() ? 'true' : 'false'}
          title={copy.density.hint}
          onClick={() => props.onDensity(compact() ? 'comfortable' : 'compact')}
        >
          <Icon name="rows" class="nav-icon" />
          <span class="switch-label">{copy.density.compact}</span>
          <span class="switch-track" aria-hidden="true">
            <span class="switch-knob" />
          </span>
        </button>
        <button
          type="button"
          role="switch"
          class="sidebar-switch sidebar-reveal"
          aria-checked={props.revealWarned ? 'true' : 'false'}
          title={copy.density.revealWarnedHint}
          onClick={() => props.onRevealWarned(!props.revealWarned)}
        >
          <Icon name="warning" class="nav-icon" />
          <span class="switch-label">{copy.density.revealWarned}</span>
          <span class="switch-track" aria-hidden="true">
            <span class="switch-knob" />
          </span>
        </button>
      </Show>
      {/* Lit only for a connected account: the landing page, the preview and a tab still
          reconnecting have nothing connected to show green for. */}
      <div class="sidebar-bottom">
        <span class={connectionDotClass(props.state)} /> {copy.sidebar.foot}
      </div>
    </aside>
  );
}
