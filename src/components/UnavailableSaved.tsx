import { For, Show } from 'solid-js';
import { safeHttpUrl } from '../ui/content';
export default function UnavailableSaved(props: { ids: string[]; onRemove: (id: string) => void }) {
  return (
    <Show when={props.ids.length}>
      <section class="unavailable-saved">
        <h2>불러오지 못한 저장 링크 · {props.ids.length}</h2>
        <p>
          글 본문은 보관하지 않습니다. 아직 불러오지 않았거나, 삭제되었거나, 현재 계정에서 볼 수
          없는 글일 수 있어요.
        </p>
        <For each={props.ids}>
          {(id) => (
            <div class="saved-link">
              <div>
                <span>{id}</span>
                <a href={safeHttpUrl(id)} target="_blank" rel="noopener noreferrer">
                  저장한 원문 열기
                </a>
              </div>
              <button class="text-button" onClick={() => props.onRemove(id)}>
                저장 해제
              </button>
            </div>
          )}
        </For>
      </section>
    </Show>
  );
}
