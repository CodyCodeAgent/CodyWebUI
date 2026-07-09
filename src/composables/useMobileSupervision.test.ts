import { describe, expect, it } from 'vitest'
import { buildMobileSupervisionSummary } from './useMobileSupervision'
import type { UiServerRequest, UiThread, UiWorkspaceScriptRun, UiWorkspaceSnapshot } from '../types/codex'

function thread(overrides: Partial<UiThread>): UiThread {
  return {
    id: 'thread-1',
    title: 'Build feature',
    projectName: 'repo',
    cwd: '/repo',
    createdAtIso: '2026-07-05T00:00:00.000Z',
    updatedAtIso: '2026-07-05T00:01:00.000Z',
    preview: 'Implement feature',
    unread: false,
    inProgress: false,
    ...overrides,
  }
}

function snapshot(overrides: Partial<UiWorkspaceSnapshot> = {}): UiWorkspaceSnapshot {
  return {
    cwd: '/repo',
    repoRoot: '/repo',
    isGitRepo: true,
    branch: 'main',
    upstream: '',
    generatedAtIso: '2026-07-05T00:00:00.000Z',
    gitStatus: {
      dirtyFileCount: 0,
      stagedFileCount: 0,
      unstagedFileCount: 0,
      untrackedFileCount: 0,
      conflictedFileCount: 0,
      files: [],
    },
    packageManager: 'npm',
    scripts: [],
    validationPlan: {
      generatedAtIso: '2026-07-05T00:00:00.000Z',
      items: [],
      requiredCount: 0,
      recommendedCount: 0,
      optionalCount: 0,
      coveredCount: 0,
      failedCount: 0,
      missingEvidenceCount: 0,
    },
    projectContext: {
      generatedAtIso: '2026-07-05T00:00:00.000Z',
      sources: [],
      presentCount: 0,
      warnings: [],
    },
    workspaceConfig: {
      path: null,
      loaded: false,
      errors: [],
      trust: 'unknown',
      sandboxMode: 'unknown',
      approvalPolicy: '',
      defaultModel: '',
      reasoningEffort: '',
      collaborationMode: '',
      commandPolicy: { allow: [], deny: [] },
      validationCommands: [],
      knownPorts: [],
      portPolicy: {
        allow: [],
        deny: [],
        allowExternal: false,
        allowWildcard: false,
      },
      notifications: {
        enabled: false,
        events: [],
        channels: [],
      },
      theme: {
        skinId: '',
        accentColor: '',
        density: '',
        layoutPresetId: '',
        followSystem: null,
      },
      sensitivePaths: [],
      ignorePatterns: [],
    },
    configFiles: {
      codyWebUi: false,
      agents: false,
      aiIgnore: false,
      gitIgnore: false,
    },
    warnings: [],
    ...overrides,
  }
}

function validationRun(overrides: Partial<UiWorkspaceScriptRun> = {}): UiWorkspaceScriptRun {
  return {
    cwd: '/repo',
    repoRoot: '/repo',
    packageManager: 'npm',
    scriptName: 'test',
    command: 'npm test',
    status: 'passed',
    exitCode: 0,
    signal: null,
    startedAtIso: '2026-07-05T00:00:00.000Z',
    endedAtIso: '2026-07-05T00:00:01.000Z',
    durationMs: 1000,
    stdout: '',
    stderr: '',
    output: '',
    truncated: false,
    problems: [],
    testSummary: null,
    coverageSummary: null,
    ...overrides,
  }
}

function pendingRequest(): UiServerRequest {
  return {
    id: 1,
    method: 'item/commandExecution/requestApproval',
    params: {},
    receivedAtIso: '2026-07-05T00:00:00.000Z',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    commandPolicy: null,
    fileChangePolicy: null,
  }
}

describe('buildMobileSupervisionSummary', () => {
  it('prioritizes running tasks and enables pause, interrupt, follow-up, and archive actions', () => {
    const summary = buildMobileSupervisionSummary({
      threads: [
        thread({ id: 'idle', title: 'Idle', updatedAtIso: '2026-07-05T00:02:00.000Z' }),
        thread({ id: 'running', title: 'Running', inProgress: true, updatedAtIso: '2026-07-05T00:01:00.000Z' }),
      ],
      snapshot: snapshot({
        gitStatus: {
          dirtyFileCount: 2,
          stagedFileCount: 0,
          unstagedFileCount: 2,
          untrackedFileCount: 0,
          conflictedFileCount: 0,
          files: [],
        },
      }),
      validationRuns: [validationRun({ status: 'failed', exitCode: 1 })],
      pendingRequests: [pendingRequest()],
      rateLimitSnapshot: null,
    })

    expect(summary.headline).toBe('Approval needed')
    expect(summary.primaryTask?.id).toBe('running')
    expect(summary.canContinue).toBe(true)
    expect(summary.canPause).toBe(true)
    expect(summary.canInterrupt).toBe(true)
    expect(summary.canArchive).toBe(true)
    expect(summary.statusText).toBe('1 approvals · 1 failed validations · 2 dirty files')
  })

  it('reports empty state when there are no recent tasks', () => {
    const summary = buildMobileSupervisionSummary({
      threads: [],
      snapshot: null,
      validationRuns: [],
      pendingRequests: [],
      rateLimitSnapshot: null,
    })

    expect(summary.headline).toBe('No active task')
    expect(summary.primaryTask).toBeNull()
    expect(summary.canContinue).toBe(false)
    expect(summary.canPause).toBe(false)
    expect(summary.canArchive).toBe(false)
  })
})
