import { isDensity, type Density } from '../presentation/ports';
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
const savedKey = (actor: string) => `saved.${actor}`;
export function readSaved(actor: string): string[] {
  try {
    const value: unknown = JSON.parse(readPreference(savedKey(actor)));
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
export function writeSaved(actor: string, ids: string[]): boolean {
  return writePreference(savedKey(actor), JSON.stringify(ids));
}
const DENSITY_KEY = 'density';
export function readDensity(): Density {
  const value = readPreference(DENSITY_KEY);
  return isDensity(value) ? value : 'comfortable';
}
export function writeDensity(density: Density): boolean {
  return writePreference(DENSITY_KEY, density);
}
const REVEAL_WARNED_KEY = 'reveal-warned';
export function readRevealWarned(): boolean {
  return readPreference(REVEAL_WARNED_KEY) === '1';
}
export function writeRevealWarned(on: boolean): boolean {
  return writePreference(REVEAL_WARNED_KEY, on ? '1' : '');
}
