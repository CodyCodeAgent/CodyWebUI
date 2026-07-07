import type { RpcNotification } from '../api/codexRealtimeClient'
import type { UiMessage, UiThread } from '../types/codex'
import { buildUserMessageContentMessages } from '../api/normalizers/userMessageContent'
import {
  asRecord,
  readIsoTimestampMs,
  readIsoTimestampString,
  readNumber,
  readString,
} from '../api/protocolValueReaders'

export type TurnActivityState = {
  label: string
  details: string[]
}

export type TurnStartedInfo = {
  threadId: string
  turnId: string
  startedAtMs: number
}

export type TurnCompletedInfo = {
  threadId: string
  turnId: string
  completedAtMs: number
  startedAtMs?: number
}

function formatPlanStepStatus(value: string): string {
  if (value === 'completed') return '[done]'
  if (value === 'inProgress') return '[doing]'
  return '[todo]'
}

export function extractThreadIdFromNotification(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  const directThreadId = readString(params.threadId)
  if (directThreadId) return directThreadId
  const snakeThreadId = readString(params.thread_id)
  if (snakeThreadId) return snakeThreadId

  const conversationId = readString(params.conversationId)
  if (conversationId) return conversationId
  const snakeConversationId = readString(params.conversation_id)
  if (snakeConversationId) return snakeConversationId

  const thread = asRecord(params.thread)
  const nestedThreadId = readString(thread?.id)
  if (nestedThreadId) return nestedThreadId

  const turn = asRecord(params.turn)
  const turnThreadId = readString(turn?.threadId)
  if (turnThreadId) return turnThreadId
  const turnSnakeThreadId = readString(turn?.thread_id)
  if (turnSnakeThreadId) return turnSnakeThreadId

  return ''
}

export function readTurnErrorMessage(notification: RpcNotification): string {
  if (notification.method !== 'turn/completed') return ''
  const params = asRecord(notification.params)
  const turn = asRecord(params?.turn)
  if (!turn || turn.status !== 'failed') return ''
  const errorPayload = asRecord(turn.error)
  return readString(errorPayload?.message)
}

export function readTurnActivity(notification: RpcNotification): { threadId: string; activity: TurnActivityState } | null {
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  if (notification.method === 'turn/started') {
    return { threadId, activity: { label: 'Thinking', details: [] } }
  }

  if (notification.method === 'item/started') {
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    const itemType = readString(item?.type).toLowerCase()
    if (itemType === 'reasoning') {
      return { threadId, activity: { label: 'Thinking', details: [] } }
    }
    if (itemType === 'agentmessage') {
      return { threadId, activity: { label: 'Writing response', details: [] } }
    }
    if (itemType === 'plan') {
      return { threadId, activity: { label: 'Writing plan', details: [] } }
    }
  }

  if (
    notification.method === 'item/reasoning/summaryTextDelta' ||
    notification.method === 'item/reasoning/textDelta' ||
    notification.method === 'item/reasoning/summaryPartAdded'
  ) {
    return { threadId, activity: { label: 'Thinking', details: [] } }
  }

  if (notification.method === 'item/agentMessage/delta') {
    return { threadId, activity: { label: 'Writing response', details: [] } }
  }

  if (notification.method === 'item/plan/delta' || notification.method === 'turn/plan/updated') {
    return { threadId, activity: { label: 'Writing plan', details: [] } }
  }

  return null
}

export function readTurnStartedInfo(notification: RpcNotification): TurnStartedInfo | null {
  if (notification.method !== 'turn/started') return null

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId = readString(turnPayload?.id) || readString(params.turnId) || `${threadId}:unknown`
  if (!turnId) return null

  const startedAtMs =
    readIsoTimestampMs(turnPayload?.startedAt) ??
    readIsoTimestampMs(params.startedAt) ??
    readIsoTimestampMs(notification.atIso) ??
    Date.now()

  return { threadId, turnId, startedAtMs }
}

export function readTurnCompletedInfo(notification: RpcNotification): TurnCompletedInfo | null {
  if (notification.method !== 'turn/completed') return null

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId = readString(turnPayload?.id) || readString(params.turnId) || `${threadId}:unknown`
  if (!turnId) return null

  const completedAtMs =
    readIsoTimestampMs(turnPayload?.completedAt) ??
    readIsoTimestampMs(params.completedAt) ??
    readIsoTimestampMs(notification.atIso) ??
    Date.now()

  const startedAtMs =
    readIsoTimestampMs(turnPayload?.startedAt) ??
    readIsoTimestampMs(params.startedAt) ??
    undefined

  return { threadId, turnId, completedAtMs, startedAtMs }
}

export function readTurnDurationHints(notification: RpcNotification): {
  explicitDurationMs: number | null
  turnDurationMs: number | null
} {
  const params = asRecord(notification.params)
  const turn = asRecord(params?.turn)
  return {
    explicitDurationMs: readNumber(params?.durationMs),
    turnDurationMs: readNumber(turn?.durationMs),
  }
}

export function readRateLimitSnapshotPayload(notification: RpcNotification): unknown | null {
  if (notification.method !== 'account/rateLimits/updated') return null
  const params = asRecord(notification.params)
  return params?.rateLimits ?? null
}

export function readStartedThread(notification: RpcNotification): UiThread | null {
  if (notification.method !== 'thread/started') return null
  const params = asRecord(notification.params)
  if (!params) return null

  const threadPayload = asRecord(params.thread) ?? params
  const id = readString(threadPayload.id) || readString(params.threadId)
  if (!id) return null

  const cwd = readString(threadPayload.cwd) || readString(params.cwd)
  const projectName =
    readString(threadPayload.projectName) ||
    readString(threadPayload.project_name) ||
    readString(params.projectName) ||
    cwd ||
    'unknown-project'
  const title =
    readString(threadPayload.title) ||
    readString(threadPayload.name) ||
    readString(params.title) ||
    'Untitled thread'
  const preview = readString(threadPayload.preview) || readString(params.preview) || title
  const timestamp =
    readIsoTimestampString(threadPayload.updatedAt) ||
    readIsoTimestampString(threadPayload.updated_at) ||
    readIsoTimestampString(threadPayload.createdAt) ||
    readIsoTimestampString(threadPayload.created_at) ||
    notification.atIso
  const createdAtIso =
    readIsoTimestampString(threadPayload.createdAt) ||
    readIsoTimestampString(threadPayload.created_at) ||
    timestamp
  const updatedAtIso =
    readIsoTimestampString(threadPayload.updatedAt) ||
    readIsoTimestampString(threadPayload.updated_at) ||
    timestamp

  return {
    id,
    title,
    projectName,
    cwd,
    createdAtIso,
    updatedAtIso,
    preview,
    unread: false,
    inProgress: false,
  }
}

export function liveReasoningMessageId(reasoningItemId: string): string {
  return `${reasoningItemId}:live-reasoning`
}

export function readReasoningStartedItemId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/started') return ''
  const item = asRecord(params.item)
  if (!item || item.type !== 'reasoning') return ''
  return readString(item.id)
}

export function readReasoningDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (
    !params ||
    (
      notification.method !== 'item/reasoning/summaryTextDelta' &&
      notification.method !== 'item/reasoning/textDelta'
    )
  ) {
    return null
  }
  const itemId = readString(params.itemId)
  const delta = readString(params.delta)
  if (!itemId || !delta) return null
  return { messageId: liveReasoningMessageId(itemId), delta }
}

export function readReasoningSectionBreakMessageId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/reasoning/summaryPartAdded') return ''
  const itemId = readString(params.itemId)
  return itemId ? liveReasoningMessageId(itemId) : ''
}

export function readReasoningCompletedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/completed') return ''
  const item = asRecord(params.item)
  if (!item || item.type !== 'reasoning') return ''
  return liveReasoningMessageId(readString(item.id))
}

export function readAgentMessageStartedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/started') return ''
  const item = asRecord(params.item)
  if (!item || item.type !== 'agentMessage') return ''
  return readString(item.id)
}

export function readAgentMessageDelta(notification: RpcNotification): { messageId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/agentMessage/delta') return null
  const messageId = readString(params.itemId)
  const delta = readString(params.delta)
  if (!messageId || !delta) return null
  return { messageId, delta }
}

export function readAgentMessageCompleted(notification: RpcNotification): UiMessage | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/completed') return null
  const item = asRecord(params.item)
  if (!item || item.type !== 'agentMessage') return null
  const id = readString(item.id)
  const text = readString(item.text)
  if (!id || !text) return null
  return { id, role: 'assistant', text, messageType: 'agentMessage.live' }
}

export function readUserMessageCompleted(notification: RpcNotification): UiMessage[] {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/completed') return []
  const item = asRecord(params.item)
  if (!item || item.type !== 'userMessage') return []

  const itemId = readString(item.id)
  if (!itemId || !Array.isArray(item.content)) return []
  return buildUserMessageContentMessages(itemId, item.content)
}

export function readPlanMessageDelta(notification: RpcNotification): { messageId: string; turnId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/plan/delta') return null
  const itemId = readString(params.itemId)
  const turnId = readString(params.turnId)
  const delta = readString(params.delta)
  if (!itemId || !delta) return null
  return { messageId: itemId, turnId, delta }
}

export function readPlanMessageCompleted(notification: RpcNotification): UiMessage | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/completed') return null
  const item = asRecord(params.item)
  if (!item || item.type !== 'plan') return null
  const id = readString(item.id)
  const text = readString(item.text)
  if (!id || !text) return null
  return { id, role: 'assistant', text, messageType: 'plan.live' }
}

export function readPlanUpdatedMessage(
  notification: RpcNotification,
  planMessageIdForTurn: (turnId: string) => string | undefined,
): UiMessage | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'turn/plan/updated') return null

  const turnId = readString(params.turnId)
  if (!turnId) return null

  const parts: string[] = []
  const explanation = readString(params.explanation).trim()
  if (explanation) {
    parts.push(explanation)
  }

  const plan = Array.isArray(params.plan) ? params.plan : []
  const steps: string[] = []
  for (const [index, row] of plan.entries()) {
    const step = asRecord(row)
    if (!step) continue
    const text = readString(step.step).trim()
    if (!text) continue
    steps.push(`${String(index + 1)}. ${formatPlanStepStatus(readString(step.status))} ${text}`)
  }
  if (steps.length > 0) {
    parts.push(steps.join('\n'))
  }

  const text = parts.join('\n\n').trim()
  if (!text) return null

  return {
    id: planMessageIdForTurn(turnId) ?? `plan:${turnId}:live`,
    role: 'assistant',
    text,
    messageType: 'plan.live',
  }
}

export function isAgentContentEvent(notification: RpcNotification): boolean {
  if (notification.method === 'item/agentMessage/delta' || notification.method === 'item/plan/delta') {
    return true
  }

  const params = asRecord(notification.params)
  if (!params) return false

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    return item?.type === 'agentMessage' || item?.type === 'plan'
  }

  return notification.method === 'turn/plan/updated'
}
