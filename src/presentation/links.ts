/** Only plain http(s) links without embedded credentials are rendered as anchors. */
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
