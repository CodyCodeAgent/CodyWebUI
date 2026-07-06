import type { UiMessage, UiToolTimelineEntry } from '../types/codex'

export type UiDiffLineKind = 'add' | 'remove' | 'context' | 'meta'

export type UiDiffReviewLine = {
  kind: UiDiffLineKind
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export type UiDiffReviewHunk = {
  header: string
  oldStart: number | null
  oldLines: number | null
  newStart: number | null
  newLines: number | null
  addedLines: number
  removedLines: number
  lines: UiDiffReviewLine[]
}

export type UiDiffReviewFile = {
  filePath: string
  oldPath: string | null
  status: string
  messageIds: string[]
  patch: string
  addedLines: number
  removedLines: number
  hunks: UiDiffReviewHunk[]
}

export type UiDiffReviewSummary = {
  fileCount: number
  hunkCount: number
  addedLines: number
  removedLines: number
  patch: string
}

export type UiDiffReview = {
  files: UiDiffReviewFile[]
  summary: UiDiffReviewSummary
}

type MutableDiffFile = UiDiffReviewFile & {
  patchLines: string[]
}

function stripDiffPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '/dev/null') return trimmed
  if (trimmed.startsWith('a/') || trimmed.startsWith('b/')) return trimmed.slice(2)
  return trimmed
}

function readFallbackPaths(tool: UiToolTimelineEntry): string[] {
  return tool.details
    .map((detail) => {
      if (detail.startsWith('status:')) return ''
      const separatorIndex = detail.indexOf(': ')
      const rawPath = separatorIndex >= 0 ? detail.slice(separatorIndex + 2) : detail
      const moveParts = rawPath.split(' -> ')
      return (moveParts.at(-1) || rawPath).trim()
    })
    .filter((value) => value.length > 0)
}

function createFile(filePath: string, messageId: string, status = 'modified'): MutableDiffFile {
  return {
    filePath,
    oldPath: null,
    status,
    messageIds: [messageId],
    patch: '',
    patchLines: [],
    addedLines: 0,
    removedLines: 0,
    hunks: [],
  }
}

function parseHunkHeader(header: string): Pick<UiDiffReviewHunk, 'oldStart' | 'oldLines' | 'newStart' | 'newLines'> {
  const match = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?/u)
  if (!match) {
    return {
      oldStart: null,
      oldLines: null,
      newStart: null,
      newLines: null,
    }
  }

  return {
    oldStart: Number.parseInt(match[1] ?? '', 10),
    oldLines: Number.parseInt(match[2] ?? '1', 10),
    newStart: Number.parseInt(match[3] ?? '', 10),
    newLines: Number.parseInt(match[4] ?? '1', 10),
  }
}

function createHunk(header: string): UiDiffReviewHunk {
  return {
    header,
    ...parseHunkHeader(header),
    addedLines: 0,
    removedLines: 0,
    lines: [],
  }
}

function nextLineNumber(
  lines: UiDiffReviewLine[],
  field: 'oldLineNumber' | 'newLineNumber',
  start: number | null,
): number | null {
  if (start === null) return null
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const lineNumber = lines[index]?.[field]
    if (typeof lineNumber === 'number') return lineNumber + 1
  }
  return start
}

function pushDiffLine(file: MutableDiffFile, hunk: UiDiffReviewHunk, rawLine: string): void {
  let oldLineNumber: number | null = null
  let newLineNumber: number | null = null
  let kind: UiDiffLineKind = 'context'
  let content = rawLine

  if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
    kind = 'add'
    content = rawLine.slice(1)
    newLineNumber = nextLineNumber(hunk.lines, 'newLineNumber', hunk.newStart)
    hunk.addedLines += 1
    file.addedLines += 1
  } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
    kind = 'remove'
    content = rawLine.slice(1)
    oldLineNumber = nextLineNumber(hunk.lines, 'oldLineNumber', hunk.oldStart)
    hunk.removedLines += 1
    file.removedLines += 1
  } else if (rawLine.startsWith(' ') || rawLine === '') {
    kind = 'context'
    content = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine
    oldLineNumber = nextLineNumber(hunk.lines, 'oldLineNumber', hunk.oldStart)
    newLineNumber = nextLineNumber(hunk.lines, 'newLineNumber', hunk.newStart)
  } else {
    kind = 'meta'
  }

  hunk.lines.push({
    kind,
    content,
    oldLineNumber,
    newLineNumber,
  })
}

function finalizeFile(file: MutableDiffFile | null, files: MutableDiffFile[]): void {
  if (!file) return
  file.patch = file.patchLines.join('\n').trimEnd()
  files.push(file)
}

function inferStatusFromPatch(file: MutableDiffFile): string {
  const patch = file.patchLines.join('\n')
  if (patch.includes('\nnew file mode ')) return 'added'
  if (patch.includes('\ndeleted file mode ')) return 'deleted'
  if (patch.includes('\nrename from ') || patch.includes('\nrename to ')) return 'renamed'
  return file.status
}

function parseUnifiedPatch(patch: string, messageId: string, fallbackPaths: string[]): MutableDiffFile[] {
  const files: MutableDiffFile[] = []
  const lines = patch.replace(/\r\n/gu, '\n').split('\n')
  let currentFile: MutableDiffFile | null = null
  let currentHunk: UiDiffReviewHunk | null = null
  let fallbackIndex = 0

  for (const rawLine of lines) {
    if (rawLine.startsWith('diff --git ')) {
      if (currentFile) {
        currentFile.status = inferStatusFromPatch(currentFile)
      }
      finalizeFile(currentFile, files)
      const parts = rawLine.split(/\s+/u)
      const oldPath = stripDiffPath(parts[2] ?? '')
      const newPath = stripDiffPath(parts[3] ?? oldPath)
      currentFile = createFile(newPath || fallbackPaths[fallbackIndex] || `Change ${messageId}`, messageId)
      currentFile.oldPath = oldPath && oldPath !== currentFile.filePath ? oldPath : null
      currentFile.patchLines.push(rawLine)
      currentHunk = null
      fallbackIndex += 1
      continue
    }

    if (!currentFile && rawLine.startsWith('@@')) {
      currentFile = createFile(fallbackPaths[fallbackIndex] || `Change ${messageId}`, messageId)
      fallbackIndex += 1
    }

    if (!currentFile) continue

    currentFile.patchLines.push(rawLine)

    if (rawLine.startsWith('--- ')) {
      const oldPath = stripDiffPath(rawLine.slice(4))
      currentFile.oldPath = oldPath !== '/dev/null' && oldPath !== currentFile.filePath ? oldPath : currentFile.oldPath
      continue
    }

    if (rawLine.startsWith('+++ ')) {
      const newPath = stripDiffPath(rawLine.slice(4))
      if (newPath !== '/dev/null') {
        currentFile.filePath = newPath
      }
      continue
    }

    if (rawLine.startsWith('rename from ')) {
      currentFile.oldPath = rawLine.slice('rename from '.length).trim()
      currentFile.status = 'renamed'
      continue
    }

    if (rawLine.startsWith('rename to ')) {
      currentFile.filePath = rawLine.slice('rename to '.length).trim()
      currentFile.status = 'renamed'
      continue
    }

    if (rawLine.startsWith('new file mode ')) {
      currentFile.status = 'added'
      continue
    }

    if (rawLine.startsWith('deleted file mode ')) {
      currentFile.status = 'deleted'
      continue
    }

    if (rawLine.startsWith('@@')) {
      currentHunk = createHunk(rawLine)
      currentFile.hunks.push(currentHunk)
      continue
    }

    if (currentHunk) {
      pushDiffLine(currentFile, currentHunk, rawLine)
    }
  }

  if (currentFile) {
    currentFile.status = inferStatusFromPatch(currentFile)
  }
  finalizeFile(currentFile, files)

  return files
}

function mergeFile(target: UiDiffReviewFile, source: UiDiffReviewFile): UiDiffReviewFile {
  return {
    ...target,
    oldPath: target.oldPath || source.oldPath,
    status: target.status === source.status ? target.status : 'modified',
    messageIds: Array.from(new Set([...target.messageIds, ...source.messageIds])),
    patch: [target.patch, source.patch].filter(Boolean).join('\n\n'),
    addedLines: target.addedLines + source.addedLines,
    removedLines: target.removedLines + source.removedLines,
    hunks: [...target.hunks, ...source.hunks],
  }
}

export function buildDiffReview(messages: UiMessage[]): UiDiffReview {
  const byPath = new Map<string, UiDiffReviewFile>()

  for (const message of messages) {
    if (message.tool?.kind !== 'fileChange' || !message.tool.output) continue
    const parsedFiles = parseUnifiedPatch(message.tool.output, message.id, readFallbackPaths(message.tool))

    for (const file of parsedFiles) {
      const immutableFile: UiDiffReviewFile = {
        ...file,
        patch: file.patch,
      }
      const existing = byPath.get(immutableFile.filePath)
      byPath.set(immutableFile.filePath, existing ? mergeFile(existing, immutableFile) : immutableFile)
    }
  }

  const files = Array.from(byPath.values()).sort((first, second) => first.filePath.localeCompare(second.filePath))
  const summary = files.reduce<UiDiffReviewSummary>(
    (accumulator, file) => ({
      fileCount: accumulator.fileCount + 1,
      hunkCount: accumulator.hunkCount + file.hunks.length,
      addedLines: accumulator.addedLines + file.addedLines,
      removedLines: accumulator.removedLines + file.removedLines,
      patch: '',
    }),
    {
      fileCount: 0,
      hunkCount: 0,
      addedLines: 0,
      removedLines: 0,
      patch: '',
    },
  )

  return {
    files,
    summary: {
      ...summary,
      patch: files.map((file) => file.patch).filter(Boolean).join('\n\n'),
    },
  }
}
