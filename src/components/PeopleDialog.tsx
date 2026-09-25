import RelationshipReadContinuation from './RelationshipReadContinuation';
import { projectPeople, type PeopleFilter } from '../presentation/people-list';
import type { AccountDiscoveryState } from '../application/account-discovery';
import { discoveryCopy, discoveryErrorText, usesActorUrl } from '../presentation/account-discovery';
import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import type { RelationshipState } from '../application/relationship-types';
import type { ActorProfile } from '../presentation/note-display';
import {
  inspectFollowTarget,
  relationshipReadError,
  relationshipTargets,
} from '../presentation/relationships';
import { relationshipCopy as copy } from '../presentation/copy-relationships';
import { restoreFocus } from './shortcuts';
import RelationshipControl from './RelationshipControl';
import Icon from './Icons';

export default function PeopleDialog(props: {
  open: boolean;
  actor?: string;
  demo: boolean;
  state?: RelationshipState;
  profiles: readonly ActorProfile[];
  discovery?: AccountDiscoveryState;
  onDiscoveryInput: (input: string) => void;
  onDiscover: () => Promise<void>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTimeline: () => Promise<void>;
  onContinueReading: () => unknown;
  onCancelReading: () => void;
  onFollow: (target: string) => Promise<void>;
  onUnfollow: (target: string) => Promise<void>;
}) {
  let dialog: HTMLDialogElement | undefined;
  let close: HTMLButtonElement | undefined;
  let opener: Element | null = null;
  let generation = 0;
  const [section, setSection] = createSignal<'manage' | 'find'>('find');
  const [query, setQuery] = createSignal('');
  const [filter, setFilter] = createSignal<PeopleFilter>('all');
  let initialPending = false;
  const [input, setInput] = createSignal('');
  const [inspected, setInspected] = createSignal('');
  const [error, setError] = createSignal('');
  const [refreshError, setRefreshError] = createSignal('');
  const [refreshing, setRefreshing] = createSignal(false);
  const targets = () => relationshipTargets(props.state);
  const candidate = () => inspected() || props.discovery?.result?.actorUrl || '';
  const list = () =>
    projectPeople(props.state, props.profiles, props.actor, props.demo, query(), filter());
  const profile = (target: string) => props.profiles.find((item) => item.id === target);
  createEffect(
    () => props.actor,
    (actor, previous) => {
      if (actor === previous) return;
      generation++;
      setInput('');
      setQuery('');
      setFilter('all');
      setSection('find');
      setInspected('');
      setError('');
      setRefreshError('');
      setRefreshing(false);
    },
  );
  createEffect(
    () => props.open,
    (open) => {
      if (!dialog) return;
      if (open && !dialog.open) {
        initialPending = untrack(() => props.state?.phase !== 'ready');
        setSection(untrack(() => (targets().length && !input() ? 'manage' : 'find')));
        opener = document.activeElement;
        dialog.showModal();
        close?.focus();
      } else if (!open && dialog.open) {
        dialog.close();
        restoreFocus(opener);
      }
    },
  );
  createEffect(
    () => props.state?.phase,
    (phase) => {
      if (untrack(() => props.open) && initialPending && phase === 'ready') {
        initialPending = false;
        if (!untrack(input)) setSection(untrack(() => (targets().length ? 'manage' : 'find')));
      }
    },
  );
  function chooseSection(value: 'manage' | 'find') {
    initialPending = false;
    setSection(value);
  }
  onCleanup(() => {
    generation++;
  });
  async function refresh() {
    if (refreshing()) return;
    const current = generation;
    setRefreshing(true);
    setRefreshError('');
    try {
      await props.onRefresh();
    } catch {
      if (current === generation) setRefreshError(copy.readFailed);
    } finally {
      if (current === generation) setRefreshing(false);
    }
  }
  return (
    <dialog
      class="people-dialog"
      role="dialog"
      aria-labelledby="people-heading"
      aria-describedby="people-scope"
      ref={(el) => {
        dialog = el;
      }}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class="people-chrome">
        <header class="people-header">
          <h2 id="people-heading">{copy.heading}</h2>
          <button
            type="button"
            class="icon-button"
            aria-label={copy.close}
            ref={(el) => {
              close = el;
            }}
            onClick={props.onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div class="people-view-switch" role="group" aria-label={copy.views}>
          <button
            type="button"
            class="quiet-button"
            aria-pressed={section() === 'manage' ? 'true' : 'false'}
            onClick={() => chooseSection('manage')}
          >
            {copy.manage} <span>{targets().length}</span>
          </button>
          <button
            type="button"
            class="quiet-button"
            aria-pressed={section() === 'find' ? 'true' : 'false'}
            onClick={() => chooseSection('find')}
          >
            {copy.findPeople}
          </button>
        </div>
      </div>
      <div class="people-body">
        <p id="people-scope" class="people-help">
          {section() === 'manage' ? copy.manageScope : copy.scope}
        </p>
        <Show when={props.state?.phase === 'canceled'}>
          <p class="people-help" role="status">
            {copy.readCanceled}
          </p>
        </Show>
        <Show when={props.demo}>
          <p class="people-help">{copy.demo}</p>
        </Show>
        <Show when={section() === 'find'}>
          <form
            class="people-form"
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              if (usesActorUrl(input())) {
                const target = inspectFollowTarget(input(), props.actor);
                setError(target ? '' : copy.invalid);
                setInspected(target ?? '');
              } else {
                setInspected('');
                void props.onDiscover();
              }
            }}
          >
            <label>
              <span>{discoveryCopy.input}</span>
              <input
                type="text"
                autocapitalize="none"
                spellcheck={false}
                value={input()}
                placeholder={discoveryCopy.placeholder}
                disabled={props.demo || !props.actor}
                onInput={(event) => {
                  setInput(event.currentTarget.value);
                  props.onDiscoveryInput(event.currentTarget.value);
                  setInspected('');
                  setError('');
                }}
              />
            </label>
            <p class="people-help">{discoveryCopy.help}</p>
            <Show when={!usesActorUrl(input())}>
              <p class="people-help">{discoveryCopy.privacy}</p>
            </Show>
            <button
              type="submit"
              class="secondary-button"
              disabled={
                props.demo ||
                !props.actor ||
                !input().trim() ||
                props.discovery?.phase === 'loading'
              }
            >
              {props.discovery?.phase === 'loading'
                ? discoveryCopy.finding
                : usesActorUrl(input())
                  ? copy.inspect
                  : discoveryCopy.find}
            </button>
            <Show when={discoveryErrorText(props.discovery) || error()}>
              <p class="people-error" role="alert">
                {discoveryErrorText(props.discovery) || error()}
              </p>
            </Show>
          </form>
          <Show when={candidate()}>
            <div class="people-candidate">
              <Show when={props.discovery?.result}>
                <strong>{props.discovery?.result?.handle}</strong>
              </Show>
              <p class="people-help">
                {props.discovery?.result ? discoveryCopy.found : copy.reviewed}
              </p>
              <RelationshipControl
                target={candidate()}
                self={props.actor}
                state={props.state}
                demo={props.demo}
                onFollow={props.onFollow}
                onUnfollow={props.onUnfollow}
                onRefresh={props.onRefresh}
              />
            </div>
          </Show>
        </Show>
        <Show when={relationshipReadError(props.state) || refreshError()}>
          <p class="people-error" role="alert">
            {relationshipReadError(props.state) || refreshError()}
          </p>
        </Show>
        <Show when={props.state?.phase === 'error'}>
          <p class="people-help">{copy.readFailed}</p>
        </Show>
        <Show when={props.state?.phase === 'unsupported'}>
          <p class="people-help">{copy.unsupported}</p>
        </Show>
        <Show when={section() === 'manage'}>
          <Show when={targets().length > 0}>
            <div class="people-list-controls">
              <p class="people-help">{copy.knownCounts}</p>
              <div class="people-filters" role="group" aria-label={copy.filters}>
                <For each={['all', 'following', 'requested', 'attention'] as const}>
                  {(value) => (
                    <button
                      type="button"
                      class="quiet-button"
                      aria-pressed={filter() === value ? 'true' : 'false'}
                      onClick={() => setFilter(value)}
                    >
                      {copy.filterLabels[value]} <span>{list().counts[value]}</span>
                    </button>
                  )}
                </For>
              </div>
              <label class="people-search">
                <span>{copy.search}</span>
                <input
                  type="search"
                  value={query()}
                  placeholder={copy.searchPlaceholder}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <p class="people-help">{copy.searchScope}</p>
            </div>
          </Show>
          <Show
            when={list().targets.length > 0}
            fallback={
              <div class="people-empty">
                <p class="people-help">
                  {targets().length
                    ? copy.noMatches
                    : props.state?.phase === 'ready'
                      ? copy.empty
                      : copy.noEvidence}
                </p>
                <Show when={query() || filter() !== 'all'}>
                  <button
                    class="secondary-button"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    {copy.clearFilters}
                  </button>
                </Show>
                <Show when={!targets().length}>
                  <button class="primary-button" onClick={() => chooseSection('find')}>
                    {copy.findPeople}
                  </button>
                </Show>
              </div>
            }
          >
            <ul class="people-list" aria-label={copy.list}>
              <For each={list().targets} keyed={(target) => target}>
                {(target) => (
                  <li class="people-person">
                    <Show when={profile(target())}>
                      <div class="people-identity">
                        <strong>{profile(target())?.name}</strong>
                        <Show when={profile(target())?.handle}>
                          <span>{profile(target())?.handle}</span>
                        </Show>
                      </div>
                    </Show>
                    <RelationshipControl
                      target={target()}
                      self={props.actor}
                      state={props.state}
                      demo={props.demo}
                      onFollow={props.onFollow}
                      onUnfollow={props.onUnfollow}
                      onRefresh={props.onRefresh}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
      <footer class="people-footer">
        <Show
          when={props.state?.readBudget}
          fallback={
            <>
              <button
                type="button"
                class="quiet-button"
                disabled={
                  props.demo ||
                  !props.actor ||
                  refreshing() ||
                  props.state?.phase === 'loading' ||
                  Object.keys(props.state?.pending ?? {}).length > 0
                }
                onClick={() => void refresh()}
              >
                {refreshing() || props.state?.phase === 'loading' ? copy.loading : copy.refresh}
              </button>
              <Show when={props.state?.following.length && props.state.phase === 'ready'}>
                <button
                  type="button"
                  class="secondary-button people-timeline"
                  onClick={() => void props.onTimeline().catch(() => undefined)}
                >
                  {copy.timeline}
                </button>
              </Show>
            </>
          }
        >
          {(progress) => (
            <RelationshipReadContinuation
              progress={progress()}
              purpose={props.state?.readPurpose}
              target={props.state?.readTarget}
              onContinue={props.onContinueReading}
              onCancel={props.onCancelReading}
            />
          )}
        </Show>
      </footer>
    </dialog>
  );
}
