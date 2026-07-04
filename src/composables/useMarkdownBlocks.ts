type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'file'; value: string; displayName: string }

export type MarkdownBlock =
  | { kind: 'paragraph'; segments: InlineSegment[] }
  | { kind: 'heading'; level: 1 | 2 | 3; segments: InlineSegment[] }
  | { kind: 'unorderedList'; items: InlineSegment[][] }
  | { kind: 'orderedList'; items: InlineSegment[][] }
  | { kind: 'codeBlock'; language: string; code: string }
  | { kind: 'blockquote'; segments: InlineSegment[] }

function isFilePath(value: string): boolean {
  if (!value || /\s/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const hasPathSeparator = value.includes('/') || value.includes('\\')
  return looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || hasPathSeparator
}

function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function parseStrongSegments(text: string): InlineSegment[] {
  if (!text.includes('**')) return [{ kind: 'text', value: text }]

  const segments: InlineSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf('**', cursor)
    if (start < 0) break

    const end = text.indexOf('**', start + 2)
    if (end < 0) break

    const strongText = text.slice(start + 2, end)
    if (strongText.trim().length === 0) {
      break
    }

    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) })
    }
    segments.push({ kind: 'strong', value: strongText })
    cursor = end + 2
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) })
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }]
}

function pushTextSegments(segments: InlineSegment[], text: string): void {
  segments.push(...parseStrongSegments(text))
}

export function parseInlineSegments(text: string): InlineSegment[] {
  if (!text.includes('`')) return parseStrongSegments(text)

  const segments: InlineSegment[] = []
  let cursor = 0
  let textStart = 0

  while (cursor < text.length) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }

    let openLength = 1
    while (cursor + openLength < text.length && text[cursor + openLength] === '`') {
      openLength += 1
    }
    const delimiter = '`'.repeat(openLength)

    let searchFrom = cursor + openLength
    let closingStart = -1
    while (searchFrom < text.length) {
      const candidate = text.indexOf(delimiter, searchFrom)
      if (candidate < 0) break

      const hasBacktickBefore = candidate > 0 && text[candidate - 1] === '`'
      const hasBacktickAfter =
        candidate + openLength < text.length && text[candidate + openLength] === '`'
      const hasNewLineInside = text.slice(cursor + openLength, candidate).includes('\n')

      if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
        closingStart = candidate
        break
      }
      searchFrom = candidate + 1
    }

    if (closingStart < 0) {
      cursor += openLength
      continue
    }

    if (cursor > textStart) {
      pushTextSegments(segments, text.slice(textStart, cursor))
    }

    const token = text.slice(cursor + openLength, closingStart)
    if (token.length > 0) {
      const fileReference = parseFileReference(token)
      if (fileReference) {
        const basename = getBasename(fileReference.path)
        const displayName = fileReference.line ? `${basename} (line ${String(fileReference.line)})` : basename
        segments.push({ kind: 'file', value: token, displayName })
      } else {
        segments.push({ kind: 'code', value: token })
      }
    } else {
      segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
    }

    cursor = closingStart + openLength
    textStart = cursor
  }

  if (textStart < text.length) {
    pushTextSegments(segments, text.slice(textStart))
  }

  return segments
}

function stripFenceIndent(line: string, indent: string): string {
  if (!indent) return line
  return line.startsWith(indent) ? line.slice(indent.length) : line
}

function flushParagraph(lines: string[], blocks: MarkdownBlock[]): void {
  if (lines.length === 0) return
  blocks.push({
    kind: 'paragraph',
    segments: parseInlineSegments(lines.join('\n')),
  })
  lines.length = 0
}

function pushListItem(
  blocks: MarkdownBlock[],
  kind: 'unorderedList' | 'orderedList',
  text: string,
): void {
  const previous = blocks.at(-1)
  const item = parseInlineSegments(text)
  if (previous?.kind === kind) {
    previous.items.push(item)
    return
  }
  blocks.push({ kind, items: [item] })
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  const paragraphLines: string[] = []
  let codeLanguage = ''
  let codeFenceIndent = ''
  let codeLines: string[] | null = null

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)```([A-Za-z0-9_-]+)?\s*$/u)
    if (fenceMatch) {
      if (codeLines) {
        blocks.push({
          kind: 'codeBlock',
          language: codeLanguage,
          code: codeLines.join('\n'),
        })
        codeLines = null
        codeLanguage = ''
        codeFenceIndent = ''
      } else {
        flushParagraph(paragraphLines, blocks)
        codeFenceIndent = fenceMatch[1] ?? ''
        codeLanguage = fenceMatch[2] ?? ''
        codeLines = []
      }
      continue
    }

    if (codeLines) {
      codeLines.push(stripFenceIndent(line, codeFenceIndent))
      continue
    }

    if (line.trim().length === 0) {
      flushParagraph(paragraphLines, blocks)
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/u)
    if (headingMatch) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        segments: parseInlineSegments(headingMatch[2].trim()),
      })
      continue
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/u)
    if (unorderedMatch) {
      flushParagraph(paragraphLines, blocks)
      pushListItem(blocks, 'unorderedList', unorderedMatch[1].trim())
      continue
    }

    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/u)
    if (orderedMatch) {
      flushParagraph(paragraphLines, blocks)
      pushListItem(blocks, 'orderedList', orderedMatch[1].trim())
      continue
    }

    const quoteMatch = line.match(/^>\s?(.+)$/u)
    if (quoteMatch) {
      flushParagraph(paragraphLines, blocks)
      blocks.push({
        kind: 'blockquote',
        segments: parseInlineSegments(quoteMatch[1].trim()),
      })
      continue
    }

    paragraphLines.push(line)
  }

  if (codeLines) {
    blocks.push({
      kind: 'codeBlock',
      language: codeLanguage,
      code: codeLines.join('\n'),
    })
  }
  flushParagraph(paragraphLines, blocks)

  return blocks
}
