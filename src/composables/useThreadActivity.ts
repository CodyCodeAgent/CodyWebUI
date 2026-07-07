import type { UiMessage, UiServerRequest, UiToolTimelineEntry } from '../types/codex'
import type { UiDiffLineKind, UiDiffReview, UiDiffReviewFile } from './useDiffReview'
import { isToolFailureStatus } from './threadToolTimelineRules'
export { isToolFailureStatus } from './threadToolTimelineRules'

export type UiThreadActivityEntry = UiToolTimelineEntry & {
  messageId: string
}

export type UiThreadActivitySummary = {
  toolCount: number
  commandCount: number
  fileChangeCount: number
  mcpCount: number
  failedCount: number
  pendingRequestCount: number
}

export type UiThreadCommandEntry = UiToolTimelineEntry & {
  messageId: string
  cwd: string
  exitCode: number | null
  duration: string
}

export type WorkLogMetric = {
  label: string
  value: string
}

export function buildThreadActivityEntries(messages: UiMessage[]): UiThreadActivityEntry[] {
  return messages
    .filter((message): message is UiMessage & { tool: UiToolTimelineEntry } => Boolean(message.tool))
    .map((message) => ({
      ...message.tool,
      messageId: message.id,
    }))
}

function parseDetailValue(details: string[], key: string): string {
  const prefix = `${key}:`
  const row = details.find((detail) => detail.trim().toLowerCase().startsWith(prefix))
  if (!row) return ''
  return row.slice(prefix.length).trim()
}

function parseExitCode(details: string[]): number | null {
  const raw = parseDetailValue(details, 'exit')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function buildThreadCommandEntries(messages: UiMessage[]): UiThreadCommandEntry[] {
  return buildThreadActivityEntries(messages)
    .filter((entry) => entry.kind === 'command')
    .map((entry) => ({
      ...entry,
      cwd: parseDetailValue(entry.details, 'cwd'),
      exitCode: parseExitCode(entry.details),
      duration: parseDetailValue(entry.details, 'duration'),
    }))
}

export function buildThreadActivitySummary(
  messages: UiMessage[],
  pendingRequests: UiServerRequest[],
): UiThreadActivitySummary {
  const entries = buildThreadActivityEntries(messages)

  return {
    toolCount: entries.length,
    commandCount: entries.filter((entry) => entry.kind === 'command').length,
    fileChangeCount: entries.filter((entry) => entry.kind === 'fileChange').length,
    mcpCount: entries.filter((entry) => entry.kind === 'mcp').length,
    failedCount: entries.filter((entry) => isToolFailureStatus(entry.status)).length,
    pendingRequestCount: pendingRequests.length,
  }
}

export function buildWorkLogStatusText(input: {
  pendingRequestCount: number
  fileCount: number
  commandCount: number
}): string {
  if (input.pendingRequestCount > 0) return `${String(input.pendingRequestCount)} waiting`
  if (input.fileCount > 0 || input.commandCount > 0) {
    return `${String(input.fileCount)} changed file${input.fileCount === 1 ? '' : 's'} · ${String(input.commandCount)} command${input.commandCount === 1 ? '' : 's'}`
  }
  return 'No changes or commands recorded yet'
}

export function buildWorkLogFloatSummary(input: {
  fileCount: number
  commandCount: number
}): string {
  return `${String(input.fileCount)} files · ${String(input.commandCount)} commands`
}

export function buildWorkLogMetrics(input: {
  fileCount: number
  commandCount: number
  addedLines: number
  removedLines: number
}): WorkLogMetric[] {
  return [
    { label: 'files', value: String(input.fileCount) },
    { label: 'commands', value: String(input.commandCount) },
    { label: 'added', value: `+${String(input.addedLines)}` },
    { label: 'removed', value: `-${String(input.removedLines)}` },
  ]
}

export function buildPendingApprovalSubtitle(count: number): string {
  return `${String(count)} approval${count === 1 ? '' : 's'} waiting`
}

export function buildWorkLogFileStatLabel(input: {
  addedLines: number
  removedLines: number
}): string {
  return `+${String(input.addedLines)} / -${String(input.removedLines)}`
}

export function workLogBadgeCount(review: UiDiffReview, commandCount: number): number {
  return review.summary.fileCount + commandCount
}

export function workLogFullscreenFile(review: UiDiffReview, filePath: string): UiDiffReviewFile | null {
  if (!filePath) return null
  return review.files.find((file) => file.filePath === filePath) ?? null
}

export function shouldCloseWorkLogFullscreenFile(review: UiDiffReview, filePath: string): boolean {
  return Boolean(filePath) && !review.files.some((file) => file.filePath === filePath)
}

export function formatWorkLogLineNumber(value: number | null): string {
  return typeof value === 'number' ? String(value) : ''
}

export function workLogDiffLinePrefix(kind: UiDiffLineKind): string {
  if (kind === 'add') return '+'
  if (kind === 'remove') return '-'
  return ''
}
