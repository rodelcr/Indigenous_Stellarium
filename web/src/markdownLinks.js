// markdownLinks.js — minimal, safe rendering of the small subset of
// Markdown that shows up in sky-culture description.md "Authors" and
// "License" sections: plain text with the occasional [text](url) link
// (e.g. web/public/skycultures/maori/description.md's Authors section:
// "[Dan Smale](mailto:d.smale@niwa.co.nz)"). This is NOT a general
// Markdown renderer — it exists only so those existing links stay
// clickable in the deployed attribution UI, without pulling in a
// Markdown library or opening an XSS hole via v-html.
//
// Approach: HTML-escape the ENTIRE string first, so nothing in upstream
// description.md text (which this project doesn't author and doesn't
// edit) can inject markup. Only after escaping do we replace the
// markdown-link pattern with a real <a> tag — built from already-escaped
// label/url pieces, so no further escaping is needed at that step. Only
// http:, https:, and mailto: URLs are linkified; anything else is left
// as plain (escaped) text.

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// Runs against the ALREADY-ESCAPED string, so the url/label captured here
// may contain escaped entities (e.g. "&amp;") rather than raw characters
// — that's fine, they round-trip correctly once reinserted into an href.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;

export function renderInlineMarkdownLinks(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped.replace(LINK_RE, (_match, label, url) => {
    const rel = url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"';
    return `<a href="${url}"${rel}>${label}</a>`;
  });
}
