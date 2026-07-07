import type { UiDiffLineKind, UiDiffReviewLine } from './useDiffReview'
import type {
  UiReviewCommentAnchor,
  UiReviewComment,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiWorkspaceReviewDraft,
} from '../types/codex'

export type ReviewRollbackStatus = 'idle' | 'rollingBack' | 'rolledBack' | 'failed'
export type ReviewRollbackState = {
  status: ReviewRollbackStatus
  message: string
}

export type ReviewHunkStageStatus = 'idle' | 'staging' | 'staged' | 'failed'
export type ReviewHunkStageState = {
  status: ReviewHunkStageStatus
  message: string
}

export type ReviewDraftCopyState = 'idle' | 'copying' | 'copied_commit' | 'copied_pr' | 'failed'
export type ReviewPatchCopyState = 'idle' | 'copying' | 'copied' | 'failed'

export type ReviewCheckpointPatchState = {
  status: 'idle' | 'loading' | 'loaded' | 'failed'
  patch: string
  message: string
  isVisible: boolean
}

export type ReviewCommentDraftTarget = UiReviewCommentAnchor & {
  hunkIndex: number
  lineNumber: number | null
}

const DEFAULT_ROLLBACK_STATE: ReviewRollbackState = { status: 'idle', message: '' }
const DEFAULT_HUNK_STAGE_STATE: ReviewHunkStageState = { status: 'idle', message: '' }
const DEFAULT_CHECKPOINT_PATCH_STATE: ReviewCheckpointPatchState = {
  status: 'idle',
  patch: '',
  message: '',
  isVisible: false,
}

export function buildReviewDraftSummary(input: {
  canRollback: boolean
  isLoading: boolean
  reviewDraft: UiWorkspaceReviewDraft | null
}): string {
  if (!input.canRollback) return 'Select a workspace to generate delivery notes.'
  if (input.isLoading) return 'Inspecting tracked and untracked workspace changes.'
  if (!input.reviewDraft) return 'Generate commit, PR, risk, and validation notes from current workspace changes.'
  if (!input.reviewDraft.hasReviewChanges) return 'No workspace changes detected.'
  return `${String(input.reviewDraft.fileCount)} tracked files · +${String(input.reviewDraft.insertions)} / -${String(input.reviewDraft.deletions)} · ${String(input.reviewDraft.untrackedFiles.length)} untracked`
}

export function diffCopyPatchButtonLabel(state: ReviewPatchCopyState): string {
  if (state === 'copied') return 'Copied'
  if (state === 'failed') return 'Failed'
  return 'Patch'
}

export function workspaceRollbackButtonLabel(state: ReviewRollbackState): string {
  if (state.status === 'rollingBack') return 'Rolling back'
  if (state.status === 'rolledBack') return 'Rolled back'
  return 'Rollback all'
}

export function reviewGenerateButtonLabel(isLoading: boolean): string {
  return isLoading ? 'Generating' : 'Generate'
}

export function reviewCheckpointRefreshButtonLabel(isLoading: boolean): string {
  return isLoading ? 'Loading' : 'Refresh'
}

export function reviewCommentSaveButtonLabel(isSaving: boolean): string {
  return isSaving ? 'Saving' : 'Save comment'
}

export function diffReviewFileStatusLabel(input: {
  status: string
  rollbackState: ReviewRollbackState
}): string {
  return input.rollbackState.status === 'rolledBack' ? 'rolled back' : input.status
}

export function reviewRollbackStateForPath(
  states: Record<string, ReviewRollbackState>,
  filePath: string,
): ReviewRollbackState {
  return states[filePath] ?? DEFAULT_ROLLBACK_STATE
}

export function setReviewRollbackStateForPath(
  states: Record<string, ReviewRollbackState>,
  filePath: string,
  state: ReviewRollbackState,
): Record<string, ReviewRollbackState> {
  return { ...states, [filePath]: state }
}

export function rollbackFileButtonLabel(state: ReviewRollbackState): string {
  if (state.status === 'rollingBack') return 'Rolling back'
  if (state.status === 'rolledBack') return 'Rolled back'
  return 'Rollback file'
}

export function diffReviewHunkKey(filePath: string, hunkIndex: number): string {
  return `${filePath}:${String(hunkIndex)}`
}

export function reviewHunkRollbackStateForKey(
  states: Record<string, ReviewRollbackState>,
  filePath: string,
  hunkIndex: number,
): ReviewRollbackState {
  return states[diffReviewHunkKey(filePath, hunkIndex)] ?? DEFAULT_ROLLBACK_STATE
}

export function setReviewHunkRollbackStateForKey(
  states: Record<string, ReviewRollbackState>,
  filePath: string,
  hunkIndex: number,
  state: ReviewRollbackState,
): Record<string, ReviewRollbackState> {
  return { ...states, [diffReviewHunkKey(filePath, hunkIndex)]: state }
}

export function rollbackHunkButtonLabel(state: ReviewRollbackState): string {
  if (state.status === 'rollingBack') return 'Rolling back'
  if (state.status === 'rolledBack') return 'Rolled back'
  return 'Rollback hunk'
}

export function reviewHunkStageStateForKey(
  states: Record<string, ReviewHunkStageState>,
  filePath: string,
  hunkIndex: number,
): ReviewHunkStageState {
  return states[diffReviewHunkKey(filePath, hunkIndex)] ?? DEFAULT_HUNK_STAGE_STATE
}

export function setReviewHunkStageStateForKey(
  states: Record<string, ReviewHunkStageState>,
  filePath: string,
  hunkIndex: number,
  state: ReviewHunkStageState,
): Record<string, ReviewHunkStageState> {
  return { ...states, [diffReviewHunkKey(filePath, hunkIndex)]: state }
}

export function stageHunkButtonLabel(state: ReviewHunkStageState): string {
  if (state.status === 'staging') return 'Accepting'
  if (state.status === 'staged') return 'Accepted'
  return 'Accept hunk'
}

export function reviewHunkStatusMessage(
  stageState: ReviewHunkStageState,
  rollbackState: ReviewRollbackState,
): string {
  return stageState.message || rollbackState.message
}

export function reviewDraftCopyLabel(kind: 'commit' | 'pr', state: ReviewDraftCopyState): string {
  if (state === 'copying') return 'Copying'
  if (kind === 'commit' && state === 'copied_commit') return 'Copied commit'
  if (kind === 'pr' && state === 'copied_pr') return 'Copied PR'
  if (state === 'failed') return 'Copy failed'
  return kind === 'commit' ? 'Copy commit message' : 'Copy PR body'
}

export function commentsForDiffHunk(
  comments: UiReviewComment[],
  filePath: string,
  hunkHeader: string,
): UiReviewComment[] {
  return comments
    .filter((comment) => comment.anchor.filePath === filePath && comment.anchor.hunkHeader === hunkHeader)
    .sort((first, second) => {
      const firstLine = first.anchor.newLineNumber ?? first.anchor.oldLineNumber ?? 0
      const secondLine = second.anchor.newLineNumber ?? second.anchor.oldLineNumber ?? 0
      return firstLine - secondLine || first.createdAtIso.localeCompare(second.createdAtIso)
    })
}

export function formatReviewCommentAnchor(comment: UiReviewComment): string {
  const lineNumber = comment.anchor.newLineNumber ?? comment.anchor.oldLineNumber
  return `${comment.anchor.filePath}${lineNumber ? `:${String(lineNumber)}` : ''}`
}

export function buildReviewCommentDraftTarget(params: {
  filePath: string
  hunkHeader: string
  hunkIndex: number
  line: UiDiffReviewLine
}): ReviewCommentDraftTarget {
  const lineNumber = params.line.newLineNumber ?? params.line.oldLineNumber
  return {
    filePath: params.filePath,
    hunkHeader: params.hunkHeader,
    hunkIndex: params.hunkIndex,
    lineKind: params.line.kind,
    oldLineNumber: params.line.oldLineNumber,
    newLineNumber: params.line.newLineNumber,
    lineContent: params.line.content,
    lineNumber,
  }
}

export function reviewCommentDraftTargetLabel(target: Pick<ReviewCommentDraftTarget, 'filePath' | 'lineNumber'>): string {
  return `${target.filePath}${target.lineNumber ? `:${String(target.lineNumber)}` : ''}`
}

export function reviewCommentFollowUpButtonLabel(comment: UiReviewComment): string {
  return comment.followUpRunId ? `Follow-up ${comment.followUpRunId}` : 'Create follow-up'
}

export function reviewCheckpointPatchStateForId(
  states: Record<string, ReviewCheckpointPatchState>,
  checkpointId: string,
): ReviewCheckpointPatchState {
  return states[checkpointId] ?? DEFAULT_CHECKPOINT_PATCH_STATE
}

export function setReviewCheckpointPatchStateForId(
  states: Record<string, ReviewCheckpointPatchState>,
  checkpointId: string,
  state: ReviewCheckpointPatchState,
): Record<string, ReviewCheckpointPatchState> {
  return { ...states, [checkpointId]: state }
}

export function toggleLoadedCheckpointPatchVisibility(state: ReviewCheckpointPatchState): ReviewCheckpointPatchState {
  return {
    ...state,
    isVisible: !state.isVisible,
  }
}

export function loadingCheckpointPatchState(current: ReviewCheckpointPatchState): ReviewCheckpointPatchState {
  return {
    status: 'loading',
    patch: current.patch,
    message: '',
    isVisible: false,
  }
}

export function loadedCheckpointPatchState(patch: string): ReviewCheckpointPatchState {
  return {
    status: 'loaded',
    patch,
    message: '',
    isVisible: true,
  }
}

export function failedCheckpointPatchState(message: string): ReviewCheckpointPatchState {
  return {
    status: 'failed',
    patch: '',
    message,
    isVisible: false,
  }
}

export function checkpointPatchButtonLabel(state: ReviewCheckpointPatchState): string {
  if (state.status === 'loading') return 'Loading'
  if (state.status === 'failed') return 'Retry patch'
  if (state.isVisible) return 'Hide patch'
  return 'Patch'
}

export function fileRollbackSuccessMessage(result: UiToolingRollbackFileResult): string {
  const checkpointId = result.checkpoint.id
  if (!result.rollbackApplied) return `Checkpoint ${checkpointId} saved. No local changes were found for this file.`
  return `Checkpoint ${checkpointId} saved. ${result.remainingStatus ? 'File still has git status.' : 'File is clean.'}`
}

export function hunkRollbackSuccessMessage(result: UiToolingRollbackHunkResult): string {
  return `Checkpoint ${result.checkpoint.id} saved. ${result.remainingStatus ? 'File still has git status.' : 'File is clean.'}`
}

export function workspaceRollbackSuccessMessage(result: UiToolingRollbackWorkspaceResult): string {
  if (!result.rollbackApplied) return `Checkpoint ${result.checkpoint.id} saved. No workspace changes were present.`

  const dirtyFileCount = result.remainingStatus.files.length
  const trackedLabel = result.restoredFileCount === 1 ? 'tracked change' : 'tracked changes'
  const untrackedLabel = result.removedUntrackedCount === 1 ? 'untracked path' : 'untracked paths'
  const dirtyLabel = dirtyFileCount === 1 ? 'file' : 'files'
  const dirtyVerb = dirtyFileCount === 1 ? 'needs' : 'need'
  return `Checkpoint ${result.checkpoint.id} saved. Restored ${String(result.restoredFileCount)} ${trackedLabel} and removed ${String(result.removedUntrackedCount)} ${untrackedLabel}. ${dirtyFileCount === 0 ? 'Workspace is clean.' : `${String(dirtyFileCount)} ${dirtyLabel} still ${dirtyVerb} attention.`}`
}

export function formatDiffLineNumber(value: number | null): string {
  return typeof value === 'number' ? String(value) : ''
}

export function formatCheckpointTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function formatCheckpointPaths(paths: string[]): string {
  if (paths.length === 0) return 'workspace'
  if (paths.length <= 2) return paths.join(', ')
  return `${paths.slice(0, 2).join(', ')} +${String(paths.length - 2)}`
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${String(value)} B`
  const kib = value / 1024
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`
  const mib = kib / 1024
  return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`
}

export function diffLinePrefix(kind: UiDiffLineKind): string {
  if (kind === 'add') return '+'
  if (kind === 'remove') return '-'
  if (kind === 'meta') return '\\'
  return ' '
}
