import type {
  UiGitDeliveryDraft,
  UiGitStatusSnapshot,
  UiPullRequestDraft,
  UiWorkspaceStatusFile,
} from '../types/codex'

export type WorkspaceGitPathAction = 'stage' | 'unstage'

export function stagedWorkspaceFiles(status: UiGitStatusSnapshot | null): UiWorkspaceStatusFile[] {
  return status?.files.filter((file) => file.status !== '??' && file.indexStatus.length > 0) ?? []
}

export function workingTreeWorkspaceFiles(status: UiGitStatusSnapshot | null): UiWorkspaceStatusFile[] {
  return status?.files.filter((file) => file.status === '??' || file.worktreeStatus.length > 0) ?? []
}

export function workspaceGitDraftSummary(draft: UiGitDeliveryDraft | null): string {
  if (!draft) return 'Generate commit and PR text from staged changes.'
  if (!draft.hasStagedChanges) return 'No staged changes.'
  return `${String(draft.fileCount)} files, +${String(draft.insertions)} / -${String(draft.deletions)}`
}

export function workspacePullRequestSummary(draft: UiPullRequestDraft | null): string {
  if (!draft) return 'Create a PR draft from commits on the current branch.'
  return `${draft.branch || 'detached'} -> ${draft.baseBranch}, ${String(draft.commitCount)} commits, ${String(draft.fileCount)} files`
}

export function workspaceGitActionKey(action: WorkspaceGitPathAction, path: string): string {
  return `${action}:${path}`
}

export function isWorkspaceGitActionPending(
  pendingActionKey: string,
  action: WorkspaceGitPathAction,
  path: string,
): boolean {
  return pendingActionKey === workspaceGitActionKey(action, path)
}

export function canSubmitWorkspacePullRequestDraft(input: {
  cwd: string
  title: string
  body: string
  baseBranch: string
}): boolean {
  return Boolean(input.cwd.trim() && input.title.trim() && input.body.trim() && input.baseBranch.trim())
}
