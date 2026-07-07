import { describe, expect, it } from 'vitest'
import {
  canSubmitWorkspacePullRequestDraft,
  isWorkspaceGitActionPending,
  stagedWorkspaceFiles,
  workspaceGitActionKey,
  workspaceGitDraftSummary,
  workingTreeWorkspaceFiles,
  workspacePullRequestSummary,
} from './workspaceGitPanelRules'
import type {
  UiGitDeliveryDraft,
  UiGitStatusSnapshot,
  UiPullRequestDraft,
  UiWorkspaceStatusFile,
} from '../types/codex'

function statusFile(overrides: Partial<UiWorkspaceStatusFile>): UiWorkspaceStatusFile {
  return {
    path: 'src/app.ts',
    status: 'M',
    indexStatus: '',
    worktreeStatus: '',
    ...overrides,
  }
}

function status(files: UiWorkspaceStatusFile[]): UiGitStatusSnapshot {
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
    files,
  }
}

function deliveryDraft(overrides: Partial<UiGitDeliveryDraft> = {}): UiGitDeliveryDraft {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    branch: 'main',
    upstream: 'origin/main',
    generatedAtIso: '2026-07-07T00:00:00.000Z',
    hasStagedChanges: true,
    files: [],
    fileCount: 2,
    insertions: 10,
    deletions: 3,
    stat: '2 files changed',
    commitMessage: 'Update git panel',
    prBody: 'Body',
    riskSummary: [],
    validationPlan: [],
    ...overrides,
  }
}

function pullRequestDraft(overrides: Partial<UiPullRequestDraft> = {}): UiPullRequestDraft {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    branch: 'feature/git-panel',
    baseBranch: 'main',
    remote: 'origin',
    generatedAtIso: '2026-07-07T00:00:00.000Z',
    commitCount: 3,
    commits: [],
    files: [],
    fileCount: 5,
    insertions: 20,
    deletions: 6,
    title: 'Update git panel',
    body: 'Body',
    warnings: [],
    ...overrides,
  }
}

describe('workspace git panel rules', () => {
  it('splits staged and working tree files from status entries', () => {
    const stagedOnly = statusFile({ path: 'staged.ts', indexStatus: 'M', worktreeStatus: '' })
    const workingOnly = statusFile({ path: 'working.ts', indexStatus: '', worktreeStatus: 'M' })
    const untracked = statusFile({ path: 'new.ts', status: '??', indexStatus: '', worktreeStatus: '??' })
    const both = statusFile({ path: 'both.ts', indexStatus: 'M', worktreeStatus: 'M' })

    const snapshot = status([stagedOnly, workingOnly, untracked, both])

    expect(stagedWorkspaceFiles(snapshot).map((file) => file.path)).toEqual(['staged.ts', 'both.ts'])
    expect(workingTreeWorkspaceFiles(snapshot).map((file) => file.path)).toEqual(['working.ts', 'new.ts', 'both.ts'])
    expect(stagedWorkspaceFiles(null)).toEqual([])
    expect(workingTreeWorkspaceFiles(null)).toEqual([])
  })

  it('summarizes commit and pull request drafts', () => {
    expect(workspaceGitDraftSummary(null)).toBe('Generate commit and PR text from staged changes.')
    expect(workspaceGitDraftSummary(deliveryDraft({ hasStagedChanges: false }))).toBe('No staged changes.')
    expect(workspaceGitDraftSummary(deliveryDraft())).toBe('2 files, +10 / -3')
    expect(workspacePullRequestSummary(null)).toBe('Create a PR draft from commits on the current branch.')
    expect(workspacePullRequestSummary(pullRequestDraft())).toBe('feature/git-panel -> main, 3 commits, 5 files')
    expect(workspacePullRequestSummary(pullRequestDraft({ branch: '' }))).toBe('detached -> main, 3 commits, 5 files')
  })

  it('builds action keys and validates pull request draft input', () => {
    expect(workspaceGitActionKey('stage', 'src/app.ts')).toBe('stage:src/app.ts')
    expect(isWorkspaceGitActionPending('stage:src/app.ts', 'stage', 'src/app.ts')).toBe(true)
    expect(isWorkspaceGitActionPending('unstage:src/app.ts', 'stage', 'src/app.ts')).toBe(false)

    expect(canSubmitWorkspacePullRequestDraft({
      cwd: '/workspace/app',
      title: 'Title',
      body: 'Body',
      baseBranch: 'main',
    })).toBe(true)
    expect(canSubmitWorkspacePullRequestDraft({
      cwd: '/workspace/app',
      title: '   ',
      body: 'Body',
      baseBranch: 'main',
    })).toBe(false)
  })
})
