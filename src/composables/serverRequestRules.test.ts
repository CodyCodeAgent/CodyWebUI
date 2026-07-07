import { describe, expect, it } from 'vitest'
import {
  isServerApprovalRequestKind,
  isToolCallRequestMethod,
  isToolUserInputRequestMethod,
  serverRequestActionKeyPrefix,
  serverRequestKind,
  TOOL_CALL_REQUEST_METHOD,
  TOOL_USER_INPUT_REQUEST_METHOD,
} from './serverRequestRules'

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
})
