import { describe, expect, it } from 'vitest'
import type {
  UiWorkflowAgentStep,
  UiWorkflowImplementationOption,
  UiWorkflowRun,
} from '../types/codex'
import {
  canApplyWorkflowImplementation,
  canBlockWorkflowAgent,
  canCompleteWorkflowAgent,
  canDiscardWorkflowImplementation,
  canMarkMerged,
  canMarkReadyToMerge,
  canSkipWorkflowAgent,
  canStartWorkflowAgent,
  formatWorkflowStatus,
  hasWorkflowImplementationActions,
  isRunnableValidationScriptName,
  runnableValidationOptions,
  workflowAcceptanceGreen,
  workflowAgentKey,
  workflowImplementationApplyLabel,
  workflowImplementationDiscardLabel,
  workflowImplementationOptionsSummary,
  workflowValidationKey,
  workflowWorktreeLabel,
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
    expect(formatWorkflowStatus('ready_to_merge')).toBe('ready to merge')
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
})
