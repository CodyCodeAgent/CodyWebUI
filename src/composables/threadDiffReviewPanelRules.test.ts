import { describe, expect, it } from 'vitest'
import {
  buildReviewDraftSummary,
  buildReviewCommentDraftTarget,
  checkpointPatchButtonLabel,
  commentsForDiffHunk,
  diffCopyPatchButtonLabel,
  diffLinePrefix,
  diffReviewHunkKey,
  failedCheckpointPatchState,
  fileRollbackSuccessMessage,
  formatBytes,
  formatCheckpointPaths,
  formatDiffLineNumber,
  formatReviewCommentAnchor,
  hunkRollbackSuccessMessage,
  loadedCheckpointPatchState,
  loadingCheckpointPatchState,
  reviewCheckpointPatchStateForId,
  reviewCommentDraftTargetLabel,
  reviewCommentFollowUpButtonLabel,
  reviewDraftCopyLabel,
  reviewHunkRollbackStateForKey,
  reviewHunkStageStateForKey,
  reviewHunkStatusMessage,
  reviewRollbackStateForPath,
  rollbackFileButtonLabel,
  rollbackHunkButtonLabel,
  setReviewCheckpointPatchStateForId,
  setReviewHunkRollbackStateForKey,
  setReviewHunkStageStateForKey,
  setReviewRollbackStateForPath,
  stageHunkButtonLabel,
  toggleLoadedCheckpointPatchVisibility,
  workspaceRollbackSuccessMessage,
  workspaceRollbackButtonLabel,
} from './threadDiffReviewPanelRules'
import type {
  UiGitStatusSnapshot,
  UiReviewComment,
  UiToolingCheckpoint,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiWorkspaceReviewDraft,
} from '../types/codex'

function reviewDraft(overrides: Partial<UiWorkspaceReviewDraft> = {}): UiWorkspaceReviewDraft {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    branch: 'main',
    upstream: 'origin/main',
    generatedAtIso: '2026-07-07T00:00:00.000Z',
    hasStagedChanges: false,
    files: [],
    fileCount: 3,
    insertions: 12,
    deletions: 4,
    stat: '3 files changed',
    commitMessage: 'Update review UI',
    prBody: 'Body',
    riskSummary: [],
    validationPlan: [],
    source: 'workspace_diff',
    hasReviewChanges: true,
    untrackedFiles: ['new.ts'],
    warnings: [],
    ...overrides,
  }
}

function comment(overrides: Partial<UiReviewComment> = {}): UiReviewComment {
  return {
    id: 'comment-1',
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    createdAtIso: '2026-07-07T00:00:00.000Z',
    updatedAtIso: '2026-07-07T00:00:00.000Z',
    author: 'local-user',
    status: 'open',
    body: 'Review this',
    anchor: {
      filePath: 'src/app.ts',
      hunkHeader: '@@ -1 +1 @@',
      lineKind: 'add',
      oldLineNumber: null,
      newLineNumber: 2,
      lineContent: 'next',
    },
    followUpRunId: null,
    ...overrides,
  }
}

function checkpoint(overrides: Partial<UiToolingCheckpoint> = {}): UiToolingCheckpoint {
  return {
    id: 'cp-1',
    label: 'Before rollback',
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    createdAtIso: '2026-07-07T00:00:00.000Z',
    paths: ['src/app.ts'],
    patchPath: '/workspace/app/.codex/checkpoints/cp-1.patch',
    patchBytes: 1234,
    hasPatch: true,
    ...overrides,
  }
}

function gitStatus(overrides: Partial<UiGitStatusSnapshot> = {}): UiGitStatusSnapshot {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    branch: 'main',
    upstream: 'origin/main',
    generatedAtIso: '2026-07-07T00:00:00.000Z',
    stagedFileCount: 0,
    unstagedFileCount: 0,
    untrackedFileCount: 0,
    conflictedFileCount: 0,
    files: [],
    ...overrides,
  }
}

function rollbackFileResult(overrides: Partial<UiToolingRollbackFileResult> = {}): UiToolingRollbackFileResult {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    filePath: '/workspace/app/src/app.ts',
    relativePath: 'src/app.ts',
    checkpoint: checkpoint(),
    rollbackApplied: true,
    remainingStatus: '',
    ...overrides,
  }
}

function rollbackHunkResult(overrides: Partial<UiToolingRollbackHunkResult> = {}): UiToolingRollbackHunkResult {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    filePath: '/workspace/app/src/app.ts',
    relativePath: 'src/app.ts',
    hunkIndex: 0,
    hunkHeader: '@@ -1 +1 @@',
    checkpoint: checkpoint(),
    rollbackApplied: true,
    remainingStatus: '',
    ...overrides,
  }
}

function rollbackWorkspaceResult(
  overrides: Partial<UiToolingRollbackWorkspaceResult> = {},
): UiToolingRollbackWorkspaceResult {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    checkpoint: checkpoint(),
    rollbackApplied: true,
    restoredFileCount: 2,
    removedUntrackedCount: 1,
    remainingStatus: gitStatus(),
    ...overrides,
  }
}

describe('thread diff review panel rules', () => {
  it('summarizes review draft readiness and changed files', () => {
    expect(buildReviewDraftSummary({
      canRollback: false,
      isLoading: false,
      reviewDraft: null,
    })).toBe('Select a workspace to generate delivery notes.')

    expect(buildReviewDraftSummary({
      canRollback: true,
      isLoading: true,
      reviewDraft: null,
    })).toBe('Inspecting tracked and untracked workspace changes.')

    expect(buildReviewDraftSummary({
      canRollback: true,
      isLoading: false,
      reviewDraft: reviewDraft(),
    })).toBe('3 tracked files · +12 / -4 · 1 untracked')

    expect(buildReviewDraftSummary({
      canRollback: true,
      isLoading: false,
      reviewDraft: reviewDraft({ hasReviewChanges: false }),
    })).toBe('No workspace changes detected.')
  })

  it('formats action labels from state', () => {
    expect(diffCopyPatchButtonLabel('copied')).toBe('Copied')
    expect(diffCopyPatchButtonLabel('failed')).toBe('Failed')
    expect(workspaceRollbackButtonLabel({ status: 'rollingBack', message: '' })).toBe('Rolling back')
    expect(rollbackFileButtonLabel({ status: 'rolledBack', message: '' })).toBe('Rolled back')
    expect(rollbackHunkButtonLabel({ status: 'idle', message: '' })).toBe('Rollback hunk')
    expect(stageHunkButtonLabel({ status: 'staging', message: '' })).toBe('Accepting')
    expect(reviewDraftCopyLabel('commit', 'copied_commit')).toBe('Copied commit')
    expect(reviewDraftCopyLabel('pr', 'copied_pr')).toBe('Copied PR')
    expect(checkpointPatchButtonLabel({
      status: 'failed',
      patch: '',
      message: 'not found',
      isVisible: false,
    })).toBe('Retry patch')
  })

  it('reads per-file and per-hunk state with stable defaults', () => {
    const rollbackStates = {
      [diffReviewHunkKey('src/app.ts', 1)]: { status: 'failed' as const, message: 'rollback failed' },
      'src/file.ts': { status: 'rollingBack' as const, message: 'working' },
    }
    const stageStates = {
      [diffReviewHunkKey('src/app.ts', 1)]: { status: 'staged' as const, message: 'accepted' },
    }

    expect(reviewRollbackStateForPath(rollbackStates, 'src/file.ts').status).toBe('rollingBack')
    expect(reviewRollbackStateForPath(rollbackStates, 'missing.ts')).toEqual({ status: 'idle', message: '' })
    expect(reviewHunkRollbackStateForKey(rollbackStates, 'src/app.ts', 1).message).toBe('rollback failed')
    expect(reviewHunkStageStateForKey(stageStates, 'src/app.ts', 1).status).toBe('staged')
    expect(reviewHunkStatusMessage(
      { status: 'staged', message: 'accepted' },
      { status: 'failed', message: 'rollback failed' },
    )).toBe('accepted')
    expect(reviewCheckpointPatchStateForId({}, 'checkpoint-1')).toEqual({
      status: 'idle',
      patch: '',
      message: '',
      isVisible: false,
    })
  })

  it('updates rollback and checkpoint state maps immutably', () => {
    expect(setReviewRollbackStateForPath({}, 'src/app.ts', {
      status: 'rollingBack',
      message: 'working',
    })).toEqual({
      'src/app.ts': { status: 'rollingBack', message: 'working' },
    })

    expect(setReviewHunkRollbackStateForKey({}, 'src/app.ts', 2, {
      status: 'failed',
      message: 'nope',
    })).toEqual({
      [diffReviewHunkKey('src/app.ts', 2)]: { status: 'failed', message: 'nope' },
    })

    expect(setReviewHunkStageStateForKey({}, 'src/app.ts', 1, {
      status: 'staged',
      message: 'accepted',
    })).toEqual({
      [diffReviewHunkKey('src/app.ts', 1)]: { status: 'staged', message: 'accepted' },
    })

    const loaded = loadedCheckpointPatchState('patch')
    expect(setReviewCheckpointPatchStateForId({}, 'cp-1', loaded)).toEqual({ 'cp-1': loaded })
    expect(toggleLoadedCheckpointPatchVisibility(loaded)).toEqual({
      status: 'loaded',
      patch: 'patch',
      message: '',
      isVisible: false,
    })
    expect(loadingCheckpointPatchState({ ...loaded, isVisible: false })).toEqual({
      status: 'loading',
      patch: 'patch',
      message: '',
      isVisible: false,
    })
    expect(failedCheckpointPatchState('missing')).toEqual({
      status: 'failed',
      patch: '',
      message: 'missing',
      isVisible: false,
    })
  })

  it('builds rollback completion messages', () => {
    expect(fileRollbackSuccessMessage(rollbackFileResult()))
      .toBe('Checkpoint cp-1 saved. File is clean.')
    expect(fileRollbackSuccessMessage(rollbackFileResult({
      rollbackApplied: false,
    }))).toBe('Checkpoint cp-1 saved. No local changes were found for this file.')
    expect(fileRollbackSuccessMessage(rollbackFileResult({
      remainingStatus: 'M src/app.ts',
    }))).toBe('Checkpoint cp-1 saved. File still has git status.')

    expect(hunkRollbackSuccessMessage(rollbackHunkResult()))
      .toBe('Checkpoint cp-1 saved. File is clean.')

    expect(workspaceRollbackSuccessMessage(rollbackWorkspaceResult()))
      .toBe('Checkpoint cp-1 saved. Restored 2 tracked changes and removed 1 untracked path. Workspace is clean.')
    expect(workspaceRollbackSuccessMessage(rollbackWorkspaceResult({
      rollbackApplied: false,
    }))).toBe('Checkpoint cp-1 saved. No workspace changes were present.')
    expect(workspaceRollbackSuccessMessage(rollbackWorkspaceResult({
      restoredFileCount: 1,
      removedUntrackedCount: 2,
      remainingStatus: gitStatus({
        files: [{
          path: 'src/app.ts',
          status: 'modified',
          indexStatus: ' ',
          worktreeStatus: 'M',
        }],
      }),
    }))).toBe('Checkpoint cp-1 saved. Restored 1 tracked change and removed 2 untracked paths. 1 file still needs attention.')
  })

  it('sorts hunk comments and formats anchors', () => {
    const comments = [
      comment({ id: 'late', createdAtIso: '2026-07-07T00:00:02.000Z', anchor: { ...comment().anchor, newLineNumber: 8 } }),
      comment({ id: 'early', createdAtIso: '2026-07-07T00:00:01.000Z', anchor: { ...comment().anchor, newLineNumber: 4 } }),
      comment({ id: 'other', anchor: { ...comment().anchor, filePath: 'src/other.ts' } }),
    ]

    expect(commentsForDiffHunk(comments, 'src/app.ts', '@@ -1 +1 @@').map((item) => item.id))
      .toEqual(['early', 'late'])
    expect(formatReviewCommentAnchor(comments[0])).toBe('src/app.ts:8')
    expect(reviewCommentFollowUpButtonLabel(comments[0])).toBe('Create follow-up')
    expect(reviewCommentFollowUpButtonLabel(comment({ followUpRunId: 'run-1' }))).toBe('Follow-up run-1')
  })

  it('builds draft comment targets from diff lines', () => {
    const target = buildReviewCommentDraftTarget({
      filePath: 'src/app.ts',
      hunkHeader: '@@ -1 +1 @@',
      hunkIndex: 2,
      line: {
        kind: 'add',
        oldLineNumber: null,
        newLineNumber: 12,
        content: 'const value = 1',
      },
    })

    expect(target).toEqual({
      filePath: 'src/app.ts',
      hunkHeader: '@@ -1 +1 @@',
      hunkIndex: 2,
      lineKind: 'add',
      oldLineNumber: null,
      newLineNumber: 12,
      lineContent: 'const value = 1',
      lineNumber: 12,
    })
    expect(reviewCommentDraftTargetLabel(target)).toBe('src/app.ts:12')
    expect(reviewCommentDraftTargetLabel({ ...target, lineNumber: null })).toBe('src/app.ts')
  })

  it('formats diff display values', () => {
    expect(formatDiffLineNumber(null)).toBe('')
    expect(formatDiffLineNumber(42)).toBe('42')
    expect(formatCheckpointPaths([])).toBe('workspace')
    expect(formatCheckpointPaths(['a.ts', 'b.ts', 'c.ts'])).toBe('a.ts, b.ts +1')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MiB')
    expect(diffLinePrefix('add')).toBe('+')
    expect(diffLinePrefix('remove')).toBe('-')
    expect(diffLinePrefix('meta')).toBe('\\')
    expect(diffLinePrefix('context')).toBe(' ')
  })
})
