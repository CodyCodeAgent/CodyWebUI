import type { TurnActivityState } from './realtimeNotificationReaders'
import type { UiLiveOverlay, UiMessage, UiToolingRollbackFileResult } from '../types/codex'

const WORKED_MESSAGE_TYPE = 'worked'

export type TurnSummaryState = {
  turnId: string
  durationMs: number
}

export type TurnErrorState = {
  message: string
}

export type LiveAssistantMessageType = 'agentMessage.live' | 'plan.live'

function areStringArraysEqual(first?: string[], second?: string[]): boolean {
  const left = Array.isArray(first) ? first : []
  const right = Array.isArray(second) ? second : []
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function areMessageToolsEqual(first: UiMessage['tool'], second: UiMessage['tool']): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  if (
    first.kind !== second.kind ||
    first.title !== second.title ||
    first.status !== second.status ||
    first.summary !== second.summary ||
    first.output !== second.output ||
    first.outputLabel !== second.outputLabel
  ) {
    return false
  }
  return areStringArraysEqual(first.details, second.details)
}

function areMessageFieldsEqual(first: UiMessage, second: UiMessage): boolean {
  return (
    first.id === second.id &&
    first.role === second.role &&
    first.text === second.text &&
    areStringArraysEqual(first.images, second.images) &&
    areMessageToolsEqual(first.tool, second.tool) &&
    first.messageType === second.messageType &&
    first.rawPayload === second.rawPayload &&
    first.isUnhandled === second.isUnhandled
  )
}

export function areMessageArraysEqual(first: UiMessage[], second: UiMessage[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

function omitRecordKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export function mergeMessages(
  previous: UiMessage[],
  incoming: UiMessage[],
  options: { preserveMissing?: boolean } = {},
): UiMessage[] {
  const previousById = new Map(previous.map((message) => [message.id, message]))
  const incomingById = new Map(incoming.map((message) => [message.id, message]))

  const mergedIncoming = incoming.map((incomingMessage) => {
    const previousMessage = previousById.get(incomingMessage.id)
    if (previousMessage && areMessageFieldsEqual(previousMessage, incomingMessage)) {
      return previousMessage
    }
    return incomingMessage
  })

  if (options.preserveMissing !== true) {
    return areMessageArraysEqual(previous, mergedIncoming) ? previous : mergedIncoming
  }

  const mergedFromPrevious = previous.map((previousMessage) => {
    const nextMessage = incomingById.get(previousMessage.id)
    if (!nextMessage) {
      return previousMessage
    }
    if (areMessageFieldsEqual(previousMessage, nextMessage)) {
      return previousMessage
    }
    return nextMessage
  })

  const previousIdSet = new Set(previous.map((message) => message.id))
  const appended = mergedIncoming.filter((message) => !previousIdSet.has(message.id))
  const merged = [...mergedFromPrevious, ...appended]

  return areMessageArraysEqual(previous, merged) ? previous : merged
}

export function normalizeMessageText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

export function removeRedundantLiveAgentMessages(previous: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const incomingAssistantTexts = new Set(
    incoming
      .filter((message) => message.role === 'assistant')
      .map((message) => normalizeMessageText(message.text))
      .filter((text) => text.length > 0),
  )

  if (incomingAssistantTexts.size === 0) {
    return previous
  }

  const next = previous.filter((message) => {
    if (message.messageType !== 'agentMessage.live' && message.messageType !== 'plan.live') return true
    const normalized = normalizeMessageText(message.text)
    if (normalized.length === 0) return false
    return !incomingAssistantTexts.has(normalized)
  })

  return next.length === previous.length ? previous : next
}

export function upsertMessage(previous: UiMessage[], nextMessage: UiMessage): UiMessage[] {
  const existingIndex = previous.findIndex((message) => message.id === nextMessage.id)
  if (existingIndex < 0) {
    return [...previous, nextMessage]
  }

  const existing = previous[existingIndex]
  if (areMessageFieldsEqual(existing, nextMessage)) {
    return previous
  }

  const next = [...previous]
  next.splice(existingIndex, 1, nextMessage)
  return next
}

export function upsertLiveAssistantDelta(
  previous: UiMessage[],
  delta: {
    messageId: string
    textDelta: string
    messageType: LiveAssistantMessageType
  },
): UiMessage[] {
  if (!delta.messageId || !delta.textDelta) return previous
  const existing = previous.find((message) => message.id === delta.messageId)
  return upsertMessage(previous, {
    id: delta.messageId,
    role: 'assistant',
    text: `${existing?.text ?? ''}${delta.textDelta}`,
    messageType: delta.messageType,
  })
}

export function normalizeLiveReasoningTextForStorage(text: string): string {
  return text.trim().length === 0 ? '' : text
}

export function appendLiveReasoningDelta(previous: string, delta: string): string {
  return normalizeLiveReasoningTextForStorage(`${previous}${delta}`)
}

export function appendLiveReasoningSectionBreak(current: string): string {
  if (current.trim().length === 0 || current.endsWith('\n\n')) return current
  return `${current}\n\n`
}

export function buildDisplayedMessages(
  persistedMessages: UiMessage[],
  liveAgentMessages: UiMessage[],
  turnSummary: TurnSummaryState | null | undefined,
): UiMessage[] {
  const combined = persistedMessages === liveAgentMessages
    ? persistedMessages
    : [...persistedMessages, ...liveAgentMessages]

  return turnSummary ? insertTurnSummaryMessage(combined, turnSummary) : combined
}

export function formatTurnDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '<1s'
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`)
  }

  const displaySeconds = seconds > 0 || parts.length === 0 ? seconds : 0
  parts.push(`${displaySeconds}s`)
  return parts.join(' ')
}

export function areTurnSummariesEqual(first?: TurnSummaryState, second?: TurnSummaryState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return first.turnId === second.turnId && first.durationMs === second.durationMs
}

export function areTurnActivitiesEqual(first?: TurnActivityState, second?: TurnActivityState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  if (first.label !== second.label) return false
  if (first.details.length !== second.details.length) return false
  for (let index = 0; index < first.details.length; index += 1) {
    if (first.details[index] !== second.details[index]) return false
  }
  return true
}

function sanitizeDisplayText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

export function mergeTurnActivity(
  previous: TurnActivityState | undefined,
  activity: TurnActivityState,
): TurnActivityState {
  const normalizedLabel = sanitizeDisplayText(activity.label) || 'Thinking'
  const incomingDetails = activity.details
    .map((line) => sanitizeDisplayText(line))
    .filter((line) => line.length > 0 && line !== normalizedLabel)
  const mergedDetails = Array.from(new Set([...(previous?.details ?? []), ...incomingDetails])).slice(-3)

  return {
    label: normalizedLabel,
    details: mergedDetails,
  }
}

export function updateTurnSummaryState(
  state: Record<string, TurnSummaryState>,
  threadId: string,
  summary: TurnSummaryState | null,
): Record<string, TurnSummaryState> {
  if (!threadId) return state

  const previous = state[threadId]
  if (!summary) return previous ? omitRecordKey(state, threadId) : state
  if (areTurnSummariesEqual(previous, summary)) return state

  return {
    ...state,
    [threadId]: summary,
  }
}

export function updateTurnActivityState(
  state: Record<string, TurnActivityState>,
  threadId: string,
  activity: TurnActivityState | null,
): Record<string, TurnActivityState> {
  if (!threadId) return state

  const previous = state[threadId]
  if (!activity) return previous ? omitRecordKey(state, threadId) : state

  const nextActivity = mergeTurnActivity(previous, activity)
  if (areTurnActivitiesEqual(previous, nextActivity)) return state

  return {
    ...state,
    [threadId]: nextActivity,
  }
}

export function updateTurnErrorState(
  state: Record<string, TurnErrorState>,
  threadId: string,
  message: string | null,
): Record<string, TurnErrorState> {
  if (!threadId) return state

  const previous = state[threadId]
  const normalizedMessage = message ? normalizeMessageText(message) : ''
  if (!normalizedMessage) return previous ? omitRecordKey(state, threadId) : state
  if (previous?.message === normalizedMessage) return state

  return {
    ...state,
    [threadId]: { message: normalizedMessage },
  }
}

export function buildLiveOverlay(
  threadId: string,
  activityByThreadId: Record<string, TurnActivityState>,
  reasoningTextByThreadId: Record<string, string>,
  errorByThreadId: Record<string, TurnErrorState>,
): UiLiveOverlay | null {
  if (!threadId) return null

  const activity = activityByThreadId[threadId]
  const reasoningText = (reasoningTextByThreadId[threadId] ?? '').trim()
  const errorText = (errorByThreadId[threadId]?.message ?? '').trim()

  if (!activity && !reasoningText && !errorText) return null
  return {
    activityLabel: activity?.label || 'Thinking',
    activityDetails: activity?.details ?? [],
    reasoningText,
    errorText,
  }
}

export function resolveTurnDurationMs(values: {
  explicitDurationMs?: number | null
  turnDurationMs?: number | null
  completedStartedAtMs?: number | null
  completedAtMs: number
  pendingStartedAtMs?: number | null
}): number {
  const rawDurationMs =
    values.explicitDurationMs ??
    values.turnDurationMs ??
    (typeof values.completedStartedAtMs === 'number'
      ? values.completedAtMs - values.completedStartedAtMs
      : null) ??
    (typeof values.pendingStartedAtMs === 'number'
      ? values.completedAtMs - values.pendingStartedAtMs
      : null)

  return typeof rawDurationMs === 'number' ? Math.max(0, rawDurationMs) : 0
}

export function buildTurnSummaryMessage(summary: TurnSummaryState): UiMessage {
  return {
    id: `turn-summary:${summary.turnId}`,
    role: 'system',
    text: `Worked for ${formatTurnDuration(summary.durationMs)}`,
    messageType: WORKED_MESSAGE_TYPE,
  }
}

export function buildRollbackAuditMessage(result: UiToolingRollbackFileResult): UiMessage {
  const remainingStatus = result.remainingStatus.trim()
  const checkpoint = result.checkpoint
  return {
    id: `tooling.rollback:${checkpoint.id}:${result.relativePath}`,
    role: 'system',
    text: '',
    messageType: 'tool.rollback',
    tool: {
      kind: 'rollback',
      title: 'File rollback',
      status: result.rollbackApplied ? 'completed' : 'no changes',
      summary: result.rollbackApplied
        ? `Rolled back ${result.relativePath}`
        : `No local changes found for ${result.relativePath}`,
      details: [
        `file: ${result.relativePath}`,
        `checkpoint: ${checkpoint.id}`,
        `patch bytes: ${String(checkpoint.patchBytes)}`,
        `remaining status: ${remainingStatus || 'clean'}`,
      ],
      output: checkpoint.patchPath,
      outputLabel: 'Checkpoint patch',
    },
  }
}

function findLastAssistantMessageIndex(messages: UiMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return index
    }
  }
  return -1
}

export function insertTurnSummaryMessage(messages: UiMessage[], summary: TurnSummaryState): UiMessage[] {
  const summaryMessage = buildTurnSummaryMessage(summary)
  const sanitizedMessages = messages.filter((message) => message.messageType !== WORKED_MESSAGE_TYPE)
  const insertIndex = findLastAssistantMessageIndex(sanitizedMessages)
  if (insertIndex < 0) {
    return [...sanitizedMessages, summaryMessage]
  }
  const next = [...sanitizedMessages]
  next.splice(insertIndex, 0, summaryMessage)
  return next
}
