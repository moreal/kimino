import { For, Show } from 'solid-js';
import { copy } from '../presentation/copy';
import { safeHttpUrl } from '../presentation/links';
export default function UnavailableSaved(props: { ids: string[]; onRemove: (id: string) => void }) {
  return (
    <Show when={props.ids.length}>
      <section class="unavailable-saved">
        <h2>{copy.unavailableSaved.heading(props.ids.length)}</h2>
        <p>{copy.unavailableSaved.body}</p>
        <For each={props.ids}>
          {(id) => (
            <div class="saved-link">
              <div>
                <span>{id}</span>
                <a href={safeHttpUrl(id)} target="_blank" rel="noopener noreferrer">
                  {copy.unavailableSaved.open}
                </a>
              </div>
              <button class="text-button" onClick={() => props.onRemove(id)}>
                {copy.unavailableSaved.remove}
              </button>
            </div>
          )}
        </For>
      </section>
    </Show>
  );
}
