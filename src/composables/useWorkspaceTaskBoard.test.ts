import { describe, expect, it, vi } from 'vitest'
import {
  buildWorkspaceValidationGate,
  buildWorkspaceTaskBoard,
  deriveWorkspaceTaskRisks,
  deriveWorkspaceTaskStatus,
} from './useWorkspaceTaskBoard'
import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiValidationPlanItem,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../types/codex'

function thread(overrides: Partial<UiThread>): UiThread {
  return {
    id: 'thread-1',
    title: 'Build feature',
    projectName: 'repo',
    cwd: '/repo',
    createdAtIso: '2026-07-05T00:00:00.000Z',
    updatedAtIso: '2026-07-05T00:01:00.000Z',
    preview: 'Implement the feature',
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
      commandPolicy: {
        allow: [],
        deny: [],
      },
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
      codexWeb: false,
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
    ...overrides,
  }
}

function validationPlanItem(overrides: Partial<UiValidationPlanItem> = {}): UiValidationPlanItem {
  return {
    id: 'test',
    kind: 'test',
    title: 'Run tests',
    priority: 'required',
    source: 'workspace_config',
    status: 'ready',
    command: 'npm test',
    scriptName: 'test',
    targetUrl: null,
    reason: 'Configured validation command.',
    evidence: {
      status: 'missing',
      runAtIso: null,
      durationMs: null,
      exitCode: null,
      problemCount: 0,
      testSummary: null,
      coverageSummary: null,
    },
    ...overrides,
  }
}

function snapshotWithValidationItems(items: UiValidationPlanItem[], overrides: Partial<UiWorkspaceSnapshot> = {}): UiWorkspaceSnapshot {
  return snapshot({
    validationPlan: {
      generatedAtIso: '2026-07-05T00:00:00.000Z',
      items,
      requiredCount: items.filter((item) => item.priority === 'required').length,
      recommendedCount: items.filter((item) => item.priority === 'recommended').length,
      optionalCount: items.filter((item) => item.priority === 'optional').length,
      coveredCount: items.filter((item) => item.status === 'covered').length,
      failedCount: items.filter((item) => item.status === 'failed').length,
      missingEvidenceCount: items.filter((item) => item.evidence.status === 'missing').length,
    },
    ...overrides,
  })
}

function pendingRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 1,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-07-05T00:00:00.000Z',
    params: {},
    ...overrides,
  }
}

describe('workspace task board helpers', () => {
  it('derives task status from thread activity and review signals', () => {
    expect(deriveWorkspaceTaskStatus(thread({ inProgress: true }), snapshot())).toBe('coding')
    expect(deriveWorkspaceTaskStatus(thread({ unread: true }), snapshot())).toBe('ready_for_review')
    expect(deriveWorkspaceTaskStatus(thread({}), snapshot({
      gitStatus: {
        dirtyFileCount: 2,
        stagedFileCount: 0,
        unstagedFileCount: 2,
        untrackedFileCount: 0,
        conflictedFileCount: 0,
        files: [],
      },
    }))).toBe('ready_for_review')
    expect(deriveWorkspaceTaskStatus(thread({}), snapshot())).toBe('queued')
  })

  it('uses validation gates before moving dirty work to ready for review', () => {
    const dirtySnapshot = {
      gitStatus: {
        dirtyFileCount: 2,
        stagedFileCount: 0,
        unstagedFileCount: 2,
        untrackedFileCount: 0,
        conflictedFileCount: 0,
        files: [],
      },
    }

    expect(buildWorkspaceValidationGate(snapshotWithValidationItems([
      validationPlanItem(),
    ], dirtySnapshot))).toMatchObject({
      status: 'missing_required',
      missingRequiredCount: 1,
    })
    expect(deriveWorkspaceTaskStatus(thread({}), snapshotWithValidationItems([
      validationPlanItem(),
    ], dirtySnapshot))).toBe('testing')

    expect(deriveWorkspaceTaskStatus(thread({}), snapshotWithValidationItems([
      validationPlanItem({
        status: 'failed',
        evidence: {
          status: 'failed',
          runAtIso: '2026-07-05T00:01:00.000Z',
          durationMs: 1000,
          exitCode: 1,
          problemCount: 1,
          testSummary: null,
          coverageSummary: null,
        },
      }),
    ], dirtySnapshot))).toBe('failed')

    expect(deriveWorkspaceTaskStatus(thread({}), snapshotWithValidationItems([
      validationPlanItem({
        status: 'covered',
        evidence: {
          status: 'passed',
          runAtIso: '2026-07-05T00:01:00.000Z',
          durationMs: 1000,
          exitCode: 0,
          problemCount: 0,
          testSummary: null,
          coverageSummary: null,
        },
      }),
    ], dirtySnapshot))).toBe('ready_for_review')
  })

  it('surfaces approval waiting state before review readiness', () => {
    expect(deriveWorkspaceTaskStatus(thread({}), snapshot(), {
      pendingRequests: [pendingRequest()],
    })).toBe('waiting_for_approval')
  })

  it('surfaces validation, dirty tree, warning, and rate-limit risks', () => {
    const risks = deriveWorkspaceTaskRisks({
      thread: thread({ inProgress: true }),
      snapshot: snapshot({
        gitStatus: {
          dirtyFileCount: 3,
          stagedFileCount: 1,
          unstagedFileCount: 2,
          untrackedFileCount: 0,
          conflictedFileCount: 0,
          files: [],
        },
        warnings: ['danger sandbox'],
      }),
      validationRuns: [validationRun({
        status: 'failed',
        exitCode: 1,
        problems: [
          {
            id: 'problem-1',
            severity: 'error',
            source: 'generic',
            message: 'failed',
            filePath: 'src/App.vue',
            line: 1,
            column: 1,
            command: 'npm test',
            rawLine: 'src/App.vue:1:1 failed',
          },
        ],
      })],
      pendingRequests: [pendingRequest()],
      rateLimitSnapshot: {
        limitId: 'codex',
        limitName: 'Codex',
        planType: 'pro',
        primary: {
          usedPercent: 91,
          windowDurationMins: 300,
          resetsAt: null,
        },
        secondary: null,
        credits: null,
        availableResetCredits: null,
      } satisfies UiRateLimitSnapshot,
    })

    expect(risks.map((risk) => risk.label)).toEqual(expect.arrayContaining([
      'Agent running',
      '1 approvals',
      'No required validation gate',
      'Validation failed',
      '1 problems',
      '3 dirty files',
      '1 safety warnings',
    ]))
    expect(risks.some((risk) => risk.label === 'Rate 91%')).toBe(true)
  })

  it('builds lanes and summary ordered by recency', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T00:02:00.000Z'))

    const board = buildWorkspaceTaskBoard({
      threads: [
        thread({ id: 'old', title: 'Old', updatedAtIso: '2026-07-05T00:00:00.000Z' }),
        thread({ id: 'new', title: 'New', updatedAtIso: '2026-07-05T00:01:00.000Z', inProgress: true }),
      ],
      snapshot: snapshot(),
      validationRuns: [],
      rateLimitSnapshot: null,
      pendingRequests: [],
    })

    expect(board.cards.map((card) => card.id)).toEqual(['new', 'old'])
    expect(board.summary).toMatchObject({
      totalCount: 2,
      codingCount: 1,
      readyForReviewCount: 0,
      queuedCount: 1,
    })
    expect(board.lanes.find((lane) => lane.status === 'coding')?.cards.map((card) => card.id)).toEqual(['new'])

    vi.useRealTimers()
  })
})
