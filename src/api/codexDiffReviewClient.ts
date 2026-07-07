import type {
  UiReviewComment,
  UiReviewCommentAnchor,
  UiReviewCommentList,
  UiReviewCommentStatus,
  UiReviewFollowUpResult,
  UiToolingCheckpoint,
  UiToolingCheckpointPatch,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiToolingStageHunkResult,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexJson,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export async function rollbackWorkspaceFile(cwd: string, filePath: string): Promise<UiToolingRollbackFileResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/rollback-file', {
    init: jsonPostInit({ cwd, filePath }),
    method: 'tooling/rollback-file',
    networkErrorMessage: 'File rollback failed before request was sent',
    httpErrorMessage: 'File rollback failed',
    malformedMessage: 'File rollback returned malformed response',
  })
  const checkpoint = asRecord(result.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const relativePath = typeof result.relativePath === 'string' ? result.relativePath : ''

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
  const checkpoint = asRecord(result.checkpoint)
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
  const checkpoint = asRecord(result.checkpoint)
  const status = asRecord(result.remainingStatus)
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
  const status = asRecord(result.status)
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
  const checkpoint = asRecord(result.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const patch = typeof result.patch === 'string' ? result.patch : null

  if (!checkpoint || !id || patch === null) {
    throw new CodexApiError('Checkpoint patch returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/checkpoint-patch',
      status,
    })
  }

  return result as UiToolingCheckpointPatch
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
