import { safeUrl } from './activitystreams';
import type { Addressing } from './note-content';

/** Copy and normalize exact to/cc sets; do not merge recipient roles or widen scope. */
export function imageAudience(value: Addressing): Addressing {
  const list = (items: string[]) => {
    if (!Array.isArray(items)) throw new Error('Invalid image audience.');
    return [...new Set(items.map((item) => safeUrl(item)))].sort();
  };
  return { to: list(value.to), cc: list(value.cc) };
}
export function sameImageAudience(a: Addressing, b: Addressing): boolean {
  const first = imageAudience(a),
    second = imageAudience(b);
  return JSON.stringify(first) === JSON.stringify(second);
}
