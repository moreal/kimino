import type { ASObject } from './social';
export const NS = 'https://www.w3.org/ns/activitystreams#';
export const record = (value: unknown): value is ASObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
export const iri = (value: unknown): string | undefined =>
  str(value) ?? (record(value) ? (str(value.id) ?? str(value.href)) : undefined);
export const isType = (value: ASObject, type: string) =>
  (Array.isArray(value.type) ? value.type : [value.type]).some(
    (t) => t === type || t === NS + type,
  );
export const kind = (value: ASObject) =>
  ['Note', 'Create', 'Update', 'Delete', 'Announce', 'Like', 'Undo'].find((t) => isType(value, t));
export function safeUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (url.username || url.password) throw new Error('URLs must not contain credentials.');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Use HTTPS, or HTTP on localhost for development.');
  return url.href;
}
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(safeUrl(a)).origin === new URL(safeUrl(b)).origin;
  } catch {
    return false;
  }
}
