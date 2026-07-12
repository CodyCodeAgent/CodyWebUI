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

export type StructuredPlanStepStatus = 'pending' | 'inProgress' | 'completed'
export type StructuredPlanStep = { step: string; status: StructuredPlanStepStatus }
export type StructuredPlanUpdate = {
  threadId: string
  turnId: string
  explanation: string
  steps: StructuredPlanStep[]
  updatedAtIso: string
}

function formatPlanStepStatus(value: string): string {
  if (value === 'completed') return '[done]'
  if (value === 'inProgress') return '[doing]'
  return '[todo]'
}

function readProtocolId(record: Record<string, unknown> | null | undefined, camelKey: string, snakeKey: string): string {
  return readString(record?.[camelKey]) || readString(record?.[snakeKey])
}

function readNotificationItemId(params: Record<string, unknown>): string {
  const directId = readProtocolId(params, 'itemId', 'item_id')
  if (directId) return directId

  const item = asRecord(params.item)
  return readString(item?.id)
}

function readNotificationTextDelta(params: Record<string, unknown>): string {
  return (
    readString(params.delta) ||
    readString(params.textDelta) ||
    readString(params.text_delta) ||
    readString(params.content) ||
    readString(params.text)
  )
}

export function extractThreadIdFromNotification(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  const directThreadId = readProtocolId(params, 'threadId', 'thread_id')
  if (directThreadId) return directThreadId

  const conversationId = readProtocolId(params, 'conversationId', 'conversation_id')
  if (conversationId) return conversationId

  const thread = asRecord(params.thread)
  const nestedThreadId = readString(thread?.id)
  if (nestedThreadId) return nestedThreadId

  const turn = asRecord(params.turn)
  const turnThreadId = readProtocolId(turn, 'threadId', 'thread_id')
  if (turnThreadId) return turnThreadId

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
  const turnId = readString(turnPayload?.id) || readProtocolId(params, 'turnId', 'turn_id') || `${threadId}:unknown`
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
  const itemId = readNotificationItemId(params)
  const delta = readNotificationTextDelta(params)
  if (!itemId || !delta) return null
  return { messageId: liveReasoningMessageId(itemId), delta }
}

export function readReasoningSectionBreakMessageId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'item/reasoning/summaryPartAdded') return ''
  const itemId = readNotificationItemId(params)
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
  const messageId = readNotificationItemId(params)
  const delta = readNotificationTextDelta(params)
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
  const itemId = readNotificationItemId(params)
  const turnId = readProtocolId(params, 'turnId', 'turn_id')
  const delta = readNotificationTextDelta(params)
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

  const turnId = readProtocolId(params, 'turnId', 'turn_id')
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

export function readStructuredPlanUpdate(notification: RpcNotification): StructuredPlanUpdate | null {
  const params = asRecord(notification.params)
  if (!params || notification.method !== 'turn/plan/updated') return null
  const threadId = extractThreadIdFromNotification(notification)
  const turnId = readProtocolId(params, 'turnId', 'turn_id')
  if (!threadId || !turnId || !Array.isArray(params.plan)) return null
  const steps: StructuredPlanStep[] = []
  for (const value of params.plan) {
    const row = asRecord(value)
    const step = readString(row?.step).trim()
    const status = readString(row?.status)
    if (!step || (status !== 'pending' && status !== 'inProgress' && status !== 'completed')) continue
    steps.push({ step, status })
  }
  if (steps.length === 0) return null
  return {
    threadId, turnId, steps,
    explanation: readString(params.explanation).trim(),
    updatedAtIso: readIsoTimestampString(notification.atIso) ?? new Date().toISOString(),
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
