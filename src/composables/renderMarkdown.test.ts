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

  it('keeps short fenced values compact while preserving diagrams as blocks', () => {
    const compact = renderMarkdown('```\nBindBudgetControlStrategy\n```')
    const diagram = renderMarkdown(`\`\`\`text\n${Array.from({ length: 4 }, (_, index) => `node-${index}`).join('\n')}\n\`\`\``)

    expect(compact).toContain('class="is-compact-code"')
    expect(diagram).not.toContain('is-compact-code')
    expect(diagram).toContain('class="language-text"')
  })

  it('adds usable code, table, file, and footnote controls', () => {
    const html = renderMarkdown([
      '`src/main.ts:42`',
      '',
      '| value |',
      '| ---: |',
      '| 42 |',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      'Evidence[^1].',
      '',
      '[^1]: local verification',
    ].join('\n'))

    expect(html).toContain('data-markdown-action="open-file"')
    expect(html).toContain('data-file-line="42"')
    expect(html).toContain('data-markdown-action="copy-table"')
    expect(html).toContain('data-markdown-action="copy-code"')
    expect(html).toContain('data-markdown-action="save-code"')
    expect(html).toContain('class="footnotes"')
  })
})
