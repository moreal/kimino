import { createSignal, onCleanup } from 'solid-js';

/**
 * Tracks a media query as a signal, mirroring `clock.ts`: the listener lives as long as the
 * component that asked. Where `matchMedia` is unavailable the query never matches.
 */
export function useMediaQuery(query: string): () => boolean {
  const media = typeof matchMedia === 'function' ? matchMedia(query) : undefined;
  const [matches, setMatches] = createSignal(media?.matches ?? false);
  const update = () => setMatches(media?.matches ?? false);
  media?.addEventListener('change', update);
  onCleanup(() => media?.removeEventListener('change', update));
  return matches;
}
