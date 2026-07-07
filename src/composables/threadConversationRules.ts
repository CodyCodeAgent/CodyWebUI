import { asRecord } from '../api/protocolValueReaders'
import type {
  ThreadScrollState,
  UiApprovalDecisionScope,
  UiLiveOverlay,
  UiMessage,
  UiServerRequest,
  UiServerRequestReply,
  UiToolTimelineEntry,
} from '../types/codex'
import {
  approvalDecisionForScope,
  approvalScopeForDecision,
  type UiApprovalDecision,
} from './useApprovalRisk'
import { formatToolStatus } from './threadToolTimelineRules'

export type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

export type ConversationScrollMetrics = {
  maxScrollTop: number
  scrollRatio: number
  isAtBottom: boolean
}

export function buildToolCopyText(tool: UiToolTimelineEntry): string {
  const parts = [`${tool.title}: ${tool.summary}`]
  if (tool.status.trim().length > 0) {
    parts.push(`Status: ${formatToolStatus(tool.status)}`)
  }
  if (tool.details.length > 0) {
    parts.push(tool.details.join('\n'))
  }
  if (tool.output?.trim()) {
    parts.push(`${tool.outputLabel || 'Output'}:\n${tool.output.trim()}`)
  }
  return parts.join('\n')
}

export function buildCopyText(message: UiMessage): string {
  const parts: string[] = []
  if (message.tool) {
    parts.push(buildToolCopyText(message.tool))
  }

  const text = message.text.trim()
  if (text.length > 0) {
    parts.push(text)
  }

  const skills = message.skills?.filter((skill) => skill.name.trim().length > 0) ?? []
  if (skills.length > 0) {
    parts.push(skills.map((skill) => `$${skill.name}`).join('\n'))
  }

  const images = message.images?.filter((imageUrl) => imageUrl.trim().length > 0) ?? []
  if (images.length > 0) {
    parts.push(images.join('\n'))
  }

  return parts.join('\n\n')
}

export function isCopyableMessage(message: UiMessage): boolean {
  if (message.messageType === 'worked') return false
  return buildCopyText(message).length > 0
}

export function isAssistantResponseMessage(message: UiMessage): boolean {
  return message.role !== 'user' && isCopyableMessage(message)
}

export function findNextCopyableMessageIndex(messages: UiMessage[], startIndex: number): number {
  for (let index = startIndex; index < messages.length; index += 1) {
    if (isCopyableMessage(messages[index])) {
      return index
    }
  }
  return -1
}

export function shouldShowCopyButton(messages: UiMessage[], message: UiMessage, messageIndex: number): boolean {
  if (!isCopyableMessage(message)) return false
  if (message.role === 'user') return true

  const nextCopyableIndex = findNextCopyableMessageIndex(messages, messageIndex + 1)
  if (nextCopyableIndex === -1) return true
  return !isAssistantResponseMessage(messages[nextCopyableIndex])
}

export function buildCopyTextAt(messages: UiMessage[], message: UiMessage, messageIndex: number): string {
  if (message.role === 'user') return buildCopyText(message)

  const parts: string[] = []
  let startIndex = messageIndex
  while (startIndex > 0 && isAssistantResponseMessage(messages[startIndex - 1])) {
    startIndex -= 1
  }

  for (let index = startIndex; index <= messageIndex; index += 1) {
    const currentMessage = messages[index]
    if (!isAssistantResponseMessage(currentMessage)) continue

    const text = buildCopyText(currentMessage)
    if (text.length > 0) {
      parts.push(text)
    }
  }

  return parts.join('\n\n')
}

export function hasLiveOverlayDetails(liveOverlay: UiLiveOverlay | null): boolean {
  if (!liveOverlay) return false
  return liveOverlay.activityDetails.length > 0 || liveOverlay.reasoningText.trim().length > 0
}

export function shouldShowScrollToBottomButton(params: {
  activeThreadId: string
  isLoading: boolean
  messageCount: number
  pendingRequestCount: number
  hasLiveOverlay: boolean
  scrollState: ThreadScrollState | null
}): boolean {
  if (!params.activeThreadId || params.isLoading) return false
  if (params.messageCount === 0 && params.pendingRequestCount === 0 && !params.hasLiveOverlay) return false
  return params.scrollState?.isAtBottom === false
}

export function buildConversationScrollMetrics(params: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  bottomThresholdPx: number
}): ConversationScrollMetrics {
  const maxScrollTop = Math.max(params.scrollHeight - params.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0
    ? Math.min(Math.max(params.scrollTop / maxScrollTop, 0), 1)
    : 1
  const distanceFromBottom = params.scrollHeight - (params.scrollTop + params.clientHeight)
  return {
    maxScrollTop,
    scrollRatio,
    isAtBottom: distanceFromBottom <= params.bottomThresholdPx,
  }
}

export function restoredConversationScrollTop(
  savedState: ThreadScrollState,
  maxScrollTop: number,
): number {
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  return Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
}

export function shouldLockConversationToBottom(scrollState: ThreadScrollState | null): boolean {
  return !scrollState || scrollState.isAtBottom === true
}

export function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

export function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => option?.label)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

export function readToolQuestionAnswer(
  answersByKey: Record<string, string>,
  requestId: number,
  questionId: string,
  fallback: string,
): string {
  const saved = answersByKey[toolQuestionKey(requestId, questionId)]
  return typeof saved === 'string' && saved.length > 0 ? saved : fallback
}

export function readToolQuestionOtherAnswer(
  answersByKey: Record<string, string>,
  requestId: number,
  questionId: string,
): string {
  return answersByKey[toolQuestionKey(requestId, questionId)] ?? ''
}

export function buildApprovalDecisionReply(requestId: number, decision: UiApprovalDecision): UiServerRequestReply {
  return {
    id: requestId,
    approvalScope: approvalScopeForDecision(decision),
    result: { decision },
  }
}

export function buildApprovalScopeReply(requestId: number, scope: UiApprovalDecisionScope): UiServerRequestReply {
  return {
    id: requestId,
    approvalScope: scope,
    result: { decision: approvalDecisionForScope(scope) },
  }
}

export function buildToolUserInputReply(params: {
  request: UiServerRequest
  answersByKey: Record<string, string>
  otherAnswersByKey: Record<string, string>
}): UiServerRequestReply {
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of readToolQuestions(params.request)) {
    const selected = readToolQuestionAnswer(
      params.answersByKey,
      params.request.id,
      question.id,
      question.options[0] || '',
    )
    const other = readToolQuestionOtherAnswer(params.otherAnswersByKey, params.request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  return {
    id: params.request.id,
    result: { answers },
  }
}

export function buildToolCallFailureReply(requestId: number): UiServerRequestReply {
  return {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  }
}

export function buildToolCallSuccessReply(requestId: number): UiServerRequestReply {
  return {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  }
}

export function buildEmptyServerRequestReply(requestId: number): UiServerRequestReply {
  return {
    id: requestId,
    result: {},
  }
}

export function buildRejectedServerRequestReply(requestId: number, message: string): UiServerRequestReply {
  return {
    id: requestId,
    error: {
      code: -32000,
      message,
    },
  }
}
