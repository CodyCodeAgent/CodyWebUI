import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyWorkspaceWorkflowImplementation,
  createWorkspaceWorkflowRun,
  discardWorkspaceWorkflowImplementation,
  fetchWorkspaceWorkflowDeliveryDraft,
  fetchWorkspaceWorkflowReplay,
  fetchWorkspaceWorkflows,
  markWorkspaceWorkflowMerged,
  markWorkspaceWorkflowReadyToMerge,
  provisionWorkspaceWorkflowAgentWorktree,
  runWorkspaceWorkflowValidation,
  updateWorkspaceWorkflowAgentStatus,
} from './codexWorkflowClient'

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function workflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    status: 'running',
    agents: [],
    ...overrides,
  }
}

describe('codex workflow client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads workflow dashboards and rejects malformed responses', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        templates: [],
        runs: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceWorkflows('/repo', 12)).resolves.toMatchObject({
      templates: [],
      runs: [],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/workflows?cwd=%2Frepo&limit=12', undefined)

    mockFetch(new Response(JSON.stringify({
      result: {
        templates: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceWorkflows('/repo')).rejects.toMatchObject({
      name: 'CodexApiError',
      code: 'invalid_response',
      method: 'tooling/workflows',
    })
  })

  it('creates and updates workflow runs through tooling endpoints', async () => {
    const createFetch = mockFetch(new Response(JSON.stringify({
      result: workflowRun(),
    }), { status: 200 }))

    await expect(createWorkspaceWorkflowRun('/repo', 'template-1', 'ship it')).resolves.toMatchObject({
      id: 'run-1',
    })
    expect(createFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        templateId: 'template-1',
        goal: 'ship it',
      }),
    }))

    const updateFetch = mockFetch(new Response(JSON.stringify({
      result: workflowRun({ status: 'blocked' }),
    }), { status: 200 }))

    await expect(updateWorkspaceWorkflowAgentStatus('/repo', 'run-1', 'agent-1', 'blocked', 'waiting')).resolves.toMatchObject({
      id: 'run-1',
      status: 'blocked',
    })
    expect(updateFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows/agent-status', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        runId: 'run-1',
        agentId: 'agent-1',
        status: 'blocked',
        note: 'waiting',
      }),
    }))

    const provisionFetch = mockFetch(new Response(JSON.stringify({
      result: workflowRun(),
    }), { status: 200 }))

    await expect(provisionWorkspaceWorkflowAgentWorktree('/repo', 'run-1', 'agent-1', 'main')).resolves.toMatchObject({
      id: 'run-1',
    })
    expect(provisionFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows/agent-worktree', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        runId: 'run-1',
        agentId: 'agent-1',
        baseRef: 'main',
      }),
    }))
  })

  it('loads workflow replay and delivery drafts', async () => {
    const replayFetch = mockFetch(new Response(JSON.stringify({
      result: {
        events: [],
        agentSnapshots: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceWorkflowReplay('/repo', 'run-1')).resolves.toMatchObject({
      events: [],
      agentSnapshots: [],
    })
    expect(replayFetch).toHaveBeenCalledWith(
      '/codex-api/tooling/workflows/replay?cwd=%2Frepo&runId=run-1',
      undefined,
    )

    const draftFetch = mockFetch(new Response(JSON.stringify({
      result: {
        title: 'Ship it',
        body: 'Body',
        commitMessage: 'Ship it',
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceWorkflowDeliveryDraft('/repo', 'run-1')).resolves.toMatchObject({
      title: 'Ship it',
      commitMessage: 'Ship it',
    })
    expect(draftFetch).toHaveBeenCalledWith(
      '/codex-api/tooling/workflows/delivery-draft?cwd=%2Frepo&runId=run-1',
      undefined,
    )
  })

  it('updates delivery status', async () => {
    const readyFetch = mockFetch(new Response(JSON.stringify({
      result: {
        run: workflowRun({ status: 'ready_to_merge' }),
        deliveryState: { status: 'ready_to_merge' },
      },
    }), { status: 200 }))

    await expect(markWorkspaceWorkflowReadyToMerge('/repo', 'run-1', 'green')).resolves.toMatchObject({
      run: { status: 'ready_to_merge' },
    })
    expect(readyFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows/ready-to-merge', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        runId: 'run-1',
        note: 'green',
      }),
    }))

    const mergedFetch = mockFetch(new Response(JSON.stringify({
      result: {
        run: workflowRun({ status: 'merged' }),
        deliveryState: { status: 'merged' },
      },
    }), { status: 200 }))

    await expect(markWorkspaceWorkflowMerged({
      cwd: '/repo',
      runId: 'run-1',
      commitHash: 'abc123',
    })).resolves.toMatchObject({
      run: { status: 'merged' },
    })
    expect(mergedFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows/merged', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        runId: 'run-1',
        commitHash: 'abc123',
      }),
    }))
  })

  it('applies, discards, and validates workflow implementations', async () => {
    const applyFetch = mockFetch(new Response(JSON.stringify({
      result: {
        run: workflowRun(),
        appliedImplementation: { agentId: 'agent-1' },
        targetStatus: { files: [] },
      },
    }), { status: 200 }))

    await expect(applyWorkspaceWorkflowImplementation('/repo', 'run-1', 'agent-1')).resolves.toMatchObject({
      appliedImplementation: { agentId: 'agent-1' },
    })
    expect(applyFetch).toHaveBeenCalledWith('/codex-api/tooling/workflows/apply-implementation', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        cwd: '/repo',
        runId: 'run-1',
        agentId: 'agent-1',
      }),
    }))

    mockFetch(new Response(JSON.stringify({
      result: {
        run: workflowRun(),
        discardedImplementation: { agentId: 'agent-1' },
      },
    }), { status: 200 }))

    await expect(discardWorkspaceWorkflowImplementation('/repo', 'run-1', 'agent-1', 'stale')).resolves.toMatchObject({
      discardedImplementation: { agentId: 'agent-1' },
    })

    mockFetch(new Response(JSON.stringify({
      result: {
        run: workflowRun(),
        validationRun: { command: 'npm test', status: 'completed' },
        replay: {},
      },
    }), { status: 200 }))

    await expect(runWorkspaceWorkflowValidation('/repo', 'run-1', 'test')).resolves.toMatchObject({
      validationRun: { command: 'npm test' },
    })
  })
})
