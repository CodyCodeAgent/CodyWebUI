import type {
  UiGitCommitResult,
  UiGitDeliveryDraft,
  UiGitPathActionResult,
  UiGitStatusSnapshot,
  UiPullRequestCreateResult,
  UiPullRequestDraft,
  UiWorkspaceReviewDraft,
  UiWorktreeApplyPatchResult,
  UiWorktreeCreateResult,
  UiWorktreeRemoveResult,
  UiWorktreeSnapshot,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export type CreatePullRequestParams = {
  cwd: string
  title: string
  body: string
  baseBranch: string
  draft: boolean
  dryRun: boolean
}

export async function fetchGitStatus(cwd: string): Promise<UiGitStatusSnapshot> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/git-status', { cwd }), {
    method: 'tooling/git-status',
    networkErrorMessage: 'Git status failed before request was sent',
    httpErrorMessage: 'Git status failed',
    malformedMessage: 'Git status returned malformed response',
  })
  if (typeof result.repoRoot !== 'string' || !Array.isArray(result.files)) {
    throw new CodexApiError('Git status returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-status',
      status,
    })
  }

  return result as UiGitStatusSnapshot
}

export async function fetchGitDeliveryDraft(cwd: string): Promise<UiGitDeliveryDraft> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/git-delivery-draft', { cwd }), {
    method: 'tooling/git-delivery-draft',
    networkErrorMessage: 'Git delivery draft failed before request was sent',
    httpErrorMessage: 'Git delivery draft failed',
    malformedMessage: 'Git delivery draft returned malformed response',
  })
  if (typeof result.commitMessage !== 'string' || typeof result.prBody !== 'string') {
    throw new CodexApiError('Git delivery draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-delivery-draft',
      status,
    })
  }

  return result as UiGitDeliveryDraft
}

export async function fetchWorkspaceReviewDraft(cwd: string): Promise<UiWorkspaceReviewDraft> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/review-draft', { cwd }), {
    method: 'tooling/review-draft',
    networkErrorMessage: 'Workspace review draft failed before request was sent',
    httpErrorMessage: 'Workspace review draft failed',
    malformedMessage: 'Workspace review draft returned malformed response',
  })
  if (
    typeof result.commitMessage !== 'string' ||
    typeof result.prBody !== 'string' ||
    typeof result.hasReviewChanges !== 'boolean' ||
    !Array.isArray(result.riskSummary) ||
    !Array.isArray(result.validationPlan) ||
    !Array.isArray(result.untrackedFiles) ||
    !Array.isArray(result.warnings)
  ) {
    throw new CodexApiError('Workspace review draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/review-draft',
      status,
    })
  }

  return result as UiWorkspaceReviewDraft
}

export async function commitStagedChanges(cwd: string, commitMessage: string): Promise<UiGitCommitResult> {
  const { result, status: responseStatus } = await fetchCodexResultRecord('/codex-api/tooling/git-commit', {
    init: jsonPostInit({ cwd, commitMessage }),
    method: 'tooling/git-commit',
    networkErrorMessage: 'Git commit failed before request was sent',
    httpErrorMessage: 'Git commit failed',
    malformedMessage: 'Git commit returned malformed response',
  })
  const status = asRecord(result?.status)
  if (!status || typeof result.commitHash !== 'string' || typeof result.commitMessage !== 'string') {
    throw new CodexApiError('Git commit returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-commit',
      status: responseStatus,
    })
  }

  return result as UiGitCommitResult
}

export async function fetchPullRequestDraft(cwd: string, baseBranch?: string): Promise<UiPullRequestDraft> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/pull-request-draft', {
    cwd,
    baseBranch: baseBranch?.trim() || undefined,
  }), {
    method: 'tooling/pull-request-draft',
    networkErrorMessage: 'Pull request draft failed before request was sent',
    httpErrorMessage: 'Pull request draft failed',
    malformedMessage: 'Pull request draft returned malformed response',
  })
  if (typeof result.title !== 'string' || typeof result.body !== 'string' || !Array.isArray(result.files)) {
    throw new CodexApiError('Pull request draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/pull-request-draft',
      status,
    })
  }

  return result as UiPullRequestDraft
}

export async function createPullRequest(params: CreatePullRequestParams): Promise<UiPullRequestCreateResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/pull-request', {
    init: jsonPostInit(params),
    method: 'tooling/pull-request',
    networkErrorMessage: 'Pull request create failed before request was sent',
    httpErrorMessage: 'Pull request create failed',
    malformedMessage: 'Pull request create returned malformed response',
  })
  if (typeof result.title !== 'string' || !Array.isArray(result.command) || typeof result.dryRun !== 'boolean') {
    throw new CodexApiError('Pull request create returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/pull-request',
      status,
    })
  }

  return result as UiPullRequestCreateResult
}

export async function fetchWorkspaceWorktrees(cwd: string): Promise<UiWorktreeSnapshot> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/worktrees', { cwd }), {
    method: 'tooling/worktrees',
    networkErrorMessage: 'Worktrees failed before request was sent',
    httpErrorMessage: 'Worktrees failed',
    malformedMessage: 'Worktrees returned malformed response',
  })
  if (typeof result.repoRoot !== 'string' || !Array.isArray(result.worktrees)) {
    throw new CodexApiError('Worktrees returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees',
      status,
    })
  }

  return result as UiWorktreeSnapshot
}

export async function createWorkspaceWorktree(
  cwd: string,
  branchName: string,
  baseRef: string,
): Promise<UiWorktreeCreateResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/worktrees', {
    init: jsonPostInit({ cwd, branchName, baseRef }),
    method: 'tooling/worktrees:create',
    networkErrorMessage: 'Create worktree failed before request was sent',
    httpErrorMessage: 'Create worktree failed',
    malformedMessage: 'Create worktree returned malformed response',
  })
  const snapshot = asRecord(result?.snapshot)
  if (!snapshot || !Array.isArray(snapshot.worktrees)) {
    throw new CodexApiError('Create worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:create',
      status,
    })
  }

  return result as UiWorktreeCreateResult
}

export async function removeWorkspaceWorktree(cwd: string, path: string): Promise<UiWorktreeRemoveResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/worktrees/remove', {
    init: jsonPostInit({ cwd, path }),
    method: 'tooling/worktrees:remove',
    networkErrorMessage: 'Remove worktree failed before request was sent',
    httpErrorMessage: 'Remove worktree failed',
    malformedMessage: 'Remove worktree returned malformed response',
  })
  const snapshot = asRecord(result?.snapshot)
  if (typeof result.removedPath !== 'string' || !snapshot || !Array.isArray(snapshot.worktrees)) {
    throw new CodexApiError('Remove worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:remove',
      status,
    })
  }

  return result as UiWorktreeRemoveResult
}

export async function applyWorkspacePatchToWorktree(cwd: string, path: string): Promise<UiWorktreeApplyPatchResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/worktrees/apply-patch', {
    init: jsonPostInit({ cwd, path }),
    method: 'tooling/worktrees:apply-patch',
    networkErrorMessage: 'Apply patch to worktree failed before request was sent',
    httpErrorMessage: 'Apply patch to worktree failed',
    malformedMessage: 'Apply patch to worktree returned malformed response',
  })
  const snapshot = asRecord(result?.snapshot)
  const targetStatus = asRecord(result?.targetStatus)
  if (!snapshot || !Array.isArray(snapshot.worktrees) || !targetStatus || !Array.isArray(targetStatus.files)) {
    throw new CodexApiError('Apply patch to worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:apply-patch',
      status,
    })
  }

  return result as UiWorktreeApplyPatchResult
}

async function runGitPathAction(
  endpoint: 'git-stage' | 'git-unstage',
  cwd: string,
  paths: string[],
): Promise<UiGitPathActionResult> {
  const method = `tooling/${endpoint}`
  const { result, status: responseStatus } = await fetchCodexResultRecord(`/codex-api/tooling/${endpoint}`, {
    init: jsonPostInit({ cwd, paths }),
    method,
    networkErrorMessage: 'Git action failed before request was sent',
    httpErrorMessage: 'Git action failed',
    malformedMessage: 'Git action returned malformed response',
  })
  const status = asRecord(result?.status)
  if (!status || !Array.isArray(result.paths) || !Array.isArray(status.files)) {
    throw new CodexApiError('Git action returned malformed response', {
      code: 'invalid_response',
      method,
      status: responseStatus,
    })
  }

  return result as UiGitPathActionResult
}

export async function stageGitPaths(cwd: string, paths: string[]): Promise<UiGitPathActionResult> {
  return runGitPathAction('git-stage', cwd, paths)
}

export async function unstageGitPaths(cwd: string, paths: string[]): Promise<UiGitPathActionResult> {
  return runGitPathAction('git-unstage', cwd, paths)
}
