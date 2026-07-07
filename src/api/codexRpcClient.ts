import type {
  RpcMethodCatalog,
  UiAuditTrail,
  UiCodexSessionEventTrail,
  UiNotificationDeliveryReport,
  UiReviewComment,
  UiReviewCommentAnchor,
  UiReviewCommentList,
  UiReviewCommentStatus,
  UiReviewFollowUpResult,
  UiTerminalSession,
  UiTerminalSessionList,
  UiToolingCheckpoint,
  UiToolingCheckpointPatch,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiToolingStageHunkResult,
  UiWorkspaceScriptRun,
  UiWorkspaceSessionSummaryTrail,
  UiWorkflowDashboard,
  UiWorkflowDeliveryDraft,
  UiWorkflowDeliveryStatusResult,
  UiWorkflowImplementationApplyResult,
  UiWorkflowImplementationDiscardResult,
  UiWorkflowReplay,
  UiWorkflowRun,
  UiWorkflowValidationResult,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexJson,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
  readEnvelopeResultRecord,
  readRpcResult,
} from './codexHttpClient'
export {
  fetchDirectoryListing,
  fetchPendingServerRequests,
  respondServerRequest,
  uploadLocalImage,
} from './codexBridgeClient'
export type { UploadedLocalImage } from './codexBridgeClient'
export {
  subscribeProductNotifications,
  subscribeRpcNotifications,
} from './codexRealtimeClient'
export {
  fetchApprovalGrants,
  fetchAuthSessionSnapshot,
  fetchGatewayDiagnostics,
  fetchSecurityAccessSnapshot,
  fetchTrustedDevices,
  reloadMcpServers,
  revokeApprovalGrant,
  revokeCurrentDeviceTrust,
  trustCurrentDevice,
} from './codexGatewayStatusClient'
export {
  applyWorkspacePatchToWorktree,
  commitStagedChanges,
  createPullRequest,
  createWorkspaceWorktree,
  fetchGitDeliveryDraft,
  fetchGitStatus,
  fetchPullRequestDraft,
  fetchWorkspaceReviewDraft,
  fetchWorkspaceWorktrees,
  removeWorkspaceWorktree,
  stageGitPaths,
  unstageGitPaths,
} from './codexWorkspaceGitClient'

type RpcRequestBody = {
  method: string
  params?: unknown
}

export type { ProductNotification, RpcNotification } from './codexRealtimeClient'

export async function rpcCall<T>(method: string, params?: unknown): Promise<T> {
  const body: RpcRequestBody = { method, params: params ?? null }
  const { payload, status } = await fetchCodexJson('/codex-api/rpc', {
    init: jsonPostInit(body),
    method,
    networkErrorMessage: `RPC ${method} failed before request was sent`,
    httpErrorMessage: `RPC ${method} failed`,
  })
  return readRpcResult<T>(payload, status, method, `RPC ${method} returned malformed envelope`)
}

export async function fetchRpcMethodCatalog(): Promise<string[]> {
  const { payload } = await fetchCodexJson('/codex-api/meta/methods', {
    method: 'meta/methods',
    networkErrorMessage: 'Method catalog failed before request was sent',
    httpErrorMessage: 'Method catalog failed',
  })
  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(): Promise<string[]> {
  const { payload } = await fetchCodexJson('/codex-api/meta/notifications', {
    method: 'meta/notifications',
    networkErrorMessage: 'Notification catalog failed before request was sent',
    httpErrorMessage: 'Notification catalog failed',
  })
  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function rollbackWorkspaceFile(cwd: string, filePath: string): Promise<UiToolingRollbackFileResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/rollback-file', {
    init: jsonPostInit({ cwd, filePath }),
    method: 'tooling/rollback-file',
    networkErrorMessage: 'File rollback failed before request was sent',
    httpErrorMessage: 'File rollback failed',
    malformedMessage: 'File rollback returned malformed response',
  })
  const checkpoint = asRecord(result?.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const relativePath = typeof result?.relativePath === 'string' ? result.relativePath : ''

  if (!checkpoint || !id || !relativePath) {
    throw new CodexApiError('File rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-file',
      status,
    })
  }

  return result as UiToolingRollbackFileResult
}

export async function rollbackWorkspaceHunk(
  cwd: string,
  filePath: string,
  hunkIndex: number,
): Promise<UiToolingRollbackHunkResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/rollback-hunk', {
    init: jsonPostInit({ cwd, filePath, hunkIndex }),
    method: 'tooling/rollback-hunk',
    networkErrorMessage: 'Hunk rollback failed before request was sent',
    httpErrorMessage: 'Hunk rollback failed',
    malformedMessage: 'Hunk rollback returned malformed response',
  })
  const checkpoint = asRecord(result?.checkpoint)
  if (!checkpoint || typeof result.relativePath !== 'string' || typeof result.hunkIndex !== 'number') {
    throw new CodexApiError('Hunk rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-hunk',
      status,
    })
  }

  return result as UiToolingRollbackHunkResult
}

export async function rollbackWorkspaceChanges(cwd: string): Promise<UiToolingRollbackWorkspaceResult> {
  const { result, status: responseStatus } = await fetchCodexResultRecord('/codex-api/tooling/rollback-workspace', {
    init: jsonPostInit({ cwd }),
    method: 'tooling/rollback-workspace',
    networkErrorMessage: 'Workspace rollback failed before request was sent',
    httpErrorMessage: 'Workspace rollback failed',
    malformedMessage: 'Workspace rollback returned malformed response',
  })
  const checkpoint = asRecord(result?.checkpoint)
  const status = asRecord(result?.remainingStatus)
  if (!checkpoint || !status || typeof result.rollbackApplied !== 'boolean') {
    throw new CodexApiError('Workspace rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-workspace',
      status: responseStatus,
    })
  }

  return result as UiToolingRollbackWorkspaceResult
}

export async function stageWorkspaceHunk(
  cwd: string,
  filePath: string,
  hunkIndex: number,
): Promise<UiToolingStageHunkResult> {
  const { result, status: responseStatus } = await fetchCodexResultRecord('/codex-api/tooling/stage-hunk', {
    init: jsonPostInit({ cwd, filePath, hunkIndex }),
    method: 'tooling/stage-hunk',
    networkErrorMessage: 'Hunk stage failed before request was sent',
    httpErrorMessage: 'Hunk stage failed',
    malformedMessage: 'Hunk stage returned malformed response',
  })
  const status = asRecord(result?.status)
  if (!status || typeof result.relativePath !== 'string' || typeof result.hunkIndex !== 'number') {
    throw new CodexApiError('Hunk stage returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/stage-hunk',
      status: responseStatus,
    })
  }

  return result as UiToolingStageHunkResult
}

export async function fetchToolingCheckpoints(cwd: string, limit = 10): Promise<UiToolingCheckpoint[]> {
  const { payload } = await fetchCodexJson(queryPath('/codex-api/tooling/checkpoints', {
    cwd,
    limit: Math.max(1, Math.min(limit, 100)),
  }), {
    method: 'tooling/checkpoints',
    networkErrorMessage: 'Checkpoint list failed before request was sent',
    httpErrorMessage: 'Checkpoint list failed',
  })
  const envelope = asRecord(payload)
  const result = envelope?.result
  return Array.isArray(result) ? (result as UiToolingCheckpoint[]) : []
}

export async function fetchToolingCheckpointPatch(
  cwd: string,
  checkpointId: string,
): Promise<UiToolingCheckpointPatch> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/checkpoint-patch', {
    cwd,
    checkpointId,
  }), {
    method: 'tooling/checkpoint-patch',
    networkErrorMessage: 'Checkpoint patch failed before request was sent',
    httpErrorMessage: 'Checkpoint patch failed',
    malformedMessage: 'Checkpoint patch returned malformed response',
  })
  const checkpoint = asRecord(result?.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const patch = typeof result?.patch === 'string' ? result.patch : null

  if (!checkpoint || !id || patch === null) {
    throw new CodexApiError('Checkpoint patch returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/checkpoint-patch',
      status,
    })
  }

  return result as UiToolingCheckpointPatch
}

export async function fetchWorkspaceAuditEvents(cwd: string, limit = 30): Promise<UiAuditTrail> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/audit-events', {
    cwd,
    limit: Math.max(1, Math.min(limit, 200)),
  }), {
    method: 'tooling/audit-events',
    networkErrorMessage: 'Audit trail request failed before it was sent',
    httpErrorMessage: 'Audit trail request failed',
    malformedMessage: 'Audit trail returned malformed response',
  })
  if (!Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Audit trail returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/audit-events',
      status,
    })
  }

  return result as UiAuditTrail
}

export async function fetchWorkspaceReviewComments(cwd: string): Promise<UiReviewCommentList> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/review-comments', { cwd }), {
    method: 'tooling/review-comments',
    networkErrorMessage: 'Review comments request failed before it was sent',
    httpErrorMessage: 'Review comments request failed',
    malformedMessage: 'Review comments returned malformed response',
  })
  if (!Array.isArray(result.comments)) {
    throw new CodexApiError('Review comments returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/review-comments',
      status,
    })
  }

  return result as UiReviewCommentList
}

export async function createWorkspaceReviewComment(
  cwd: string,
  anchor: UiReviewCommentAnchor,
  body: string,
): Promise<UiReviewComment> {
  return postReviewCommentAction<UiReviewComment>('/codex-api/tooling/review-comments', {
    cwd,
    anchor,
    body,
  }, 'tooling/review-comments')
}

export async function updateWorkspaceReviewCommentStatus(
  cwd: string,
  commentId: string,
  status: UiReviewCommentStatus,
): Promise<UiReviewComment> {
  return postReviewCommentAction<UiReviewComment>('/codex-api/tooling/review-comments/status', {
    cwd,
    commentId,
    status,
  }, 'tooling/review-comments/status')
}

export async function createWorkspaceReviewFollowUp(
  cwd: string,
  commentId: string,
): Promise<UiReviewFollowUpResult> {
  return postReviewCommentAction<UiReviewFollowUpResult>('/codex-api/tooling/review-comments/follow-up', {
    cwd,
    commentId,
  }, 'tooling/review-comments/follow-up')
}

async function postReviewCommentAction<T>(
  path: string,
  body: Record<string, unknown>,
  method: string,
): Promise<T> {
  const { result } = await fetchCodexResultRecord(path, {
    init: jsonPostInit(body),
    method,
    networkErrorMessage: 'Review comment action failed before it was sent',
    httpErrorMessage: 'Review comment action failed',
    malformedMessage: 'Review comment action returned malformed response',
  })
  return result as T
}

export async function fetchCodexSessionEvents(
  cwd: string,
  threadId = '',
  limit = 80,
): Promise<UiCodexSessionEventTrail> {
  const normalizedThreadId = threadId.trim()
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/session-events', {
    cwd,
    limit: Math.max(1, Math.min(limit, 300)),
    threadId: normalizedThreadId || undefined,
  }), {
    method: 'tooling/session-events',
    networkErrorMessage: 'Session replay request failed before it was sent',
    httpErrorMessage: 'Session replay request failed',
    malformedMessage: 'Session replay returned malformed response',
  })
  if (!Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Session replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/session-events',
      status,
    })
  }

  return result as UiCodexSessionEventTrail
}

export async function fetchWorkspaceRecentSessions(
  cwd: string,
  limit = 12,
): Promise<UiWorkspaceSessionSummaryTrail> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/recent-sessions', {
    cwd,
    limit: Math.max(1, Math.min(limit, 100)),
  }), {
    method: 'tooling/recent-sessions',
    networkErrorMessage: 'Recent sessions request failed before it was sent',
    httpErrorMessage: 'Recent sessions request failed',
    malformedMessage: 'Recent sessions returned malformed response',
  })
  if (!Array.isArray(result.sessions) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Recent sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/recent-sessions',
      status,
    })
  }

  return result as UiWorkspaceSessionSummaryTrail
}

export async function testWorkspaceNotifications(cwd: string): Promise<UiNotificationDeliveryReport> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/notifications/test', {
    init: jsonPostInit({ cwd }),
    method: 'tooling/notifications:test',
    networkErrorMessage: 'Notification test failed before request was sent',
    httpErrorMessage: 'Notification test failed',
    malformedMessage: 'Notification test returned malformed response',
  })
  if (!Array.isArray(result.results) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Notification test returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/notifications:test',
      status,
    })
  }

  return result as UiNotificationDeliveryReport
}

export async function fetchTerminalSessions(cwd: string): Promise<UiTerminalSessionList> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/terminal-sessions', { cwd }), {
    method: 'tooling/terminal-sessions',
    networkErrorMessage: 'Terminal sessions failed before request was sent',
    httpErrorMessage: 'Terminal sessions failed',
    malformedMessage: 'Terminal sessions returned malformed response',
  })
  if (!Array.isArray(result.sessions)) {
    throw new CodexApiError('Terminal sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions',
      status,
    })
  }

  return result as UiTerminalSessionList
}

export async function fetchWorkspaceWorkflows(cwd: string, limit = 20): Promise<UiWorkflowDashboard> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows', {
    cwd,
    limit: Math.max(1, Math.min(limit, 100)),
  }), {
    method: 'tooling/workflows',
    networkErrorMessage: 'Workflow dashboard failed before request was sent',
    httpErrorMessage: 'Workflow dashboard failed',
    malformedMessage: 'Workflow dashboard returned malformed response',
  })
  if (!Array.isArray(result.templates) || !Array.isArray(result.runs)) {
    throw new CodexApiError('Workflow dashboard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows',
      status,
    })
  }

  return result as UiWorkflowDashboard
}

export async function fetchWorkspaceWorkflowReplay(cwd: string, runId: string): Promise<UiWorkflowReplay> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows/replay', {
    cwd,
    runId,
  }), {
    method: 'tooling/workflows/replay',
    networkErrorMessage: 'Workflow replay failed before request was sent',
    httpErrorMessage: 'Workflow replay failed',
    malformedMessage: 'Workflow replay returned malformed response',
  })
  if (!Array.isArray(result.events) || !Array.isArray(result.agentSnapshots)) {
    throw new CodexApiError('Workflow replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/replay',
      status,
    })
  }

  return result as UiWorkflowReplay
}

export async function fetchWorkspaceWorkflowDeliveryDraft(cwd: string, runId: string): Promise<UiWorkflowDeliveryDraft> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows/delivery-draft', {
    cwd,
    runId,
  }), {
    method: 'tooling/workflows/delivery-draft',
    networkErrorMessage: 'Workflow delivery draft failed before request was sent',
    httpErrorMessage: 'Workflow delivery draft failed',
    malformedMessage: 'Workflow delivery draft returned malformed response',
  })
  if (typeof result.title !== 'string' || typeof result.body !== 'string' || typeof result.commitMessage !== 'string') {
    throw new CodexApiError('Workflow delivery draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/delivery-draft',
      status,
    })
  }

  return result as UiWorkflowDeliveryDraft
}

export async function markWorkspaceWorkflowReadyToMerge(
  cwd: string,
  runId: string,
  note = '',
): Promise<UiWorkflowDeliveryStatusResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/ready-to-merge', {
    init: jsonPostInit({ cwd, runId, note }),
    method: 'tooling/workflows/ready-to-merge',
    networkErrorMessage: 'Workflow ready-to-merge failed before request was sent',
    httpErrorMessage: 'Workflow ready-to-merge failed',
    malformedMessage: 'Workflow ready-to-merge returned malformed response',
  })
  const run = asRecord(result?.run)
  const deliveryState = asRecord(result?.deliveryState)
  if (!run || typeof run.id !== 'string' || !deliveryState) {
    throw new CodexApiError('Workflow ready-to-merge returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/ready-to-merge',
      status,
    })
  }

  return result as UiWorkflowDeliveryStatusResult
}

export async function markWorkspaceWorkflowMerged(params: {
  cwd: string
  runId: string
  commitHash?: string
  pullRequestUrl?: string
  note?: string
}): Promise<UiWorkflowDeliveryStatusResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/merged', {
    init: jsonPostInit(params),
    method: 'tooling/workflows/merged',
    networkErrorMessage: 'Workflow merged failed before request was sent',
    httpErrorMessage: 'Workflow merged failed',
    malformedMessage: 'Workflow merged returned malformed response',
  })
  const run = asRecord(result?.run)
  const deliveryState = asRecord(result?.deliveryState)
  if (!run || typeof run.id !== 'string' || !deliveryState) {
    throw new CodexApiError('Workflow merged returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/merged',
      status,
    })
  }

  return result as UiWorkflowDeliveryStatusResult
}

export async function createWorkspaceWorkflowRun(
  cwd: string,
  templateId: string,
  goal: string,
): Promise<UiWorkflowRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows', {
    init: jsonPostInit({ cwd, templateId, goal }),
    method: 'tooling/workflows:create',
    networkErrorMessage: 'Workflow creation failed before request was sent',
    httpErrorMessage: 'Workflow creation failed',
    malformedMessage: 'Workflow creation returned malformed response',
  })
  if (typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow creation returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows:create',
      status,
    })
  }

  return result as UiWorkflowRun
}

export async function updateWorkspaceWorkflowAgentStatus(
  cwd: string,
  runId: string,
  agentId: string,
  status: UiWorkflowRun['agents'][number]['status'],
  note = '',
): Promise<UiWorkflowRun> {
  const { result, status: responseStatus } = await fetchCodexResultRecord('/codex-api/tooling/workflows/agent-status', {
    init: jsonPostInit({ cwd, runId, agentId, status, note }),
    method: 'tooling/workflows/agent-status',
    networkErrorMessage: 'Workflow status update failed before request was sent',
    httpErrorMessage: 'Workflow status update failed',
    malformedMessage: 'Workflow status update returned malformed response',
  })
  if (typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow status update returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/agent-status',
      status: responseStatus,
    })
  }

  return result as UiWorkflowRun
}

export async function provisionWorkspaceWorkflowAgentWorktree(
  cwd: string,
  runId: string,
  agentId: string,
  baseRef = '',
): Promise<UiWorkflowRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/agent-worktree', {
    init: jsonPostInit({ cwd, runId, agentId, baseRef }),
    method: 'tooling/workflows/agent-worktree',
    networkErrorMessage: 'Workflow worktree provisioning failed before request was sent',
    httpErrorMessage: 'Workflow worktree provisioning failed',
    malformedMessage: 'Workflow worktree provisioning returned malformed response',
  })
  if (typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow worktree provisioning returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/agent-worktree',
      status,
    })
  }

  return result as UiWorkflowRun
}

export async function applyWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
): Promise<UiWorkflowImplementationApplyResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/apply-implementation', {
    init: jsonPostInit({ cwd, runId, agentId }),
    method: 'tooling/workflows/apply-implementation',
    networkErrorMessage: 'Workflow implementation apply failed before request was sent',
    httpErrorMessage: 'Workflow implementation apply failed',
    malformedMessage: 'Workflow implementation apply returned malformed response',
  })
  const run = asRecord(result?.run)
  const appliedImplementation = asRecord(result?.appliedImplementation)
  const targetStatus = asRecord(result?.targetStatus)
  if (
    !run ||
    typeof run.id !== 'string' ||
    !appliedImplementation ||
    typeof appliedImplementation.agentId !== 'string' ||
    !targetStatus ||
    !Array.isArray(targetStatus.files)
  ) {
    throw new CodexApiError('Workflow implementation apply returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/apply-implementation',
      status,
    })
  }

  return result as UiWorkflowImplementationApplyResult
}

export async function discardWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
  reason = '',
): Promise<UiWorkflowImplementationDiscardResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/discard-implementation', {
    init: jsonPostInit({ cwd, runId, agentId, reason }),
    method: 'tooling/workflows/discard-implementation',
    networkErrorMessage: 'Workflow implementation discard failed before request was sent',
    httpErrorMessage: 'Workflow implementation discard failed',
    malformedMessage: 'Workflow implementation discard returned malformed response',
  })
  const run = asRecord(result?.run)
  const discardedImplementation = asRecord(result?.discardedImplementation)
  if (
    !run ||
    typeof run.id !== 'string' ||
    !discardedImplementation ||
    typeof discardedImplementation.agentId !== 'string'
  ) {
    throw new CodexApiError('Workflow implementation discard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/discard-implementation',
      status,
    })
  }

  return result as UiWorkflowImplementationDiscardResult
}

export async function runWorkspaceWorkflowValidation(
  cwd: string,
  runId: string,
  scriptName: string,
): Promise<UiWorkflowValidationResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/validation-run', {
    init: jsonPostInit({ cwd, runId, scriptName }),
    method: 'tooling/workflows/validation-run',
    networkErrorMessage: 'Workflow validation failed before request was sent',
    httpErrorMessage: 'Workflow validation failed',
    malformedMessage: 'Workflow validation returned malformed response',
  })
  const run = asRecord(result?.run)
  const validationRun = asRecord(result?.validationRun)
  const replay = asRecord(result?.replay)
  if (!run || !validationRun || !replay || typeof run.id !== 'string' || typeof validationRun.command !== 'string') {
    throw new CodexApiError('Workflow validation returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/validation-run',
      status,
    })
  }

  return result as UiWorkflowValidationResult
}

export async function startTerminalSession(cwd: string, scriptName: string): Promise<UiTerminalSession> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/terminal-sessions', {
    init: jsonPostInit({ cwd, scriptName }),
    method: 'tooling/terminal-sessions:start',
    networkErrorMessage: 'Terminal session start failed before request was sent',
    httpErrorMessage: 'Terminal session start failed',
    malformedMessage: 'Terminal session start returned malformed response',
  })
  if (typeof result.id !== 'string' || typeof result.output !== 'string') {
    throw new CodexApiError('Terminal session start returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:start',
      status,
    })
  }

  return result as UiTerminalSession
}

export async function stopTerminalSession(cwd: string, sessionId: string): Promise<UiTerminalSession> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/terminal-sessions/stop', {
    init: jsonPostInit({ cwd, sessionId }),
    method: 'tooling/terminal-sessions:stop',
    networkErrorMessage: 'Terminal session stop failed before request was sent',
    httpErrorMessage: 'Terminal session stop failed',
    malformedMessage: 'Terminal session stop returned malformed response',
  })
  if (typeof result.id !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Terminal session stop returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:stop',
      status,
    })
  }

  return result as UiTerminalSession
}

export async function runWorkspaceScript(cwd: string, scriptName: string): Promise<UiWorkspaceScriptRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workspace-script/run', {
    init: jsonPostInit({ cwd, scriptName }),
    method: 'tooling/workspace-script/run',
    networkErrorMessage: 'Workspace script failed before request was sent',
    httpErrorMessage: 'Workspace script failed',
    malformedMessage: 'Workspace script returned malformed response',
  })
  if (typeof result.scriptName !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Workspace script returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-script/run',
      status,
    })
  }

  return result as UiWorkspaceScriptRun
}
