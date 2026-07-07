import { describe, expect, it } from 'vitest'
import type {
  UiNotificationDeliveryReport,
  UiValidationPlanItem,
  UiWorkspaceProblem,
  UiWorkspaceConfig,
  UiWorkspaceProjectContext,
  UiWorkspaceSnapshot,
  UiWorkspaceScriptRun,
  UiWorkspaceValidationPlan,
} from '../types/codex'
import type { UiWorkspaceResourceSummary } from './useWorkspaceResources'
import {
  basenameFromPath,
  completedWorkspaceScriptRuns,
  completedWorkspaceScriptState,
  defaultWorkspaceConfig,
  failedWorkspaceScriptState,
  formatWorkspaceDuration,
  isRunnableValidationScriptName,
  isWorkspaceValidationScriptName,
  mergedWorkspaceValidationRuns,
  runningWorkspaceScriptState,
  scriptProblemCount,
  scriptRunEvidenceSummary,
  scriptRunOutput,
  setWorkspaceScriptRunState,
  validationPlanEvidenceLabel,
  workspaceConfiguredValidationCommandPreview,
  workspaceScriptRunState,
  workspaceScriptRunButtonLabel,
  workspaceDashboardPreviewItems,
  workspaceDirtyFilePreview,
  workspaceNotificationChannelPreview,
  workspaceCommandPolicyLabel,
  workspaceNotificationPolicyLabel,
  workspaceNotificationTestSummary,
  workspaceProjectContextSourcePreview,
  workspaceProjectContextSummary,
  workspaceResourceMetrics,
  workspaceThemePolicyLabel,
  workspaceValidationScripts,
  workspaceValidationPlanItemPreview,
  workspaceValidationPlanSummary,
  EMPTY_WORKSPACE_SCRIPT_RUN_STATE,
  type WorkspaceScriptRunState,
} from './workspaceDashboardRules'

function workspaceConfig(overrides: Partial<UiWorkspaceConfig> = {}): UiWorkspaceConfig {
  return {
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
    ...overrides,
  }
}

function validationPlanItem(overrides: Partial<UiValidationPlanItem> = {}): UiValidationPlanItem {
  return {
    id: 'validation-1',
    kind: 'test',
    title: 'Tests',
    priority: 'required',
    source: 'package_script',
    status: 'ready',
    command: 'npm test',
    scriptName: 'test',
    targetUrl: null,
    reason: 'package script',
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

function scriptRun(overrides: Partial<UiWorkspaceScriptRun> = {}): UiWorkspaceScriptRun {
  return {
    cwd: '/repo',
    repoRoot: '/repo',
    packageManager: 'npm',
    scriptName: 'test',
    command: 'npm test',
    status: 'passed',
    exitCode: 0,
    signal: null,
    startedAtIso: '2026-07-07T00:00:00.000Z',
    endedAtIso: '2026-07-07T00:00:01.000Z',
    durationMs: 1000,
    stdout: '',
    stderr: '',
    output: 'ok',
    truncated: false,
    problems: [],
    ...overrides,
  }
}

function problem(overrides: Partial<UiWorkspaceProblem> = {}): UiWorkspaceProblem {
  return {
    id: 'problem-1',
    severity: 'error',
    source: 'tsc',
    message: 'Type error',
    filePath: 'src/App.ts',
    line: 1,
    column: 1,
    command: 'npm test',
    rawLine: 'src/App.ts:1:1 Type error',
    ...overrides,
  }
}

describe('workspace dashboard rules', () => {
  it('builds a fresh default workspace config', () => {
    const first = defaultWorkspaceConfig()
    const second = defaultWorkspaceConfig()

    expect(first).toMatchObject({
      path: null,
      loaded: false,
      trust: 'unknown',
      sandboxMode: 'unknown',
      approvalPolicy: '',
      commandPolicy: { allow: [], deny: [] },
      notifications: { enabled: false, events: [], channels: [] },
      theme: {
        skinId: '',
        accentColor: '',
        density: '',
        layoutPresetId: '',
        followSystem: null,
      },
    })
    first.validationCommands.push({ name: 'test', command: 'npm test' })
    first.notifications.channels.push({ name: 'lark', type: 'lark', enabled: true, events: [], target: '$LARK' })

    expect(second.validationCommands).toEqual([])
    expect(second.notifications.channels).toEqual([])
  })

  it('builds bounded dashboard preview rows and resource metrics', () => {
    expect(workspaceDashboardPreviewItems([1, 2, 3], 2)).toEqual([1, 2])
    expect(workspaceDashboardPreviewItems([1, 2, 3], -1)).toEqual([])

    const snapshot = {
      gitStatus: {
        files: [
          { path: 'a.ts', status: 'M', indexStatus: ' ', worktreeStatus: 'M' },
          { path: 'b.ts', status: '??', indexStatus: '?', worktreeStatus: '?' },
        ],
      },
    } as UiWorkspaceSnapshot
    expect(workspaceDirtyFilePreview(snapshot, 1)).toEqual([snapshot.gitStatus.files[0]])
    expect(workspaceDirtyFilePreview(null, 1)).toEqual([])

    const config = workspaceConfig({
      validationCommands: [
        { name: 'test', command: 'npm test' },
        { name: 'lint', command: 'npm run lint' },
      ],
      notifications: {
        enabled: true,
        events: [],
        channels: [
          { name: 'lark', type: 'lark', enabled: true, events: [], target: '$LARK' },
          { name: 'slack', type: 'slack', enabled: false, events: [], target: '$SLACK' },
        ],
      },
    })
    expect(workspaceConfiguredValidationCommandPreview(config, 1)).toEqual([config.validationCommands[0]])
    expect(workspaceNotificationChannelPreview(config, 1)).toEqual([config.notifications.channels[0]])

    const plan: UiWorkspaceValidationPlan = {
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      items: [validationPlanItem({ id: 'one' }), validationPlanItem({ id: 'two' })],
      requiredCount: 0,
      recommendedCount: 0,
      optionalCount: 0,
      coveredCount: 0,
      failedCount: 0,
      missingEvidenceCount: 0,
    }
    expect(workspaceValidationPlanItemPreview(plan, 1).map((item) => item.id)).toEqual(['one'])
    expect(workspaceValidationPlanItemPreview(null, 1)).toEqual([])

    const context: UiWorkspaceProjectContext = {
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      presentCount: 1,
      warnings: [],
      sources: [
        {
          id: 'rules',
          kind: 'custom_rules',
          title: 'Rules',
          path: 'README.md',
          present: true,
          bytes: 128,
          excerpt: 'ok',
          truncated: false,
          summary: 'ok',
        },
        {
          id: 'agents',
          kind: 'agents',
          title: 'AGENTS',
          path: 'AGENTS.md',
          present: false,
          bytes: 0,
          excerpt: '',
          truncated: false,
          summary: 'missing',
        },
      ],
    }
    expect(workspaceProjectContextSourcePreview(context, 1).map((source) => source.id)).toEqual(['rules'])
    expect(workspaceProjectContextSourcePreview(undefined, 1)).toEqual([])

    const resourceSummary = {
      rateLimit: { label: 'rate', value: 'ok', detail: '', tone: 'success' },
      tokens: { label: 'tokens', value: '1', detail: '', tone: 'info' },
      validation: { label: 'validation', value: '2', detail: '', tone: 'success' },
      activity: { label: 'activity', value: '3', detail: '', tone: 'warning' },
    } as UiWorkspaceResourceSummary
    expect(workspaceResourceMetrics(resourceSummary).map((metric) => metric.label))
      .toEqual(['rate', 'tokens', 'validation', 'activity'])
  })

  it('formats labels for paths, durations, policies, and summaries', () => {
    expect(basenameFromPath('/repo/apps/web')).toBe('web')
    expect(formatWorkspaceDuration(999.4)).toBe('999ms')
    expect(formatWorkspaceDuration(1250)).toBe('1.3s')

    expect(workspaceCommandPolicyLabel(workspaceConfig())).toBe('not configured')
    expect(workspaceCommandPolicyLabel(workspaceConfig({
      commandPolicy: { allow: ['npm test'], deny: ['rm -rf'] },
    }))).toBe('1 allowed · 1 denied')

    expect(workspaceNotificationPolicyLabel(workspaceConfig())).toBe('off')
    expect(workspaceNotificationPolicyLabel(workspaceConfig({
      notifications: {
        enabled: true,
        events: [],
        channels: [
          { name: 'lark', type: 'lark', enabled: true, events: [], target: '$LARK' },
          { name: 'slack', type: 'slack', enabled: false, events: [], target: '$SLACK' },
        ],
      },
    }))).toBe('1 channel')

    expect(workspaceThemePolicyLabel(workspaceConfig())).toBe('personal')
    expect(workspaceThemePolicyLabel(workspaceConfig({
      theme: {
        skinId: 'mono',
        accentColor: '',
        density: 'compact',
        layoutPresetId: 'ops-dashboard',
        followSystem: null,
      },
    }))).toBe('mono · ops-dashboard · compact')
  })

  it('summarizes validation plans, project context, and notification tests', () => {
    const plan: UiWorkspaceValidationPlan = {
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      items: [validationPlanItem(), validationPlanItem({ id: 'validation-2' })],
      requiredCount: 1,
      recommendedCount: 1,
      optionalCount: 0,
      coveredCount: 1,
      failedCount: 1,
      missingEvidenceCount: 1,
    }
    expect(workspaceValidationPlanSummary(plan)).toBe('2 items · 1 covered · 1 failed · 1 missing evidence')
    expect(workspaceValidationPlanSummary(null)).toBe('no plan')

    const context: UiWorkspaceProjectContext = {
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      presentCount: 2,
      warnings: ['missing AGENTS.md'],
      sources: [
        {
          id: 'rules',
          kind: 'custom_rules',
          title: 'Rules',
          path: 'README.md',
          present: true,
          bytes: 128,
          excerpt: 'ok',
          truncated: false,
          summary: 'ok',
        },
        {
          id: 'agents',
          kind: 'agents',
          title: 'AGENTS',
          path: 'AGENTS.md',
          present: false,
          bytes: 0,
          excerpt: '',
          truncated: false,
          summary: 'missing',
        },
      ],
    }
    expect(workspaceProjectContextSummary(context)).toBe('2 present · 2 tracked · 1 gaps')
    expect(workspaceProjectContextSummary(undefined)).toBe('no context')

    const report = {
      enabled: true,
      sentCount: 2,
      failedCount: 1,
      skippedCount: 0,
    } as UiNotificationDeliveryReport
    expect(workspaceNotificationTestSummary(report)).toBe('2 sent · 1 failed · 0 skipped')
    expect(workspaceNotificationTestSummary({ ...report, enabled: false })).toBe('Notification delivery is disabled for this workspace.')
    expect(workspaceNotificationTestSummary(null)).toBe('')
  })

  it('classifies workspace scripts and runnable validation scripts', () => {
    expect(isWorkspaceValidationScriptName('test')).toBe(true)
    expect(isWorkspaceValidationScriptName('preview')).toBe(true)
    expect(isWorkspaceValidationScriptName('storybook')).toBe(false)
    expect(workspaceValidationScripts([
      { name: 'test', command: 'vitest' },
      { name: 'storybook', command: 'storybook dev' },
      { name: 'build', command: 'vite build' },
    ])).toEqual([
      { name: 'test', command: 'vitest' },
      { name: 'build', command: 'vite build' },
    ])
    expect(workspaceValidationScripts(null)).toEqual([])

    expect(isRunnableValidationScriptName('test')).toBe(true)
    expect(isRunnableValidationScriptName('type-check')).toBe(true)
    expect(isRunnableValidationScriptName('preview')).toBe(false)
    expect(isRunnableValidationScriptName('start')).toBe(false)
  })

  it('labels validation evidence and script run output', () => {
    expect(validationPlanEvidenceLabel(validationPlanItem({
      evidence: {
        status: 'failed',
        runAtIso: null,
        durationMs: 1250,
        exitCode: 1,
        problemCount: 2,
        testSummary: null,
        coverageSummary: null,
      },
    }))).toBe('failed · exit 1 · 1.3s · 2 problems')
    expect(validationPlanEvidenceLabel(validationPlanItem({ evidence: {
      status: 'manual',
      runAtIso: null,
      durationMs: null,
      exitCode: null,
      problemCount: 0,
      testSummary: null,
      coverageSummary: null,
    } }))).toBe('Manual evidence required.')
    expect(validationPlanEvidenceLabel(validationPlanItem({ command: '' }))).toBe('No runnable command is configured yet.')

    expect(scriptRunOutput(null)).toBe('')
    expect(scriptRunOutput(scriptRun({ output: '  ' }))).toBe('No output captured.')
    expect(scriptProblemCount(scriptRun({ problems: [problem({ id: 'p1' })] }))).toBe(1)
  })

  it('summarizes test and coverage evidence from script runs', () => {
    expect(scriptRunEvidenceSummary(scriptRun({
      testSummary: {
        total: 10,
        passed: 9,
        failed: 1,
        skipped: 0,
        rawLines: [],
      },
      coverageSummary: {
        statements: 87.45,
        branches: 80,
        functions: null,
        lines: 88.2,
        rawLines: [],
      },
    }))).toEqual([
      'tests 9 passed · 1 failed · 0 skipped · 10 total',
      'coverage stmt 87.5% · branch 80.0% · line 88.2%',
    ])
  })

  it('updates workspace script run states without losing previous evidence', () => {
    const previousResult = scriptRun({ scriptName: 'test', output: 'old output' })
    const previous: WorkspaceScriptRunState = {
      isRunning: false,
      errorMessage: '',
      result: previousResult,
    }

    expect(workspaceScriptRunState({}, 'test')).toBe(EMPTY_WORKSPACE_SCRIPT_RUN_STATE)
    expect(workspaceScriptRunButtonLabel(EMPTY_WORKSPACE_SCRIPT_RUN_STATE)).toBe('Run')
    expect(setWorkspaceScriptRunState({}, '', previous)).toEqual({})
    expect(setWorkspaceScriptRunState({}, 'test', previous)).toEqual({ test: previous })
    const runningState = runningWorkspaceScriptState(previous)
    expect(runningState).toEqual({
      isRunning: true,
      errorMessage: '',
      result: previousResult,
    })
    expect(workspaceScriptRunButtonLabel(runningState)).toBe('Running')
    expect(completedWorkspaceScriptState(scriptRun({ output: 'new output' }))).toMatchObject({
      isRunning: false,
      errorMessage: '',
      result: { output: 'new output' },
    })
    expect(failedWorkspaceScriptState(previous, 'boom')).toEqual({
      isRunning: false,
      errorMessage: 'boom',
      result: previousResult,
    })
  })

  it('merges current and historical validation runs by stable run identity', () => {
    const current = scriptRun({
      scriptName: 'test',
      command: 'npm test',
      startedAtIso: '2026-07-07T00:00:00.000Z',
      endedAtIso: '2026-07-07T00:00:01.000Z',
      output: 'current',
    })
    const duplicateHistory = scriptRun({
      scriptName: 'test',
      command: 'npm test',
      startedAtIso: '2026-07-07T00:00:00.000Z',
      endedAtIso: '2026-07-07T00:00:01.000Z',
      output: 'history duplicate',
    })
    const olderHistory = scriptRun({
      scriptName: 'lint',
      command: 'npm run lint',
      startedAtIso: '2026-07-06T00:00:00.000Z',
      endedAtIso: '2026-07-06T00:00:02.000Z',
      output: 'older',
    })

    expect(completedWorkspaceScriptRuns({
      test: completedWorkspaceScriptState(current),
      empty: EMPTY_WORKSPACE_SCRIPT_RUN_STATE,
    })).toEqual([current])
    expect(mergedWorkspaceValidationRuns([olderHistory, current], [duplicateHistory]).map((run) => run.output))
      .toEqual(['current', 'older'])
  })
})
