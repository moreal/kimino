import DOMPurify from 'dompurify';

/** The only path for remote HTML into the DOM: no remote images, embeds, inline styles or executable links. */
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
