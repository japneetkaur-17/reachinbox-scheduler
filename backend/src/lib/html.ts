import sanitizeHtml from 'sanitize-html';

/**
 * The compose editor produces rich text (bold, lists, quotes, alignment...).
 * Bodies are sanitized ONCE, on the way in, against a small allowlist, so the
 * stored HTML is safe to send by email and to render in the dashboard.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'span', 'font', 'a'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      font: ['size'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center|justify)$/] },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  }).trim();
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Plain-text version for the text/plain MIME part, search indexing and list previews. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lets callers send plain text (API / load test) as well as editor HTML. */
export function normalizeBody(body: string): string {
  const looksLikeHtml = /<\/?(p|div|br|b|strong|i|em|u|s|strike|ul|ol|li|blockquote|h[1-6]|span|font|a)\b[^>]*>/i.test(body);
  const html = looksLikeHtml
    ? body
    : body
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`)
        .join('');
  return sanitizeEmailHtml(html);
}
