import { describe, expect, it } from 'vitest'
import { buildWorkspaceResourceSummary } from './useWorkspaceResources'
import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiWorkspaceScriptRun,
  UiWorkspaceSessionSummary,
} from '../types/codex'

function thread(overrides: Partial<UiThread> = {}): UiThread {
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
    endedAtIso: '2026-07-05T00:00:05.000Z',
    durationMs: 5000,
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

function session(overrides: Partial<UiWorkspaceSessionSummary> = {}): UiWorkspaceSessionSummary {
  return {
    threadId: 'thread-1',
    title: 'Thread thread-1',
    status: 'completed',
    severity: 'success',
    startedAtIso: '2026-07-05T00:00:00.000Z',
    updatedAtIso: '2026-07-05T00:01:00.000Z',
    latestTurnId: 'turn-1',
    latestEventKind: 'task_completed',
    latestSummary: 'Completed.',
    eventCount: 1,
    approvalCount: 0,
    failedCount: 0,
    planUpdateCount: 0,
    messageCount: 0,
    compactedCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenUsageEventCount: 0,
    costUsd: null,
    costEventCount: 0,
    ...overrides,
  }
}

function rateLimit(overrides: Partial<UiRateLimitSnapshot> = {}): UiRateLimitSnapshot {
  return {
    limitId: 'codex',
    limitName: 'Codex',
    planType: 'pro',
    primary: {
      usedPercent: 42,
      windowDurationMins: 300,
      resetsAt: null,
    },
    secondary: null,
    credits: null,
    availableResetCredits: 2,
    ...overrides,
  }
}

function pendingRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
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
    ...overrides,
  }
}

describe('buildWorkspaceResourceSummary', () => {
  it('summarizes live rate limits, token usage, validation cost, and approvals', () => {
    const summary = buildWorkspaceResourceSummary({
      rateLimitSnapshot: rateLimit({
        primary: {
          usedPercent: 93,
          windowDurationMins: 300,
          resetsAt: null,
        },
      }),
      validationRuns: [
        validationRun({ durationMs: 5000 }),
        validationRun({ status: 'failed', exitCode: 1, durationMs: 7000 }),
      ],
      sessions: [
        session({
          status: 'waiting_for_approval',
          inputTokens: 1200,
          outputTokens: 300,
          totalTokens: 1500,
          tokenUsageEventCount: 1,
          costUsd: 0.0123,
          costEventCount: 1,
        }),
      ],
      threads: [thread({ inProgress: true })],
      pendingRequests: [pendingRequest()],
      now: () => new Date('2026-07-05T00:02:00.000Z'),
    })

    expect(summary.tone).toBe('danger')
    expect(summary.rateLimit).toMatchObject({ value: '93%', tone: 'danger' })
    expect(summary.tokens.value).toBe('1,500')
    expect(summary.tokens.detail).toContain('1,200 in')
    expect(summary.tokens.detail).toContain('$0.0123')
    expect(summary.validation).toMatchObject({ value: '2 runs', tone: 'danger' })
    expect(summary.validation.detail).toContain('12s captured')
    expect(summary.activity).toMatchObject({ value: '1 active', tone: 'warning' })
    expect(summary.activity.detail).toContain('2 waiting approval')
  })

  it('states when token telemetry and validation evidence are unavailable', () => {
    const summary = buildWorkspaceResourceSummary({
      rateLimitSnapshot: null,
      validationRuns: [],
      sessions: [session()],
      threads: [],
      pendingRequests: [],
      now: () => new Date('2026-07-05T00:02:00.000Z'),
    })

    expect(summary.rateLimit.value).toBe('unknown')
    expect(summary.tokens.value).toBe('untracked')
    expect(summary.validation.value).toBe('none')
    expect(summary.notes.join(' ')).toContain('Token and cost totals require Codex usage metadata')
  })
})
