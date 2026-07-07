import type {
  UiWorkflowAgentStep,
  UiWorkflowImplementationOption,
  UiWorkflowRun,
  UiWorkflowStepStatus,
} from '../types/codex'

export type WorkflowValidationOption = {
  scriptName: string
  command: string
}

export function formatWorkflowTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function formatWorkflowStatus(value: string): string {
  return value.replace(/_/gu, ' ')
}

export function workflowAgentKey(runId: string, agentId: string): string {
  return `${runId}:${agentId}`
}

export function workflowValidationKey(runId: string, scriptName: string): string {
  return `${runId}:${scriptName}`
}

export function workflowDeliveryKey(runId: string, action: 'ready' | 'merged'): string {
  return `${runId}:${action}`
}

export function isWorkflowKeyPending(currentKey: string, expectedKey: string): boolean {
  return currentKey === expectedKey
}

export function workspaceWorkflowSummary(input: {
  isLoading: boolean
  runCount: number
  templateCount: number
}): string {
  if (input.isLoading) return 'Loading workflow templates and runs.'
  if (input.runCount === 0) return `${String(input.templateCount)} templates ready for supervised agent work.`
  return `${String(input.runCount)} run${input.runCount === 1 ? '' : 's'} · ${String(input.templateCount)} templates`
}

export function workflowReplayButtonLabel(input: {
  isLoading: boolean
  isExpanded: boolean
}): string {
  if (input.isLoading) return 'Loading'
  return input.isExpanded ? 'Hide replay' : 'Replay'
}

export function workflowDeliveryButtonLabel(input: {
  isLoading: boolean
  hasDraft: boolean
}): string {
  if (input.isLoading) return 'Generating'
  return input.hasDraft ? 'Refresh delivery' : 'Delivery'
}

export function workflowAcceptanceGreen(run: UiWorkflowRun): boolean {
  return run.acceptance?.status === 'accepted' || run.acceptance?.status === 'ready_for_review'
}

export function canMarkReadyToMerge(run: UiWorkflowRun): boolean {
  return workflowAcceptanceGreen(run) && run.status !== 'ready_to_merge' && run.status !== 'merged'
}

export function canMarkMerged(run: UiWorkflowRun): boolean {
  return (workflowAcceptanceGreen(run) || run.status === 'ready_to_merge') && run.status !== 'merged'
}

export function workflowWorktreeLabel(agent: UiWorkflowAgentStep): string {
  if (agent.worktreeStatus === 'ready') return 'ready'
  if (agent.worktreeStatus === 'failed') return 'failed'
  if (agent.worktreePolicy === 'not-needed') return 'not needed'
  return agent.worktreePolicy
}

export function canStartWorkflowAgent(status: UiWorkflowStepStatus): boolean {
  return status === 'ready'
}

export function canCompleteWorkflowAgent(status: UiWorkflowStepStatus): boolean {
  return status === 'ready' || status === 'running' || status === 'blocked'
}

export function canBlockWorkflowAgent(status: UiWorkflowStepStatus): boolean {
  return status === 'ready' || status === 'running'
}

export function canSkipWorkflowAgent(status: UiWorkflowStepStatus): boolean {
  return status === 'queued' || status === 'ready' || status === 'running' || status === 'blocked'
}

export function isRunnableValidationScriptName(scriptName: string): boolean {
  return /(^|[:_-])(test|spec|lint|typecheck|type-check|build)($|[:_-])/iu.test(scriptName) &&
    !/(^|[:_-])(dev|preview|serve|start)($|[:_-])/iu.test(scriptName)
}

export function runnableValidationOptions(run: UiWorkflowRun): WorkflowValidationOption[] {
  const options: WorkflowValidationOption[] = []
  const seen = new Set<string>()
  for (const item of run.validationPlan) {
    const match = item.match(/^([A-Za-z0-9:_-]+):\s+(.+)$/u)
    const scriptName = match?.[1]?.trim() ?? ''
    const command = match?.[2]?.trim() ?? ''
    if (!scriptName || !command || seen.has(scriptName) || !isRunnableValidationScriptName(scriptName)) continue
    seen.add(scriptName)
    options.push({ scriptName, command })
  }
  return options
}

export function workflowImplementationOptions(run: UiWorkflowRun): UiWorkflowImplementationOption[] {
  return run.implementationOptions ?? []
}

export function workflowImplementationOptionsSummary(run: UiWorkflowRun): string {
  const options = workflowImplementationOptions(run)
  const readyCount = options.filter((option) => option.comparisonStatus === 'ready_to_merge').length
  const blockedCount = options.filter((option) =>
    option.comparisonStatus === 'pending_worktree' ||
    option.comparisonStatus === 'validation_missing' ||
    option.comparisonStatus === 'validation_failed'
  ).length
  return `${String(options.length)} option${options.length === 1 ? '' : 's'} · ${String(readyCount)} ready · ${String(blockedCount)} gated`
}

export function canApplyWorkflowImplementation(
  run: UiWorkflowRun,
  option: UiWorkflowImplementationOption,
): boolean {
  return option.comparisonStatus === 'ready_to_merge' && !run.appliedImplementation
}

export function canDiscardWorkflowImplementation(
  run: UiWorkflowRun,
  option: UiWorkflowImplementationOption,
): boolean {
  return option.comparisonStatus !== 'discarded' &&
    run.appliedImplementation?.agentId !== option.agentId
}

export function hasWorkflowImplementationActions(
  run: UiWorkflowRun,
  option: UiWorkflowImplementationOption,
): boolean {
  return option.comparisonStatus === 'ready_to_merge' ||
    option.comparisonStatus === 'discarded' ||
    run.appliedImplementation?.agentId === option.agentId ||
    canDiscardWorkflowImplementation(run, option)
}

export function workflowImplementationApplyLabel(
  run: UiWorkflowRun,
  option: UiWorkflowImplementationOption,
  isApplying: boolean,
): string {
  if (isApplying) return 'Applying'
  if (run.appliedImplementation?.agentId === option.agentId) return 'Applied'
  if (run.appliedImplementation) return 'Apply locked'
  return 'Apply option'
}

export function workflowImplementationDiscardLabel(
  run: UiWorkflowRun,
  option: UiWorkflowImplementationOption,
  isDiscarding: boolean,
): string {
  if (isDiscarding) return 'Discarding'
  if (option.comparisonStatus === 'discarded') return 'Discarded'
  if (run.appliedImplementation?.agentId === option.agentId) return 'Applied'
  return 'Discard option'
}
