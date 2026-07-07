import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceReviewComment,
  createWorkspaceReviewFollowUp,
  fetchToolingCheckpointPatch,
  fetchToolingCheckpoints,
  fetchWorkspaceReviewComments,
  rollbackWorkspaceChanges,
  rollbackWorkspaceFile,
  rollbackWorkspaceHunk,
  stageWorkspaceHunk,
  updateWorkspaceReviewCommentStatus,
} from './codexDiffReviewClient'

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function checkpoint() {
  return {
    id: 'checkpoint-1',
    label: 'Before rollback',
  }
}

describe('codex diff review client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rolls back files, hunks, and workspaces through tooling endpoints', async () => {
    const fileFetch = mockFetch(new Response(JSON.stringify({
      result: {
        checkpoint: checkpoint(),
        relativePath: 'src/app.ts',
      },
    }), { status: 200 }))

    await expect(rollbackWorkspaceFile('/repo', 'src/app.ts')).resolves.toMatchObject({
      relativePath: 'src/app.ts',
      checkpoint: { id: 'checkpoint-1' },
    })
    expect(fileFetch).toHaveBeenCalledWith('/codex-api/tooling/rollback-file', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', filePath: 'src/app.ts' }),
    }))

    mockFetch(new Response(JSON.stringify({
      result: {
        checkpoint: checkpoint(),
        relativePath: 'src/app.ts',
        hunkIndex: 2,
      },
    }), { status: 200 }))

    await expect(rollbackWorkspaceHunk('/repo', 'src/app.ts', 2)).resolves.toMatchObject({
      relativePath: 'src/app.ts',
      hunkIndex: 2,
    })

    mockFetch(new Response(JSON.stringify({
      result: {
        checkpoint: checkpoint(),
        remainingStatus: { files: [] },
        rollbackApplied: true,
      },
    }), { status: 200 }))

    await expect(rollbackWorkspaceChanges('/repo')).resolves.toMatchObject({
      rollbackApplied: true,
    })
  })

  it('stages selected hunks and rejects malformed snapshots', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        status: { files: [] },
        relativePath: 'src/app.ts',
        hunkIndex: 1,
      },
    }), { status: 200 }))

    await expect(stageWorkspaceHunk('/repo', 'src/app.ts', 1)).resolves.toMatchObject({
      relativePath: 'src/app.ts',
      hunkIndex: 1,
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/stage-hunk', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', filePath: 'src/app.ts', hunkIndex: 1 }),
    }))

    mockFetch(new Response(JSON.stringify({
      result: {
        relativePath: 'src/app.ts',
        hunkIndex: 1,
      },
    }), { status: 200 }))

    await expect(stageWorkspaceHunk('/repo', 'src/app.ts', 1)).rejects.toMatchObject({
      name: 'CodexApiError',
      code: 'invalid_response',
      method: 'tooling/stage-hunk',
    })
  })

  it('loads checkpoint lists and patches', async () => {
    const listFetch = mockFetch(new Response(JSON.stringify({
      result: [checkpoint()],
    }), { status: 200 }))

    await expect(fetchToolingCheckpoints('/repo', 6)).resolves.toEqual([checkpoint()])
    expect(listFetch).toHaveBeenCalledWith('/codex-api/tooling/checkpoints?cwd=%2Frepo&limit=6', undefined)

    const patchFetch = mockFetch(new Response(JSON.stringify({
      result: {
        checkpoint: checkpoint(),
        patch: 'diff --git a/src/app.ts b/src/app.ts',
      },
    }), { status: 200 }))

    await expect(fetchToolingCheckpointPatch('/repo', 'checkpoint-1')).resolves.toMatchObject({
      checkpoint: { id: 'checkpoint-1' },
      patch: 'diff --git a/src/app.ts b/src/app.ts',
    })
    expect(patchFetch).toHaveBeenCalledWith(
      '/codex-api/tooling/checkpoint-patch?cwd=%2Frepo&checkpointId=checkpoint-1',
      undefined,
    )
  })

  it('loads and mutates review comments', async () => {
    mockFetch(new Response(JSON.stringify({
      result: {
        comments: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceReviewComments('/repo')).resolves.toEqual({ comments: [] })

    const createFetch = mockFetch(new Response(JSON.stringify({
      result: {
        id: 'comment-1',
        body: 'Looks good',
      },
    }), { status: 200 }))

    const anchor = {
      filePath: 'src/app.ts',
      hunkHeader: '@@ -1,1 +1,1 @@',
      lineKind: 'add' as const,
      oldLineNumber: null,
      newLineNumber: 12,
      lineContent: '+export const value = 1',
    }
    await expect(createWorkspaceReviewComment('/repo', anchor, 'Looks good')).resolves.toMatchObject({
      id: 'comment-1',
    })
    expect(createFetch).toHaveBeenCalledWith('/codex-api/tooling/review-comments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', anchor, body: 'Looks good' }),
    }))

    mockFetch(new Response(JSON.stringify({
      result: {
        id: 'comment-1',
        status: 'resolved',
      },
    }), { status: 200 }))

    await expect(updateWorkspaceReviewCommentStatus('/repo', 'comment-1', 'resolved')).resolves.toMatchObject({
      status: 'resolved',
    })

    mockFetch(new Response(JSON.stringify({
      result: {
        threadId: 'thread-1',
      },
    }), { status: 200 }))

    await expect(createWorkspaceReviewFollowUp('/repo', 'comment-1')).resolves.toMatchObject({
      threadId: 'thread-1',
    })
  })
})
