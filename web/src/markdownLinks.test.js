import { describe, expect, it } from 'vitest';
import { renderInlineMarkdownLinks } from './markdownLinks.js';

describe('renderInlineMarkdownLinks', () => {
  it('returns empty string for falsy input', () => {
    expect(renderInlineMarkdownLinks('')).toBe('');
    expect(renderInlineMarkdownLinks(null)).toBe('');
    expect(renderInlineMarkdownLinks(undefined)).toBe('');
  });

  it('passes plain text through unchanged (no links present)', () => {
    expect(renderInlineMarkdownLinks('Text and lines: CC BY-SA')).toBe(
      'Text and lines: CC BY-SA'
    );
  });

  it('linkifies a mailto markdown link without target=_blank', () => {
    const out = renderInlineMarkdownLinks(
      'This sky culture is a contribution of Stellarium user [Dan Smale](mailto:d.smale@niwa.co.nz)'
    );
    expect(out).toBe(
      'This sky culture is a contribution of Stellarium user ' +
        '<a href="mailto:d.smale@niwa.co.nz">Dan Smale</a>'
    );
  });

  it('linkifies an https markdown link with target=_blank rel=noopener', () => {
    const out = renderInlineMarkdownLinks('[Maori sky culture](http://www.stellarium.org/wiki)');
    expect(out).toBe(
      '<a href="http://www.stellarium.org/wiki" target="_blank" rel="noopener noreferrer">Maori sky culture</a>'
    );
  });

  it('escapes HTML-significant characters instead of injecting markup', () => {
    const out = renderInlineMarkdownLinks('<script>alert(1)</script> & "quoted"');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;');
    expect(out).not.toContain('<script>');
  });

  it('does not linkify a non-http/mailto scheme', () => {
    const out = renderInlineMarkdownLinks('[click me](javascript:alert(1))');
    expect(out).not.toContain('<a ');
  });
});
