import { describe, expect, it } from 'vitest'
import {
  buildReviewDraftSummary,
  checkpointPatchButtonLabel,
  commentsForDiffHunk,
  diffCopyPatchButtonLabel,
  diffLinePrefix,
  diffReviewHunkKey,
  formatBytes,
  formatCheckpointPaths,
  formatDiffLineNumber,
  formatReviewCommentAnchor,
  reviewCheckpointPatchStateForId,
  reviewDraftCopyLabel,
  reviewHunkRollbackStateForKey,
  reviewHunkStageStateForKey,
  reviewHunkStatusMessage,
  reviewRollbackStateForPath,
  rollbackFileButtonLabel,
  rollbackHunkButtonLabel,
  stageHunkButtonLabel,
  workspaceRollbackButtonLabel,
} from './threadDiffReviewPanelRules'
import type { UiReviewComment, UiWorkspaceReviewDraft } from '../types/codex'

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

  it('sorts hunk comments and formats anchors', () => {
    const comments = [
      comment({ id: 'late', createdAtIso: '2026-07-07T00:00:02.000Z', anchor: { ...comment().anchor, newLineNumber: 8 } }),
      comment({ id: 'early', createdAtIso: '2026-07-07T00:00:01.000Z', anchor: { ...comment().anchor, newLineNumber: 4 } }),
      comment({ id: 'other', anchor: { ...comment().anchor, filePath: 'src/other.ts' } }),
    ]

    expect(commentsForDiffHunk(comments, 'src/app.ts', '@@ -1 +1 @@').map((item) => item.id))
      .toEqual(['early', 'late'])
    expect(formatReviewCommentAnchor(comments[0])).toBe('src/app.ts:8')
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
