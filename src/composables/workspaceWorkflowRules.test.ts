import { describe, expect, it } from 'vitest'
import type {
  UiWorkflowAgentStep,
  UiWorkflowDeliveryDraft,
  UiWorkflowImplementationOption,
  UiWorkflowReplay,
  UiWorkflowRun,
} from '../types/codex'
import {
  canApplyWorkflowImplementation,
  canBlockWorkflowAgent,
  canCompleteWorkflowAgent,
  canCreateWorkflowRun,
  canDiscardWorkflowImplementation,
  canMarkMerged,
  canMarkReadyToMerge,
  canSkipWorkflowAgent,
  canStartWorkflowAgent,
  emptyWorkflowPanelState,
  formatWorkflowStatus,
  hasWorkflowImplementationActions,
  workflowAgentWorktreeButtonLabel,
  workflowAppliedImplementationSummary,
  workflowDeliveryMergedButtonLabel,
  workflowDeliveryReadyButtonLabel,
  workflowDeliveryStateSummary,
  isRunnableValidationScriptName,
  isWorkflowAgentProvisioning,
  isWorkflowAgentUpdating,
  isWorkflowDeliveryLoading,
  isWorkflowDeliveryUpdating,
  isWorkflowImplementationApplying,
  isWorkflowImplementationDiscarding,
  prependWorkflowRun,
  runnableValidationOptions,
  replaceWorkflowRun,
  setWorkflowDeliveryDraftForRun,
  setWorkflowReplayForRun,
  setWorkflowRunError,
  setWorkflowValidationResult,
  workflowAcceptanceGreen,
  workflowAgentKey,
  workflowAcceptanceRisksPreview,
  workflowCreateButtonLabel,
  workflowDeliveryButtonLabel,
  workflowDeliveryKey,
  workflowImplementationDiffLabel,
  workflowDeliveryRiskSummaryPreview,
  workflowImplementationApplyLabel,
  workflowImplementationDiscardLabel,
  workflowImplementationRisksPreview,
  workflowImplementationOptionsSummary,
  workflowPreviewItems,
  workflowReplayAgentSnapshotLabel,
  workflowReplayButtonLabel,
  workflowReplayEventMetaLabel,
  workflowRunMetaLabels,
  workflowRunWarningsPreview,
  workflowTemplateMetaLabels,
  workflowValidationResultLabel,
  workflowValidationRunButtonLabel,
  isWorkflowReplayLoading,
  isWorkflowValidationRunning,
  workflowValidationKey,
  workflowWorktreeLabel,
  isWorkflowKeyPending,
  workspaceWorkflowSummary,
} from './workspaceWorkflowRules'

function run(overrides: Partial<UiWorkflowRun> = {}): UiWorkflowRun {
  return {
    id: 'run-1',
    cwd: '/repo',
    repoRoot: '/repo',
    templateId: 'template-1',
    templateName: 'Default',
    goal: 'Ship',
    status: 'running',
    createdAtIso: '2026-07-07T00:00:00.000Z',
    updatedAtIso: '2026-07-07T00:00:00.000Z',
    branch: 'main',
    dirtyFileCount: 0,
    agents: [],
    validationPlan: [],
    riskLabels: [],
    warnings: [],
    summary: '',
    ...overrides,
  }
}

function agent(overrides: Partial<UiWorkflowAgentStep> = {}): UiWorkflowAgentStep {
  return {
    id: 'agent-1',
    title: 'Implement',
    role: 'implementation',
    objective: 'Build it',
    deliverables: [],
    requiresWorktree: true,
    dependsOn: [],
    status: 'ready',
    agentName: 'Agent',
    model: 'gpt-5',
    reasoningEffort: 'medium',
    permissionProfile: 'workspace-write',
    worktreePolicy: 'required',
    branchName: null,
    worktreeStatus: 'pending',
    worktreePath: null,
    worktreeReadyAtIso: null,
    briefing: '',
    ...overrides,
  }
}

function option(overrides: Partial<UiWorkflowImplementationOption> = {}): UiWorkflowImplementationOption {
  return {
    agentId: 'agent-1',
    agentName: 'Agent',
    agentStatus: 'completed',
    worktreeStatus: 'ready',
    branchName: 'feature',
    worktreePath: '/repo-feature',
    comparisonStatus: 'ready_to_merge',
    changedFileCount: 2,
    committedFileCount: 2,
    uncommittedFileCount: 0,
    insertions: 10,
    deletions: 1,
    validationStatus: 'passed',
    validationCommand: 'npm test',
    risks: [],
    summary: '',
    ...overrides,
  }
}

describe('workspace workflow rules', () => {
  it('formats keys and simple status labels', () => {
    expect(workflowAgentKey('run-1', 'agent-1')).toBe('run-1:agent-1')
    expect(workflowValidationKey('run-1', 'test')).toBe('run-1:test')
    expect(workflowDeliveryKey('run-1', 'ready')).toBe('run-1:ready')
    expect(isWorkflowKeyPending('run-1:ready', workflowDeliveryKey('run-1', 'ready'))).toBe(true)
    expect(formatWorkflowStatus('ready_to_merge')).toBe('ready to merge')
  })

  it('reads workflow busy keys consistently', () => {
    const busy = {
      updatingAgentKey: workflowAgentKey('run-1', 'agent-1'),
      provisioningAgentKey: workflowAgentKey('run-2', 'agent-2'),
      applyingImplementationKey: workflowAgentKey('run-3', 'agent-3'),
      discardingImplementationKey: workflowAgentKey('run-4', 'agent-4'),
      runningValidationKey: workflowValidationKey('run-5', 'test'),
      loadingReplayRunId: 'run-6',
      loadingDeliveryRunId: 'run-7',
      updatingDeliveryKey: workflowDeliveryKey('run-8', 'merged'),
    }

    expect(isWorkflowAgentUpdating(busy, 'run-1', 'agent-1')).toBe(true)
    expect(isWorkflowAgentProvisioning(busy, 'run-2', 'agent-2')).toBe(true)
    expect(isWorkflowImplementationApplying(busy, 'run-3', 'agent-3')).toBe(true)
    expect(isWorkflowImplementationDiscarding(busy, 'run-4', 'agent-4')).toBe(true)
    expect(isWorkflowValidationRunning(busy, 'run-5', 'test')).toBe(true)
    expect(isWorkflowReplayLoading(busy, 'run-6')).toBe(true)
    expect(isWorkflowDeliveryLoading(busy, 'run-7')).toBe(true)
    expect(isWorkflowDeliveryUpdating(busy, 'run-8', 'merged')).toBe(true)

    expect(isWorkflowAgentUpdating(busy, 'run-1', 'agent-x')).toBe(false)
    expect(isWorkflowDeliveryUpdating(busy, 'run-8', 'ready')).toBe(false)
  })

  it('summarizes workflow panel and button state', () => {
    expect(workspaceWorkflowSummary({
      isLoading: true,
      runCount: 0,
      templateCount: 2,
    })).toBe('Loading workflow templates and runs.')
    expect(workspaceWorkflowSummary({
      isLoading: false,
      runCount: 0,
      templateCount: 2,
    })).toBe('2 templates ready for supervised agent work.')
    expect(workspaceWorkflowSummary({
      isLoading: false,
      runCount: 1,
      templateCount: 2,
    })).toBe('1 run · 2 templates')
    expect(workspaceWorkflowSummary({
      isLoading: false,
      runCount: 3,
      templateCount: 2,
    })).toBe('3 runs · 2 templates')
    expect(workflowCreateButtonLabel(true)).toBe('Creating')
    expect(workflowCreateButtonLabel(false)).toBe('Create run')
    expect(canCreateWorkflowRun({
      cwd: '/repo',
      selectedTemplateId: 'template-1',
      goalDraft: 'Ship it',
      isCreating: false,
    })).toBe(true)
    expect(canCreateWorkflowRun({
      cwd: ' ',
      selectedTemplateId: 'template-1',
      goalDraft: 'Ship it',
      isCreating: false,
    })).toBe(false)
    expect(canCreateWorkflowRun({
      cwd: '/repo',
      selectedTemplateId: '',
      goalDraft: 'Ship it',
      isCreating: false,
    })).toBe(false)
    expect(canCreateWorkflowRun({
      cwd: '/repo',
      selectedTemplateId: 'template-1',
      goalDraft: ' ',
      isCreating: false,
    })).toBe(false)
    expect(canCreateWorkflowRun({
      cwd: '/repo',
      selectedTemplateId: 'template-1',
      goalDraft: 'Ship it',
      isCreating: true,
    })).toBe(false)
    expect(workflowReplayButtonLabel({ isLoading: true, isExpanded: false })).toBe('Loading')
    expect(workflowReplayButtonLabel({ isLoading: false, isExpanded: true })).toBe('Hide replay')
    expect(workflowDeliveryButtonLabel({ isLoading: true, hasDraft: false })).toBe('Generating')
    expect(workflowDeliveryButtonLabel({ isLoading: false, hasDraft: true })).toBe('Refresh delivery')
    expect(workflowDeliveryReadyButtonLabel(true)).toBe('Marking')
    expect(workflowDeliveryReadyButtonLabel(false)).toBe('Ready merge')
    expect(workflowDeliveryMergedButtonLabel(true)).toBe('Marking')
    expect(workflowDeliveryMergedButtonLabel(false)).toBe('Mark merged')
  })

  it('builds workflow display summaries', () => {
    const workflowRun = run({
      agents: [agent()],
      validationPlan: ['test: npm test', 'build: npm run build'],
      dirtyFileCount: 3,
      appliedImplementation: {
        agentId: 'agent-1',
        agentName: 'Agent',
        branchName: 'feature',
        worktreePath: '/repo-feature',
        appliedAtIso: '2026-07-07T00:00:00.000Z',
        patchBytes: 123,
        changedFileCount: 2,
        checkpointId: 'checkpoint-1',
      },
      acceptance: {
        status: 'ready_for_review',
        label: 'Ready',
        summary: '',
        validationStatus: 'passed',
        validationCommand: 'npm test',
        requiredValidationCount: 1,
        completedAgentCount: 1,
        totalAgentCount: 1,
        readyImplementationOptionCount: 1,
        totalImplementationOptionCount: 1,
        risks: ['accept-1', 'accept-2', 'accept-3', 'accept-4', 'accept-5'],
      },
      warnings: ['warn-1', 'warn-2', 'warn-3', 'warn-4', 'warn-5'],
      deliveryState: {
        readyToMergeAtIso: '2026-07-07T00:00:00.000Z',
        mergedAtIso: null,
        commitHash: 'abcdef1234567890',
        pullRequestUrl: null,
        note: '',
      },
    })

    expect(workflowRunMetaLabels(workflowRun)).toEqual([
      new Date(workflowRun.createdAtIso).toLocaleString(),
      '1 agents',
      '2 checks',
      '3 dirty files',
    ])
    expect(workflowTemplateMetaLabels({ agentCount: 2, defaultStatus: 'ready_to_merge' })).toEqual([
      '2 agents',
      'ready to merge',
    ])
    expect(workflowAppliedImplementationSummary(workflowRun)).toBe('Applied Agent · 2 files · checkpoint checkpoint-1')
    expect(workflowAppliedImplementationSummary(run())).toBe('')
    expect(workflowDeliveryStateSummary(workflowRun)).toBe('Delivery running · abcdef123456')
    expect(workflowDeliveryStateSummary(run({ deliveryState: { ...workflowRun.deliveryState!, commitHash: null } }))).toBe('Delivery running · no commit')
    expect(workflowDeliveryStateSummary(run())).toBe('')
    expect(workflowPreviewItems(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
    expect(workflowPreviewItems(['a', 'b'], -1)).toEqual([])
    expect(workflowRunWarningsPreview(workflowRun)).toEqual(['warn-1', 'warn-2', 'warn-3', 'warn-4'])
    expect(workflowAcceptanceRisksPreview(workflowRun)).toEqual(['accept-1', 'accept-2', 'accept-3', 'accept-4'])
    expect(workflowAcceptanceRisksPreview(run())).toEqual([])
    expect(workflowImplementationRisksPreview(option({
      risks: ['risk-1', 'risk-2', 'risk-3', 'risk-4', 'risk-5'],
    }))).toEqual(['risk-1', 'risk-2', 'risk-3', 'risk-4'])
    expect(workflowDeliveryRiskSummaryPreview({
      riskSummary: ['delivery-1', 'delivery-2', 'delivery-3', 'delivery-4', 'delivery-5', 'delivery-6'],
    } as UiWorkflowDeliveryDraft)).toEqual(['delivery-1', 'delivery-2', 'delivery-3', 'delivery-4', 'delivery-5'])
    expect(workflowDeliveryRiskSummaryPreview(null)).toEqual([])
  })

  it('evaluates delivery readiness from acceptance state', () => {
    const accepted = run({ acceptance: {
      status: 'accepted',
      label: 'Accepted',
      summary: '',
      validationStatus: 'passed',
      validationCommand: 'npm test',
      requiredValidationCount: 1,
      completedAgentCount: 1,
      totalAgentCount: 1,
      readyImplementationOptionCount: 1,
      totalImplementationOptionCount: 1,
      risks: [],
    } })

    expect(workflowAcceptanceGreen(accepted)).toBe(true)
    expect(canMarkReadyToMerge(accepted)).toBe(true)
    expect(canMarkMerged(accepted)).toBe(true)
    expect(canMarkReadyToMerge(run({ ...accepted, status: 'merged' }))).toBe(false)
    expect(canMarkMerged(run({ status: 'ready_to_merge' }))).toBe(true)
  })

  it('keeps agent action rules explicit', () => {
    expect(canStartWorkflowAgent('ready')).toBe(true)
    expect(canStartWorkflowAgent('queued')).toBe(false)
    expect(canCompleteWorkflowAgent('blocked')).toBe(true)
    expect(canCompleteWorkflowAgent('skipped')).toBe(false)
    expect(canBlockWorkflowAgent('running')).toBe(true)
    expect(canBlockWorkflowAgent('completed')).toBe(false)
    expect(canSkipWorkflowAgent('queued')).toBe(true)
    expect(canSkipWorkflowAgent('completed')).toBe(false)
  })

  it('labels worktree state from status and policy', () => {
    expect(workflowWorktreeLabel(agent({ worktreeStatus: 'ready' }))).toBe('ready')
    expect(workflowWorktreeLabel(agent({ worktreeStatus: 'failed' }))).toBe('failed')
    expect(workflowWorktreeLabel(agent({ worktreePolicy: 'not-needed', worktreeStatus: 'not_required' }))).toBe('not needed')
    expect(workflowWorktreeLabel(agent({ worktreePolicy: 'recommended' }))).toBe('recommended')
  })

  it('extracts runnable validation scripts and skips dev commands', () => {
    expect(isRunnableValidationScriptName('typecheck')).toBe(true)
    expect(isRunnableValidationScriptName('preview')).toBe(false)

    expect(runnableValidationOptions(run({
      validationPlan: [
        'test: npm test',
        'dev: npm run dev',
        'typecheck: npm run typecheck',
        'test: duplicate',
        'not a script',
      ],
    }))).toEqual([
      { scriptName: 'test', command: 'npm test' },
      { scriptName: 'typecheck', command: 'npm run typecheck' },
    ])
  })

  it('summarizes and labels implementation options', () => {
    const readyOption = option()
    const blockedOption = option({ agentId: 'agent-2', comparisonStatus: 'validation_failed' })
    const discardedOption = option({ agentId: 'agent-3', comparisonStatus: 'discarded' })
    const workflowRun = run({ implementationOptions: [readyOption, blockedOption, discardedOption] })

    expect(workflowImplementationOptionsSummary(workflowRun)).toBe('3 options · 1 ready · 1 gated')
    expect(workflowImplementationDiffLabel(readyOption)).toBe('+10 / -1')
    expect(canApplyWorkflowImplementation(workflowRun, readyOption)).toBe(true)
    expect(canDiscardWorkflowImplementation(workflowRun, discardedOption)).toBe(false)
    expect(hasWorkflowImplementationActions(workflowRun, discardedOption)).toBe(true)
    expect(workflowImplementationApplyLabel(workflowRun, readyOption, true)).toBe('Applying')
    expect(workflowImplementationDiscardLabel(workflowRun, discardedOption, false)).toBe('Discarded')

    const appliedRun = run({ appliedImplementation: {
      agentId: 'agent-1',
      agentName: 'Agent',
      branchName: 'feature',
      worktreePath: '/repo-feature',
      appliedAtIso: '2026-07-07T00:00:00.000Z',
      patchBytes: 123,
      changedFileCount: 2,
      checkpointId: 'checkpoint-1',
    } })

    expect(canApplyWorkflowImplementation(appliedRun, readyOption)).toBe(false)
    expect(workflowImplementationApplyLabel(appliedRun, option({ agentId: 'agent-2' }), false)).toBe('Apply locked')
    expect(workflowImplementationDiscardLabel(appliedRun, readyOption, false)).toBe('Applied')
  })

  it('labels agent, validation, and replay details', () => {
    expect(workflowAgentWorktreeButtonLabel({
      worktreeStatus: 'pending',
      isProvisioning: true,
    })).toBe('Provisioning')
    expect(workflowAgentWorktreeButtonLabel({
      worktreeStatus: 'ready',
      isProvisioning: false,
    })).toBe('Worktree ready')
    expect(workflowAgentWorktreeButtonLabel({
      worktreeStatus: 'pending',
      isProvisioning: false,
    })).toBe('Provision worktree')
    expect(workflowValidationRunButtonLabel('test', true)).toBe('Running')
    expect(workflowValidationRunButtonLabel('test', false)).toBe('Run test')
    expect(workflowValidationResultLabel({ command: 'npm test', status: 'passed' })).toBe('npm test -> passed')

    expect(workflowReplayAgentSnapshotLabel({
      id: 'agent-1',
      agentName: 'Agent',
      role: 'implementation',
      status: 'completed',
      worktreeStatus: 'ready',
      branchName: 'feature',
      worktreePath: '/repo-feature',
    })).toBe('Agent · completed · ready')
    expect(workflowReplayEventMetaLabel({
      id: 'event-1',
      createdAtIso: '2026-07-07T00:00:00.000Z',
      kind: 'validation',
      severity: 'info',
      title: 'Validated',
      summary: 'Passed',
      agentId: 'agent-1',
      agentName: 'Agent',
      metadata: {},
    })).toBe('Agent · validation')
    expect(workflowReplayEventMetaLabel({
      id: 'event-2',
      createdAtIso: '2026-07-07T00:00:00.000Z',
      kind: 'delivery',
      severity: 'info',
      title: 'Delivered',
      summary: 'Ready',
      agentId: null,
      agentName: null,
      metadata: {},
    })).toBe('delivery')
  })

  it('updates workflow panel state maps immutably', () => {
    const first = run({ id: 'run-1', goal: 'First' })
    const second = run({ id: 'run-2', goal: 'Second' })
    const updatedSecond = run({ id: 'run-2', goal: 'Updated' })

    expect(replaceWorkflowRun([first, second], updatedSecond)).toEqual([first, updatedSecond])
    expect(prependWorkflowRun([first, second], updatedSecond, 2)).toEqual([updatedSecond, first])
    expect(prependWorkflowRun([first], run({ id: 'run-3' }), 0)).toEqual([])

    const replay: UiWorkflowReplay = {
      cwd: '/repo',
      repoRoot: '/repo',
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      run: first,
      events: [],
      agentSnapshots: [],
      validationEvidence: {
        totalRuns: 0,
        matchedRuns: 0,
        latestStatus: null,
        latestCommand: null,
        latestEndedAtIso: null,
      },
      evidenceSummary: [],
    }
    expect(setWorkflowReplayForRun({}, 'run-1', replay)).toEqual({ 'run-1': replay })

    const draft: UiWorkflowDeliveryDraft = {
      cwd: '/repo',
      repoRoot: '/repo',
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      runId: 'run-1',
      templateName: 'Default',
      goal: 'Ship',
      status: 'running',
      title: 'Title',
      body: 'Body',
      commitMessage: 'Commit',
      reviewDraft: {
        cwd: '/repo',
        repoRoot: '/repo',
        branch: 'feature',
        upstream: 'origin/feature',
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        hasStagedChanges: false,
        fileCount: 0,
        insertions: 0,
        deletions: 0,
        stat: '',
        commitMessage: 'Commit',
        prBody: 'Review',
        riskSummary: [],
        validationPlan: [],
        source: 'workspace_diff',
        hasReviewChanges: false,
        files: [],
        untrackedFiles: [],
        warnings: [],
      },
      acceptance: null,
      appliedImplementation: null,
      discardedImplementations: [],
      validationEvidence: replay.validationEvidence,
      riskSummary: [],
      warnings: [],
    }
    expect(setWorkflowDeliveryDraftForRun({}, 'run-1', draft)).toEqual({ 'run-1': draft })
    expect(setWorkflowRunError({ existing: 'keep' }, 'run-1', 'failed')).toEqual({
      existing: 'keep',
      'run-1': 'failed',
    })
    expect(setWorkflowValidationResult({}, 'run-1', { command: 'npm test', status: 'passed' })).toEqual({
      'run-1': { command: 'npm test', status: 'passed' },
    })
    expect(emptyWorkflowPanelState()).toMatchObject({
      runs: [],
      selectedTemplateId: '',
      expandedReplayRunId: '',
      replaysByRunId: {},
      replayErrors: {},
      deliveryDraftsByRunId: {},
      deliveryErrors: {},
      validationResults: {},
      errorMessage: '',
    })
  })
})
