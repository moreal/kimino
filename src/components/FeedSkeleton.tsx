import { For } from 'solid-js';

/** Placeholder cards shown while the first timeline loads. */
export default function FeedSkeleton() {
  return (
    <div class="skeleton-list" aria-hidden="true">
      <For each={[0, 1, 2]}>
        {() => (
          <div class="skeleton-card">
            <div class="skeleton-avatar" />
            <div class="skeleton-lines">
              <div class="skeleton-line short" />
              <div class="skeleton-line" />
              <div class="skeleton-line" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
