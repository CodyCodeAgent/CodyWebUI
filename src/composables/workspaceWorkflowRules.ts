import type {
  UiWorkflowAgentStep,
  UiWorkflowDeliveryDraft,
  UiWorkflowImplementationOption,
  UiWorkflowReplay,
  UiWorkflowRun,
  UiWorkflowStepStatus,
} from '../types/codex'

export type WorkflowValidationOption = {
  scriptName: string
  command: string
}

export type WorkflowValidationResultSummary = {
  command: string
  status: string
}

export type EmptyWorkflowPanelState = {
  runs: UiWorkflowRun[]
  selectedTemplateId: string
  expandedReplayRunId: string
  replaysByRunId: Record<string, UiWorkflowReplay>
  replayErrors: Record<string, string>
  deliveryDraftsByRunId: Record<string, UiWorkflowDeliveryDraft>
  deliveryErrors: Record<string, string>
  validationResults: Record<string, WorkflowValidationResultSummary>
  errorMessage: string
}

export type WorkflowBusyKeys = {
  updatingAgentKey: string
  provisioningAgentKey: string
  applyingImplementationKey: string
  discardingImplementationKey: string
  runningValidationKey: string
  loadingReplayRunId: string
  loadingDeliveryRunId: string
  updatingDeliveryKey: string
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

export function isWorkflowAgentUpdating(
  busy: Pick<WorkflowBusyKeys, 'updatingAgentKey'>,
  runId: string,
  agentId: string,
): boolean {
  return isWorkflowKeyPending(busy.updatingAgentKey, workflowAgentKey(runId, agentId))
}

export function isWorkflowAgentProvisioning(
  busy: Pick<WorkflowBusyKeys, 'provisioningAgentKey'>,
  runId: string,
  agentId: string,
): boolean {
  return isWorkflowKeyPending(busy.provisioningAgentKey, workflowAgentKey(runId, agentId))
}

export function isWorkflowImplementationApplying(
  busy: Pick<WorkflowBusyKeys, 'applyingImplementationKey'>,
  runId: string,
  agentId: string,
): boolean {
  return isWorkflowKeyPending(busy.applyingImplementationKey, workflowAgentKey(runId, agentId))
}

export function isWorkflowImplementationDiscarding(
  busy: Pick<WorkflowBusyKeys, 'discardingImplementationKey'>,
  runId: string,
  agentId: string,
): boolean {
  return isWorkflowKeyPending(busy.discardingImplementationKey, workflowAgentKey(runId, agentId))
}

export function isWorkflowValidationRunning(
  busy: Pick<WorkflowBusyKeys, 'runningValidationKey'>,
  runId: string,
  scriptName: string,
): boolean {
  return isWorkflowKeyPending(busy.runningValidationKey, workflowValidationKey(runId, scriptName))
}

export function isWorkflowReplayLoading(
  busy: Pick<WorkflowBusyKeys, 'loadingReplayRunId'>,
  runId: string,
): boolean {
  return busy.loadingReplayRunId === runId
}

export function isWorkflowDeliveryLoading(
  busy: Pick<WorkflowBusyKeys, 'loadingDeliveryRunId'>,
  runId: string,
): boolean {
  return busy.loadingDeliveryRunId === runId
}

export function isWorkflowDeliveryUpdating(
  busy: Pick<WorkflowBusyKeys, 'updatingDeliveryKey'>,
  runId: string,
  action: 'ready' | 'merged',
): boolean {
  return isWorkflowKeyPending(busy.updatingDeliveryKey, workflowDeliveryKey(runId, action))
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

export function workflowDeliveryReadyButtonLabel(isUpdating: boolean): string {
  return isUpdating ? 'Marking' : 'Ready merge'
}

export function workflowDeliveryMergedButtonLabel(isUpdating: boolean): string {
  return isUpdating ? 'Marking' : 'Mark merged'
}

export function workflowRunMetaLabels(run: UiWorkflowRun): string[] {
  return [
    formatWorkflowTime(run.createdAtIso),
    `${String(run.agents.length)} agents`,
    `${String(run.validationPlan.length)} checks`,
    `${String(run.dirtyFileCount)} dirty files`,
  ]
}

export function workflowTemplateMetaLabels(input: {
  agentCount: number
  defaultStatus: string
}): string[] {
  return [
    `${String(input.agentCount)} agents`,
    formatWorkflowStatus(input.defaultStatus),
  ]
}

export function workflowAppliedImplementationSummary(run: UiWorkflowRun): string {
  if (!run.appliedImplementation) return ''
  return `Applied ${run.appliedImplementation.agentName} · ${String(run.appliedImplementation.changedFileCount)} files · checkpoint ${run.appliedImplementation.checkpointId}`
}

export function workflowDeliveryStateSummary(run: UiWorkflowRun): string {
  if (!run.deliveryState) return ''
  const commitLabel = run.deliveryState.commitHash ? run.deliveryState.commitHash.slice(0, 12) : 'no commit'
  return `Delivery ${formatWorkflowStatus(run.status)} · ${commitLabel}`
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

export function workflowImplementationDiffLabel(option: UiWorkflowImplementationOption): string {
  return `+${String(option.insertions)} / -${String(option.deletions)}`
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

export function workflowAgentWorktreeButtonLabel(input: {
  worktreeStatus: UiWorkflowAgentStep['worktreeStatus']
  isProvisioning: boolean
}): string {
  if (input.isProvisioning) return 'Provisioning'
  return input.worktreeStatus === 'ready' ? 'Worktree ready' : 'Provision worktree'
}

export function workflowValidationRunButtonLabel(scriptName: string, isRunning: boolean): string {
  return isRunning ? 'Running' : `Run ${scriptName}`
}

export function workflowValidationResultLabel(result: WorkflowValidationResultSummary): string {
  return `${result.command} -> ${result.status}`
}

export function workflowReplayAgentSnapshotLabel(agent: UiWorkflowReplay['agentSnapshots'][number]): string {
  return `${agent.agentName} · ${agent.status} · ${formatWorkflowStatus(agent.worktreeStatus)}`
}

export function workflowReplayEventMetaLabel(event: UiWorkflowReplay['events'][number]): string {
  return event.agentName ? `${event.agentName} · ${event.kind}` : event.kind
}

export function replaceWorkflowRun(runs: UiWorkflowRun[], run: UiWorkflowRun): UiWorkflowRun[] {
  return runs.map((candidate) => candidate.id === run.id ? run : candidate)
}

export function prependWorkflowRun(runs: UiWorkflowRun[], run: UiWorkflowRun, limit: number): UiWorkflowRun[] {
  return [run, ...runs.filter((candidate) => candidate.id !== run.id)].slice(0, Math.max(limit, 0))
}

export function setWorkflowReplayForRun(
  replaysByRunId: Record<string, UiWorkflowReplay>,
  runId: string,
  replay: UiWorkflowReplay,
): Record<string, UiWorkflowReplay> {
  return { ...replaysByRunId, [runId]: replay }
}

export function setWorkflowDeliveryDraftForRun(
  draftsByRunId: Record<string, UiWorkflowDeliveryDraft>,
  runId: string,
  draft: UiWorkflowDeliveryDraft,
): Record<string, UiWorkflowDeliveryDraft> {
  return { ...draftsByRunId, [runId]: draft }
}

export function setWorkflowRunError(
  errorsByRunId: Record<string, string>,
  runId: string,
  message: string,
): Record<string, string> {
  return { ...errorsByRunId, [runId]: message }
}

export function setWorkflowValidationResult(
  resultsByRunId: Record<string, WorkflowValidationResultSummary>,
  runId: string,
  result: WorkflowValidationResultSummary,
): Record<string, WorkflowValidationResultSummary> {
  return { ...resultsByRunId, [runId]: result }
}

export function emptyWorkflowPanelState(): EmptyWorkflowPanelState {
  return {
    runs: [],
    selectedTemplateId: '',
    expandedReplayRunId: '',
    replaysByRunId: {},
    replayErrors: {},
    deliveryDraftsByRunId: {},
    deliveryErrors: {},
    validationResults: {},
    errorMessage: '',
  }
}
