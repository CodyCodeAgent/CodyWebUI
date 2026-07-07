import type {
  UiNotificationDeliveryReport,
  UiValidationPlanItem,
  UiWorkspaceConfig,
  UiWorkspaceProjectContext,
  UiWorkspaceScriptRun,
  UiWorkspaceValidationPlan,
} from '../types/codex'

export type WorkspaceScriptRunState = {
  isRunning: boolean
  errorMessage: string
  result: UiWorkspaceScriptRun | null
}

export const EMPTY_WORKSPACE_SCRIPT_RUN_STATE: WorkspaceScriptRunState = {
  isRunning: false,
  errorMessage: '',
  result: null,
}

export function basenameFromPath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) ?? value
}

export function formatWorkspaceDuration(durationMs: number): string {
  if (durationMs < 1000) return `${String(Math.max(0, Math.round(durationMs)))}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

export function workspaceCommandPolicyLabel(config: UiWorkspaceConfig): string {
  const policy = config.commandPolicy
  if (policy.allow.length > 0 && policy.deny.length > 0) {
    return `${String(policy.allow.length)} allowed · ${String(policy.deny.length)} denied`
  }
  if (policy.allow.length > 0) return `${String(policy.allow.length)} allowed`
  if (policy.deny.length > 0) return `${String(policy.deny.length)} denied`
  return 'not configured'
}

export function workspaceValidationPlanSummary(plan: UiWorkspaceValidationPlan | null | undefined): string {
  if (!plan) return 'no plan'
  const parts = [
    `${String(plan.items.length)} items`,
    `${String(plan.coveredCount)} covered`,
    plan.failedCount > 0 ? `${String(plan.failedCount)} failed` : '',
    `${String(plan.missingEvidenceCount)} missing evidence`,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function workspaceProjectContextSummary(context: UiWorkspaceProjectContext | null | undefined): string {
  if (!context) return 'no context'
  const warningCount = context.warnings.length
  return `${String(context.presentCount)} present · ${String(context.sources.length)} tracked${warningCount > 0 ? ` · ${String(warningCount)} gaps` : ''}`
}

export function workspaceNotificationPolicyLabel(config: UiWorkspaceConfig): string {
  const notifications = config.notifications
  if (!notifications.enabled) return 'off'
  const activeChannels = notifications.channels.filter((channel) => channel.enabled).length
  return `${String(activeChannels)} channel${activeChannels === 1 ? '' : 's'}`
}

export function workspaceThemePolicyLabel(config: UiWorkspaceConfig): string {
  const theme = config.theme
  const parts = [
    theme.skinId || '',
    theme.layoutPresetId || '',
    theme.density || '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'personal'
}

export function workspaceNotificationTestSummary(report: UiNotificationDeliveryReport | null): string {
  if (!report) return ''
  if (!report.enabled) return 'Notification delivery is disabled for this workspace.'
  return `${String(report.sentCount)} sent · ${String(report.failedCount)} failed · ${String(report.skippedCount)} skipped`
}

export function isWorkspaceValidationScriptName(name: string): boolean {
  return /\b(test|spec|lint|typecheck|type-check|build|preview|dev|serve)\b/iu.test(name)
}

export function isRunnableValidationScriptName(name: string): boolean {
  const isValidation = /(^|[:_-])(test|spec|lint|typecheck|type-check|build)($|[:_-])/iu.test(name)
  const isLongRunning = /(^|[:_-])(dev|preview|serve|start)($|[:_-])/iu.test(name)
  return isValidation && !isLongRunning
}

export function validationPlanEvidenceLabel(item: UiValidationPlanItem): string {
  const evidence = item.evidence
  if (evidence.status === 'passed' || evidence.status === 'failed' || evidence.status === 'timed_out') {
    const parts = [
      evidence.runAtIso ? `last run ${new Date(evidence.runAtIso).toLocaleString()}` : '',
      evidence.exitCode !== null ? `exit ${String(evidence.exitCode)}` : '',
      evidence.durationMs !== null ? formatWorkspaceDuration(evidence.durationMs) : '',
      evidence.problemCount > 0 ? `${String(evidence.problemCount)} problems` : '',
    ].filter(Boolean)
    return `${evidence.status}${parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}`
  }
  if (evidence.status === 'manual') return 'Manual evidence required.'
  if (evidence.status === 'not_applicable') return 'No command evidence is expected for this item.'
  return item.command ? 'No matching command evidence captured yet.' : 'No runnable command is configured yet.'
}

export function scriptRunOutput(result: UiWorkspaceScriptRun | null): string {
  if (!result) return ''
  const output = result.output.trim()
  return output || 'No output captured.'
}

export function scriptProblemCount(result: UiWorkspaceScriptRun | null): number {
  return result?.problems?.length ?? 0
}

export function scriptRunEvidenceSummary(result: UiWorkspaceScriptRun | null): string[] {
  if (!result) return []
  const items: string[] = []
  const tests = result.testSummary ?? null
  if (tests) {
    const parts = [
      tests.passed !== null ? `${String(tests.passed)} passed` : '',
      tests.failed !== null ? `${String(tests.failed)} failed` : '',
      tests.skipped !== null ? `${String(tests.skipped)} skipped` : '',
      tests.total !== null ? `${String(tests.total)} total` : '',
    ].filter(Boolean)
    if (parts.length > 0) items.push(`tests ${parts.join(' · ')}`)
  }
  const coverage = result.coverageSummary ?? null
  if (coverage) {
    const parts = [
      coverage.statements !== null ? `stmt ${coverage.statements.toFixed(1)}%` : '',
      coverage.branches !== null ? `branch ${coverage.branches.toFixed(1)}%` : '',
      coverage.functions !== null ? `func ${coverage.functions.toFixed(1)}%` : '',
      coverage.lines !== null ? `line ${coverage.lines.toFixed(1)}%` : '',
    ].filter(Boolean)
    if (parts.length > 0) items.push(`coverage ${parts.join(' · ')}`)
  }
  return items
}

export function workspaceScriptRunState(
  states: Record<string, WorkspaceScriptRunState>,
  scriptName: string,
): WorkspaceScriptRunState {
  return states[scriptName] ?? EMPTY_WORKSPACE_SCRIPT_RUN_STATE
}

export function setWorkspaceScriptRunState(
  states: Record<string, WorkspaceScriptRunState>,
  scriptName: string,
  nextState: WorkspaceScriptRunState,
): Record<string, WorkspaceScriptRunState> {
  if (!scriptName) return states
  return {
    ...states,
    [scriptName]: nextState,
  }
}

export function runningWorkspaceScriptState(
  previous: WorkspaceScriptRunState,
): WorkspaceScriptRunState {
  return {
    isRunning: true,
    errorMessage: '',
    result: previous.result,
  }
}

export function completedWorkspaceScriptState(result: UiWorkspaceScriptRun): WorkspaceScriptRunState {
  return {
    isRunning: false,
    errorMessage: '',
    result,
  }
}

export function failedWorkspaceScriptState(
  previous: WorkspaceScriptRunState,
  message: string,
): WorkspaceScriptRunState {
  return {
    isRunning: false,
    errorMessage: message,
    result: previous.result,
  }
}

export function completedWorkspaceScriptRuns(
  states: Record<string, WorkspaceScriptRunState>,
): UiWorkspaceScriptRun[] {
  return Object.values(states)
    .map((state) => state.result)
    .filter((result): result is UiWorkspaceScriptRun => Boolean(result))
}

export function mergedWorkspaceValidationRuns(
  currentRuns: UiWorkspaceScriptRun[],
  historyRuns: UiWorkspaceScriptRun[],
): UiWorkspaceScriptRun[] {
  const seen = new Set<string>()
  const runs: UiWorkspaceScriptRun[] = []
  for (const run of [...currentRuns, ...historyRuns]) {
    const key = `${run.scriptName}:${run.command}:${run.startedAtIso}:${run.endedAtIso}`
    if (seen.has(key)) continue
    seen.add(key)
    runs.push(run)
  }
  return runs.sort((first, second) => second.endedAtIso.localeCompare(first.endedAtIso))
}
