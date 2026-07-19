import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false })

function sourceLines(lines: string[], map: [number, number]): string {
  return lines.slice(map[0], map[1]).join('\n')
}

function matchingClose(tokens: Token[], openIndex: number): number {
  const open = tokens[openIndex]
  const closeType = open.type.replace(/_open$/, '_close')
  let depth = 1
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].type === open.type) depth += 1
    if (tokens[index].type === closeType) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return tokens.length - 1
}

function nativeTable(tokens: Token[]): Record<string, unknown> | null {
  const headers: string[] = []
  const bodyRows: string[][] = []
  let inHead = false
  let inBody = false
  let inCell = false
  let row: string[] | null = null

  for (const token of tokens) {
    if (token.type === 'thead_open') inHead = true
    else if (token.type === 'thead_close') inHead = false
    else if (token.type === 'tbody_open') inBody = true
    else if (token.type === 'tbody_close') inBody = false
    else if (token.type === 'tr_open') row = []
    else if (token.type === 'tr_close') {
      if (inBody && row) bodyRows.push(row)
      row = null
    } else if (token.type === 'th_open' || token.type === 'td_open') inCell = true
    else if (token.type === 'th_close' || token.type === 'td_close') inCell = false
    else if (token.type === 'inline' && inCell) {
      if (inHead) headers.push(token.content)
      else row?.push(token.content)
    }
  }

  if (headers.length === 0) return null
  return {
    tag: 'table',
    page_size: Math.min(10, Math.max(1, bodyRows.length || 1)),
    row_height: 'low',
    header_style: {
      text_align: 'left',
      text_size: 'normal',
      background_style: 'grey',
      text_color: 'default',
      bold: true,
      lines: 1,
    },
    columns: headers.map((header, index) => ({
      name: `c${String(index)}`,
      display_name: header || ' ',
      data_type: 'lark_md',
      width: 'auto',
    })),
    rows: bodyRows.map((cells) => Object.fromEntries(
      headers.map((_header, index) => [`c${String(index)}`, cells[index] ?? '']),
    )),
  }
}

/** Convert CommonMark/GFM output into Feishu card-v2 content elements. */
export function buildFeishuMarkdownElements(input: string): Record<string, unknown>[] {
  if (!input.trim()) return []
  const tokens = markdown.parse(input, {})
  const lines = input.split('\n')
  const elements: Record<string, unknown>[] = []
  const buffer: string[] = []

  const flush = () => {
    const content = buffer.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
    if (content) elements.push({ tag: 'markdown', content })
    buffer.length = 0
  }

  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token.level !== 0) {
      index += 1
      continue
    }

    if (token.type === 'table_open') {
      flush()
      const closeIndex = matchingClose(tokens, index)
      const table = nativeTable(tokens.slice(index, closeIndex + 1))
      if (table) elements.push(table)
      else if (token.map) buffer.push(sourceLines(lines, token.map as [number, number]))
      index = closeIndex + 1
      continue
    }

    if (token.type === 'heading_open') {
      const title = tokens[index + 1]?.content.trim()
      if (title) buffer.push(`**${title}**`)
      index += 3
      continue
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const fence = token.markup || '```'
      const language = token.info.trim()
      buffer.push(`${fence}${language}\n${token.content.replace(/\n+$/, '')}\n${fence}`)
      index += 1
      continue
    }

    if (token.type === 'hr') {
      buffer.push('---')
      index += 1
      continue
    }

    if (token.type.endsWith('_open') && token.map) {
      buffer.push(sourceLines(lines, token.map as [number, number]))
      index = matchingClose(tokens, index) + 1
      continue
    }

    index += 1
  }

  flush()
  return elements
}
