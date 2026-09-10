import type { Preferences } from './ports';
import type { SessionStore } from './session-restore';
import { notices } from './copy';

interface SaveContext {
  actor?: string;
  /** Sample mode keeps saves in memory and never touches the browser store. */
  demo: boolean;
}

export function toggleLink(saved: string[], id: string): { next: string[]; adding: boolean } {
  const adding = !saved.includes(id);
  return { next: adding ? [...saved, id] : saved.filter((item) => item !== id), adding };
}

/** Persists the new list when there is a real actor and returns the state + notice to show. */
export function saveLinks(
  preferences: Preferences,
  context: SaveContext,
  next: string[],
  adding: boolean,
): { saved: string[]; saveNotice: string } {
  const persisted = !context.demo && !!context.actor && preferences.writeSaved(context.actor, next);
  return {
    saved: next,
    saveNotice: context.demo
      ? notices.demoSave
      : persisted
        ? adding
          ? notices.saved
          : notices.unsaved
        : notices.storageUnavailable,
  };
}

/**
 * Preview saves live in the same tab record as the preview marker, so a reload keeps them
 * and closing the tab clears them. Nothing is written unless the tab is already remembered.
 */
export function savePreviewLinks(store: SessionStore, saved: string[]): boolean {
  const stored = store.read();
  if (!stored) return false;
  const { saved: _previous, ...rest } = stored;
  return store.write(saved.length ? { ...rest, saved } : rest);
}
