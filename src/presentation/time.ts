const MINUTE = 60_000,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;
export const UNKNOWN_TIME = '시간 정보 없음';

function parse(value?: string): Date | undefined {
  if (!value) return;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Korean relative time for feed timestamps: 방금 전 → N분 전 → N시간 전 → 어제 → N일 전 → date. */
export function relativeTime(value?: string, now: Date | number = Date.now()): string {
  const date = parse(value);
  if (!date) return UNKNOWN_TIME;
  const elapsed = (typeof now === 'number' ? now : now.getTime()) - date.getTime();
  if (elapsed < MINUTE) return '방금 전';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}분 전`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}시간 전`;
  if (elapsed < 2 * DAY) return '어제';
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}일 전`;
  const reference = new Date(typeof now === 'number' ? now : now.getTime());
  return date.getFullYear() === reference.getFullYear()
    ? `${date.getMonth() + 1}월 ${date.getDate()}일`
    : `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** Full local date and time, for `title` attributes next to relative text. */
export function absoluteTime(value?: string): string {
  const date = parse(value);
  return date
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(date)
    : UNKNOWN_TIME;
}
