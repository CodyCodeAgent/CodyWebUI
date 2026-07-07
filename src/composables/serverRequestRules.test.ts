import { describe, expect, it } from 'vitest'
import type { UiServerRequest } from '../types/codex'
import {
  buildServerRequestCards,
  formatServerRequestTime,
  isServerApprovalRequestKind,
  isToolCallRequestMethod,
  isToolUserInputRequestMethod,
  serverRequestActionKeyPrefix,
  serverRequestKind,
  TOOL_CALL_REQUEST_METHOD,
  TOOL_USER_INPUT_REQUEST_METHOD,
} from './serverRequestRules'

function serverRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 1,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-07-07T12:00:00.000Z',
    params: { command: 'npm test' },
    ...overrides,
  }
}

describe('server request rules', () => {
  it('classifies codex server request methods', () => {
    expect(serverRequestKind('item/commandExecution/requestApproval')).toBe('command_approval')
    expect(serverRequestKind('item/fileChange/requestApproval')).toBe('file_change_approval')
    expect(serverRequestKind(TOOL_USER_INPUT_REQUEST_METHOD)).toBe('tool_user_input')
    expect(serverRequestKind(TOOL_CALL_REQUEST_METHOD)).toBe('tool_call')
    expect(serverRequestKind('custom/request')).toBe('unknown')
  })

  it('identifies tool request methods', () => {
    expect(isToolUserInputRequestMethod(TOOL_USER_INPUT_REQUEST_METHOD)).toBe(true)
    expect(isToolUserInputRequestMethod(TOOL_CALL_REQUEST_METHOD)).toBe(false)
    expect(isToolCallRequestMethod(TOOL_CALL_REQUEST_METHOD)).toBe(true)
    expect(isToolCallRequestMethod(TOOL_USER_INPUT_REQUEST_METHOD)).toBe(false)
  })

  it('builds shared approval request metadata', () => {
    expect(isServerApprovalRequestKind('command_approval')).toBe(true)
    expect(isServerApprovalRequestKind('file_change_approval')).toBe(true)
    expect(isServerApprovalRequestKind('tool_user_input')).toBe(false)
    expect(serverRequestActionKeyPrefix('command_approval')).toBe('command')
    expect(serverRequestActionKeyPrefix('file_change_approval')).toBe('file')
    expect(serverRequestActionKeyPrefix('tool_call')).toBe('request')
  })

  it('falls back to raw timestamps when request time cannot be parsed', () => {
    expect(formatServerRequestTime('not-a-date')).toBe('not-a-date')
  })

  it('builds reusable request cards with summaries and kind metadata', () => {
    const cards = buildServerRequestCards([
      serverRequest(),
      serverRequest({ id: 2, method: 'custom/request', params: { note: 'custom' } }),
    ])

    expect(cards).toHaveLength(2)
    expect(cards[0].request.id).toBe(1)
    expect(cards[0].summary.title).toBe('Command approval')
    expect(cards[0].kind).toBe('command_approval')
    expect(cards[0].isApprovalRequest).toBe(true)
    expect(cards[1].kind).toBe('unknown')
    expect(cards[1].isApprovalRequest).toBe(false)
  })
})
