// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  it('renders GFM tables, task lists, links, and strikethrough', () => {
    const html = renderMarkdown([
      '| ID | Status |',
      '| --- | --- |',
      '| `7439` | live |',
      '',
      '- [x] shipped',
      '- [ ] verify',
      '',
      '[Docs](https://example.com) and ~~old~~',
    ].join('\n'))

    expect(html).toContain('<thead>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<code>7439</code>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<s>old</s>')
  })

  it('sanitizes unsafe HTML and URLs', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n[bad](javascript:alert(1))')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('href="javascript:')
  })
})
