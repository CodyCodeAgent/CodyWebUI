import { describe, expect, it } from 'vitest'
import {
  COMMAND_APPROVAL_REQUEST_METHOD,
  FILE_CHANGE_APPROVAL_REQUEST_METHOD,
  TOOL_CALL_REQUEST_METHOD,
  TOOL_USER_INPUT_REQUEST_METHOD,
  isApprovalRequestMethod,
  isCommandApprovalRequestMethod,
  isFileChangeApprovalRequestMethod,
  isToolCallRequestMethod,
  isToolUserInputRequestMethod,
} from './codexServerRequestMethods'

describe('codex server request methods', () => {
  it('identifies approval and tool request methods', () => {
    expect(isCommandApprovalRequestMethod(COMMAND_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isFileChangeApprovalRequestMethod(FILE_CHANGE_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod(COMMAND_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod(FILE_CHANGE_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod(TOOL_CALL_REQUEST_METHOD)).toBe(false)
    expect(isToolUserInputRequestMethod(TOOL_USER_INPUT_REQUEST_METHOD)).toBe(true)
    expect(isToolCallRequestMethod(TOOL_CALL_REQUEST_METHOD)).toBe(true)
  })
})
