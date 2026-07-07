export const COMMAND_APPROVAL_REQUEST_METHOD = 'item/commandExecution/requestApproval'
export const FILE_CHANGE_APPROVAL_REQUEST_METHOD = 'item/fileChange/requestApproval'
export const TOOL_USER_INPUT_REQUEST_METHOD = 'item/tool/requestUserInput'
export const TOOL_CALL_REQUEST_METHOD = 'item/tool/call'

export function isCommandApprovalRequestMethod(method: string): boolean {
  return method === COMMAND_APPROVAL_REQUEST_METHOD
}

export function isFileChangeApprovalRequestMethod(method: string): boolean {
  return method === FILE_CHANGE_APPROVAL_REQUEST_METHOD
}

export function isApprovalRequestMethod(method: string): boolean {
  return isCommandApprovalRequestMethod(method) || isFileChangeApprovalRequestMethod(method)
}

export function isToolUserInputRequestMethod(method: string): boolean {
  return method === TOOL_USER_INPUT_REQUEST_METHOD
}

export function isToolCallRequestMethod(method: string): boolean {
  return method === TOOL_CALL_REQUEST_METHOD
}
