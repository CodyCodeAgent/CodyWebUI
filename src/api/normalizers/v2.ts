import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  Turn,
} from '../appServerDtos'
import type { UiMessage, UiProjectGroup, UiThread, UiToolTimelineEntry } from '../../types/codex'
import {
  buildUserMessageContentMessages,
  toRawPayload,
} from './userMessageContent'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function toProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) || cwd || 'unknown-project'
}

function formatDuration(durationMs: number | null | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return ''
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  const seconds = durationMs / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function readStatus(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'type' in value) {
    const type = (value as { type?: unknown }).type
    return typeof type === 'string' ? type : ''
  }
  return ''
}

function toCompactJson(value: unknown): string {
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function buildToolMessage(item: ThreadItem): UiMessage | null {
  const tool = buildToolTimelineEntry(item)
  if (!tool) return null

  return {
    id: item.id,
    role: 'system',
    text: '',
    messageType: `tool.${item.type}`,
    rawPayload: toRawPayload(item),
    tool,
  }
}

function buildToolTimelineEntry(item: ThreadItem): UiToolTimelineEntry | null {
  if (item.type === 'commandExecution') {
    const details = [`cwd: ${item.cwd}`, `status: ${readStatus(item.status) || 'unknown'}`]
    if (item.exitCode !== null) details.push(`exit: ${String(item.exitCode)}`)
    const duration = formatDuration(item.durationMs)
    if (duration) details.push(`duration: ${duration}`)

    return {
      kind: 'command',
      title: 'Command execution',
      status: readStatus(item.status) || 'unknown',
      summary: item.command,
      details,
      output: item.aggregatedOutput?.trim() || undefined,
      outputLabel: 'Output',
    }
  }

  if (item.type === 'fileChange') {
    const changedFiles = item.changes.map((change) => {
      const kind = readStatus(change.kind) || 'update'
      const movePath =
        change.kind.type === 'update' && change.kind.move_path
          ? ` -> ${change.kind.move_path}`
          : ''
      return `${kind}: ${change.path}${movePath}`
    })
    const diff = item.changes
      .map((change) => change.diff.trim())
      .filter((value) => value.length > 0)
      .join('\n\n')

    return {
      kind: 'fileChange',
      title: 'File changes',
      status: readStatus(item.status) || 'unknown',
      summary: `${String(item.changes.length)} file${item.changes.length === 1 ? '' : 's'} changed`,
      details: [`status: ${readStatus(item.status) || 'unknown'}`, ...changedFiles],
      output: diff || undefined,
      outputLabel: 'Diff',
    }
  }

  if (item.type === 'mcpToolCall') {
    const duration = formatDuration(item.durationMs)
    const details = [
      `server: ${item.server}`,
      `tool: ${item.tool}`,
      `status: ${readStatus(item.status) || 'unknown'}`,
    ]
    if (duration) details.push(`duration: ${duration}`)
    const errorMessage = item.error?.message?.trim() ?? ''
    if (errorMessage) details.push(`error: ${errorMessage}`)

    return {
      kind: 'mcp',
      title: 'MCP tool call',
      status: errorMessage ? 'failed' : readStatus(item.status) || 'unknown',
      summary: `${item.server}.${item.tool}`,
      details,
      output: errorMessage || toCompactJson(item.result || item.arguments) || undefined,
      outputLabel: errorMessage ? 'Error' : 'Result',
    }
  }

  if (item.type === 'collabAgentToolCall') {
    const receivers = item.receiverThreadIds.length > 0 ? item.receiverThreadIds.join(', ') : 'none'
    const details = [
      `tool: ${readStatus(item.tool) || toCompactJson(item.tool) || 'unknown'}`,
      `status: ${readStatus(item.status) || 'unknown'}`,
      `sender: ${item.senderThreadId}`,
      `receivers: ${receivers}`,
    ]

    return {
      kind: 'collabAgent',
      title: 'Agent orchestration',
      status: readStatus(item.status) || 'unknown',
      summary: item.prompt?.trim() || readStatus(item.tool) || 'Collaboration tool call',
      details,
      output: toCompactJson(item.agentsStates) || undefined,
      outputLabel: 'Agent states',
    }
  }

  if (item.type === 'webSearch') {
    return {
      kind: 'webSearch',
      title: 'Web search',
      status: item.action ? readStatus(item.action) || 'recorded' : 'recorded',
      summary: item.query,
      details: item.action ? [`action: ${readStatus(item.action) || toCompactJson(item.action)}`] : [],
      output: item.action ? toCompactJson(item.action) : undefined,
      outputLabel: 'Search metadata',
    }
  }

  if (item.type === 'imageView') {
    return {
      kind: 'imageView',
      title: 'Image viewed',
      status: 'recorded',
      summary: item.path,
      details: [`path: ${item.path}`],
    }
  }

  if (item.type === 'enteredReviewMode' || item.type === 'exitedReviewMode') {
    return {
      kind: 'review',
      title: item.type === 'enteredReviewMode' ? 'Entered review mode' : 'Exited review mode',
      status: 'recorded',
      summary: item.review,
      details: [`review: ${item.review}`],
    }
  }

  if (item.type === 'contextCompaction') {
    return {
      kind: 'context',
      title: 'Context compaction',
      status: 'recorded',
      summary: 'Context was compacted',
      details: [],
    }
  }

  return null
}

function toUiMessages(item: ThreadItem): UiMessage[] {
  if (item.type === 'agentMessage') {
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'plan') {
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'userMessage') {
    return buildUserMessageContentMessages(item.id, item.content, item.type)
  }

  if (item.type === 'reasoning') {
    return []
  }

  const toolMessage = buildToolMessage(item)
  return toolMessage ? [toolMessage] : []
}

function buildTurnReceipt(turn: Turn): UiMessage | null {
  const status = readStatus(turn.status)
  if (status === 'inProgress') return null
  const commandCount = turn.items.filter((item) => item.type === 'commandExecution').length
  const toolCount = turn.items.filter((item) => (
    item.type === 'commandExecution' || item.type === 'mcpToolCall' || item.type === 'webSearch' || item.type === 'collabAgentToolCall'
  )).length
  const fileCount = turn.items
    .filter((item): item is Extract<ThreadItem, { type: 'fileChange' }> => item.type === 'fileChange')
    .reduce((total, item) => total + item.changes.length, 0)
  const validationCount = turn.items.filter((item) => (
    item.type === 'commandExecution' && /(?:^|\s)(?:test|build|typecheck|lint)(?:\s|$)/iu.test(item.command) && item.exitCode === 0
  )).length
  const planCompleted = turn.items.some((item) => item.type === 'plan' && /\[done\]/iu.test(item.text) && !/\[(?:doing|todo)\]/iu.test(item.text))
  const label = status === 'failed'
    ? 'Failed'
    : status === 'interrupted'
      ? 'Stopped'
      : planCompleted && validationCount > 0
        ? 'Completed'
        : fileCount > 0
          ? 'Changed'
          : toolCount > 0
            ? 'Worked'
            : 'Answered'
  const evidence = [
    fileCount > 0 ? `${String(fileCount)} file${fileCount === 1 ? '' : 's'}` : '',
    commandCount > 0 ? `${String(commandCount)} command${commandCount === 1 ? '' : 's'}` : '',
    validationCount > 0 ? `${String(validationCount)} validation${validationCount === 1 ? '' : 's'} passed` : '',
  ].filter(Boolean)
  return {
    id: `turn-summary:${turn.id}`,
    role: 'system',
    text: [label, ...evidence].join(' · '),
    messageType: 'worked',
    rawPayload: JSON.stringify({ label, status, fileCount, commandCount, validationCount }),
  }
}

function pickThreadName(summary: Thread): string {
  const rawSummary = summary as Thread & { name?: unknown; title?: unknown }
  const direct = [rawSummary.name, rawSummary.title, summary.preview]
  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}

function toThreadTitle(summary: Thread): string {
  const named = pickThreadName(summary)
  return named.length > 0 ? named : 'Untitled thread'
}

function toUiThread(summary: Thread): UiThread {
  return {
    id: summary.id,
    title: toThreadTitle(summary),
    projectName: summary.cwd || toProjectName(summary.cwd),
    cwd: summary.cwd,
    createdAtIso: toIso(summary.createdAt),
    updatedAtIso: toIso(summary.updatedAt),
    preview: summary.preview,
    unread: false,
    inProgress: false,
  }
}

function groupThreadsByProject(threads: UiThread[]): UiProjectGroup[] {
  const grouped = new Map<string, UiThread[]>()
  for (const thread of threads) {
    const rows = grouped.get(thread.projectName)
    if (rows) rows.push(thread)
    else grouped.set(thread.projectName, [thread])
  }

  return Array.from(grouped.entries())
    .map(([projectName, projectThreads]) => ({
      projectName,
      cwd: projectName,
      threads: projectThreads.sort(
        (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.threads[0]?.updatedAtIso ?? 0).getTime()
      const bLast = new Date(b.threads[0]?.updatedAtIso ?? 0).getTime()
      return bLast - aLast
    })
}

export function normalizeThreadGroupsV2(payload: ThreadListResponse): UiProjectGroup[] {
  const uiThreads = payload.data.map(toUiThread)
  return groupThreadsByProject(uiThreads)
}

export function normalizeThreadMessagesV2(payload: ThreadReadResponse): UiMessage[] {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const messages: UiMessage[] = []
  for (const turn of turns) {
    const items = Array.isArray(turn.items) ? turn.items : []
    for (const item of items) {
      messages.push(...toUiMessages(item))
    }
    const receipt = buildTurnReceipt(turn)
    if (receipt) messages.push(receipt)
  }
  return messages
}
