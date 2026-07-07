import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexApiError } from './codexErrors'
import {
  createPullRequest,
  createWorkspaceWorktree,
  fetchGitStatus,
  fetchPullRequestDraft,
  stageGitPaths,
} from './codexWorkspaceGitClient'

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function gitStatus() {
  return {
    cwd: '/repo',
    repoRoot: '/repo',
    branch: 'feature',
    upstream: '',
    generatedAtIso: '2026-07-07T00:00:00.000Z',
    stagedFileCount: 0,
    unstagedFileCount: 1,
    untrackedFileCount: 0,
    conflictedFileCount: 0,
    files: [],
  }
}

describe('codex workspace git client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads and validates git status snapshots', async () => {
    mockFetch(new Response(JSON.stringify({
      result: gitStatus(),
    }), { status: 200 }))

    await expect(fetchGitStatus('/repo')).resolves.toMatchObject({
      repoRoot: '/repo',
      files: [],
    })

    mockFetch(new Response(JSON.stringify({
      result: {
        repoRoot: '/repo',
        files: null,
      },
    }), { status: 200 }))

    await expect(fetchGitStatus('/repo')).rejects.toBeInstanceOf(CodexApiError)
  })

  it('passes trimmed base branches to pull request draft requests', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        cwd: '/repo',
        repoRoot: '/repo',
        branch: 'feature',
        baseBranch: 'main',
        remote: 'origin',
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        commitCount: 1,
        commits: [],
        files: [],
        fileCount: 0,
        insertions: 0,
        deletions: 0,
        title: 'Title',
        body: 'Body',
        warnings: [],
      },
    }), { status: 200 }))

    await expect(fetchPullRequestDraft('/repo', ' main ')).resolves.toMatchObject({
      title: 'Title',
      baseBranch: 'main',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/codex-api/tooling/pull-request-draft?cwd=%2Frepo&baseBranch=main',
      undefined,
    )
  })

  it('creates pull requests through the bridge endpoint', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        cwd: '/repo',
        repoRoot: '/repo',
        branch: 'feature',
        baseBranch: 'main',
        title: 'Title',
        body: 'Body',
        draft: true,
        dryRun: false,
        command: ['gh', 'pr', 'create'],
        url: 'https://example.test/pr/1',
        stdout: '',
        stderr: '',
        createdAtIso: '2026-07-07T00:00:00.000Z',
      },
    }), { status: 200 }))

    await expect(createPullRequest({
      cwd: '/repo',
      title: 'Title',
      body: 'Body',
      baseBranch: 'main',
      draft: true,
      dryRun: false,
    })).resolves.toMatchObject({
      title: 'Title',
      dryRun: false,
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/pull-request', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        title: 'Title',
        body: 'Body',
        baseBranch: 'main',
        draft: true,
        dryRun: false,
      }),
    }))
  })

  it('validates worktree creation snapshots', async () => {
    mockFetch(new Response(JSON.stringify({
      result: {
        worktree: {
          path: '/repo-worktree',
          branch: 'feature-x',
        },
        snapshot: {
          worktrees: [
            { path: '/repo-worktree' },
          ],
        },
      },
    }), { status: 200 }))

    await expect(createWorkspaceWorktree('/repo', 'feature-x', 'HEAD')).resolves.toMatchObject({
      snapshot: {
        worktrees: [
          { path: '/repo-worktree' },
        ],
      },
    })

    mockFetch(new Response(JSON.stringify({
      result: {
        snapshot: {},
      },
    }), { status: 200 }))

    await expect(createWorkspaceWorktree('/repo', 'feature-x', 'HEAD')).rejects.toBeInstanceOf(CodexApiError)
  })

  it('stages selected git paths', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        cwd: '/repo',
        repoRoot: '/repo',
        action: 'stage',
        paths: ['src/app.ts'],
        status: gitStatus(),
      },
    }), { status: 200 }))

    await expect(stageGitPaths('/repo', ['src/app.ts'])).resolves.toMatchObject({
      action: 'stage',
      paths: ['src/app.ts'],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/git-stage', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        paths: ['src/app.ts'],
      }),
    }))
  })
})
