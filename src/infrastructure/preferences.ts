/** Optional browser persistence: never store tokens, drafts, or post bodies. */
export function readPreference(key: string): string {
  try {
    return localStorage.getItem(`kimino.${key}`) || '';
  } catch {
    return '';
  }
}
export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(`kimino.${key}`, value);
    return true;
  } catch {
    return false;
  }
}
export function readSaved(actor: string): string[] {
  try {
    const value: unknown = JSON.parse(readPreference(`saved.${actor}`));
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
