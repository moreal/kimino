import DOMPurify from 'dompurify';

export function safeHttpUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}

export function actorLabel(value: string): string {
  try {
    const url = new URL(value);
    const name = url.pathname.split('/').filter(Boolean).at(-1);
    return name ? `${name}@${url.host}` : url.host;
  } catch {
    return value;
  }
}

/** No remote images, embeds, inline styles or executable links. */
export function safeContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'a',
      'strong',
      'em',
      'b',
      'i',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'span',
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
}

export function displayDate(value?: string): string {
  if (!value) return '시간 정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '시간 정보 없음'
    : new Intl.DateTimeFormat('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
