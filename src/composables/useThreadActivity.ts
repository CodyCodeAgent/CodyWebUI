import type { UiMessage, UiServerRequest, UiToolTimelineEntry } from '../types/codex'

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

export function isToolFailureStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('decline') ||
    normalized.includes('cancel')
  )
}

export function buildThreadActivityEntries(messages: UiMessage[]): UiThreadActivityEntry[] {
  return messages
    .filter((message): message is UiMessage & { tool: UiToolTimelineEntry } => Boolean(message.tool))
    .map((message) => ({
      ...message.tool,
      messageId: message.id,
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
