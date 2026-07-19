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

  it('renders multiple uploaded images on one line as a previewable row', () => {
    const content = buildFeishuMarkdownElements('Before\n\n![](img_v2_one) ![](img_v2_two)\n\nAfter')
    expect(content).toEqual([
      { tag: 'markdown', content: 'Before' },
      expect.objectContaining({
        tag: 'column_set',
        columns: [
          expect.objectContaining({ elements: [expect.objectContaining({ tag: 'img', img_key: 'img_v2_one', preview: true })] }),
          expect.objectContaining({ elements: [expect.objectContaining({ tag: 'img', img_key: 'img_v2_two', preview: true })] }),
        ],
      }),
      { tag: 'markdown', content: 'After' },
    ])
  })

  it('renders one uploaded image as a native previewable image element', () => {
    expect(buildFeishuMarkdownElements('Before\n\n![Poster](img_v3_0213o_uploaded)\n\nAfter')).toEqual([
      { tag: 'markdown', content: 'Before' },
      expect.objectContaining({ tag: 'img', img_key: 'img_v3_0213o_uploaded', preview: true }),
      { tag: 'markdown', content: 'After' },
    ])
  })

  it('leaves image-looking content inside fences untouched and repairs escaped fences', () => {
    expect(buildFeishuMarkdownElements('\\`\\`\\`md\n![](img_v2_one) ![](img_v2_two)\n\\`\\`\\`')).toEqual([
      { tag: 'markdown', content: '```md\n![](img_v2_one) ![](img_v2_two)\n```' },
    ])
  })
})
