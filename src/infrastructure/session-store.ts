/**
 * Opt-in, tab-scoped session persistence. sessionStorage is cleared when the tab closes and
 * is not shared with other tabs. The value is only ever read back into memory; never log it.
 */
const KEY = 'kimino.session';

export function readSessionRecord(): unknown {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
export function writeSessionRecord(record: object): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
export function clearSessionRecord() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
