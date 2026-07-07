import {
  buildApprovalRiskSummary,
  isCommandApprovalRequestMethod,
  isFileChangeApprovalRequestMethod,
  isApprovalRequestMethod,
  type UiApprovalRiskSummary,
} from './useApprovalRisk'
import type { UiServerRequest } from '../types/codex'

export const TOOL_USER_INPUT_REQUEST_METHOD = 'item/tool/requestUserInput'
export const TOOL_CALL_REQUEST_METHOD = 'item/tool/call'

export type UiServerRequestKind =
  | 'command_approval'
  | 'file_change_approval'
  | 'tool_user_input'
  | 'tool_call'
  | 'unknown'

export type UiServerRequestCard = {
  request: UiServerRequest
  summary: UiApprovalRiskSummary
  kind: UiServerRequestKind
  isApprovalRequest: boolean
}

export function isToolUserInputRequestMethod(method: string): boolean {
  return method === TOOL_USER_INPUT_REQUEST_METHOD
}

export function isToolCallRequestMethod(method: string): boolean {
  return method === TOOL_CALL_REQUEST_METHOD
}

export function serverRequestKind(method: string): UiServerRequestKind {
  if (isCommandApprovalRequestMethod(method)) return 'command_approval'
  if (isFileChangeApprovalRequestMethod(method)) return 'file_change_approval'
  if (isToolUserInputRequestMethod(method)) return 'tool_user_input'
  if (isToolCallRequestMethod(method)) return 'tool_call'
  return 'unknown'
}

export function isServerApprovalRequestKind(kind: UiServerRequestKind): boolean {
  return kind === 'command_approval' || kind === 'file_change_approval'
}

export function serverRequestActionKeyPrefix(kind: UiServerRequestKind): string {
  if (kind === 'command_approval') return 'command'
  if (kind === 'file_change_approval') return 'file'
  return 'request'
}

export function formatServerRequestTime(value: string, format: 'short' | 'long' = 'short'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return format === 'long' ? date.toLocaleString() : date.toLocaleTimeString()
}

export function buildServerRequestCards(requests: UiServerRequest[]): UiServerRequestCard[] {
  return requests.map((request) => ({
    request,
    summary: buildApprovalRiskSummary(request),
    kind: serverRequestKind(request.method),
    isApprovalRequest: isApprovalRequestMethod(request.method),
  }))
}
