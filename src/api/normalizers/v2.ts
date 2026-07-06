import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  UserInput,
} from '../appServerDtos'
import type { UiComposerSkill, UiMessage, UiProjectGroup, UiThread, UiToolTimelineEntry } from '../../types/codex'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function toProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) || cwd || 'unknown-project'
}

function toRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
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

function toLocalImagePreviewUrl(path: string): string {
  return `/codex-api/local-image?path=${encodeURIComponent(path)}`
}

function extractCodexUserRequestText(value: string): string {
  const markerRegex = /(?:^|\n)\s{0,3}#{0,6}\s*my request for codex\s*:?\s*/giu
  const matches = Array.from(value.matchAll(markerRegex))
  if (matches.length === 0) {
    return value.trim()
  }

  const lastMatch = matches.at(-1)
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return value.trim()
  }

  const markerOffset = lastMatch.index + lastMatch[0].length
  return value.slice(markerOffset).trim()
}

function parseUserMessageContent(
  itemId: string,
  content: UserInput[] | undefined,
): { text: string; images: string[]; skills: UiComposerSkill[]; rawBlocks: UiMessage[] } {
  if (!Array.isArray(content)) return { text: '', images: [], skills: [], rawBlocks: [] }

  const textChunks: string[] = []
  const images: string[] = []
  const skills: UiComposerSkill[] = []
  const rawBlocks: UiMessage[] = []

  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      textChunks.push(block.text)
    }
    if (block.type === 'image' && typeof block.url === 'string' && block.url.trim().length > 0) {
      images.push(block.url.trim())
    }
    if (block.type === 'localImage' && typeof block.path === 'string' && block.path.trim().length > 0) {
      images.push(toLocalImagePreviewUrl(block.path.trim()))
    }
    if (block.type === 'skill' && typeof block.name === 'string' && typeof block.path === 'string') {
      const name = block.name.trim()
      const path = block.path.trim()
      if (name && path) {
        skills.push({
          name,
          path,
          displayName: name,
          description: '',
        })
      }
    }

    if (block.type !== 'text' && block.type !== 'image' && block.type !== 'localImage' && block.type !== 'skill') {
      rawBlocks.push({
        id: `${itemId}:user-content:${index}`,
        role: 'user',
        text: '',
        messageType: `userContent.${block.type}`,
        rawPayload: toRawPayload(block),
        isUnhandled: true,
      })
    }
  }

  return {
    text: extractCodexUserRequestText(textChunks.join('\n')),
    images,
    skills,
    rawBlocks,
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
    const parsed = parseUserMessageContent(item.id, item.content as UserInput[] | undefined)
    const messages: UiMessage[] = []
    const hasRenderableUserContent = parsed.text.length > 0 || parsed.images.length > 0 || parsed.skills.length > 0

    if (hasRenderableUserContent) {
      messages.push({
        id: item.id,
        role: 'user',
        text: parsed.text,
        images: parsed.images,
        skills: parsed.skills,
        messageType: item.type,
      })
    }

    messages.push(...parsed.rawBlocks)
    if (messages.length === 0) {
      return []
    }

    return messages
  }

  if (item.type === 'reasoning') {
    return []
  }

  const toolMessage = buildToolMessage(item)
  return toolMessage ? [toolMessage] : []
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
  }
  return messages
}
