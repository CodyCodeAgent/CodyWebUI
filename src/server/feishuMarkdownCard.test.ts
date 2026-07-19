import { describe, expect, it } from 'vitest'
import { buildFeishuMarkdownElements } from './feishuMarkdownCard'

describe('Feishu Markdown card rendering', () => {
  it('keeps prose around tables in reading order', () => {
    expect(buildFeishuMarkdownElements('Before\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nAfter')).toEqual([
      { tag: 'markdown', content: 'Before' },
      expect.objectContaining({ tag: 'table', rows: [{ c0: '1', c1: '2' }] }),
      { tag: 'markdown', content: 'After' },
    ])
  })

  it('does not mistake a pipe inside fenced code for a table', () => {
    const elements = buildFeishuMarkdownElements('```sql\nselect a | b from t;\n```')
    expect(elements).toEqual([{ tag: 'markdown', content: '```sql\nselect a | b from t;\n```' }])
  })

  it('keeps lists, inline code, links, and blockquotes as Markdown', () => {
    const content = buildFeishuMarkdownElements('- `one`\n- [two](https://example.com)\n\n> note')
    expect(content).toEqual([{ tag: 'markdown', content: '- `one`\n- [two](https://example.com)\n\n> note' }])
  })
})
