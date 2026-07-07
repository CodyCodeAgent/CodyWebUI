import type { UiMessage, UiServerRequest, UiToolTimelineEntry } from '../types/codex'
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
