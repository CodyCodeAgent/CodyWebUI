import { buildWorkspaceTaskBoard, type UiWorkspaceTaskRiskLevel } from './useWorkspaceTaskBoard'
import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../types/codex'

export type UiMobileSupervisionTask = {
  id: string
  title: string
  preview: string
  statusLabel: string
  updatedAtIso: string
  inProgress: boolean
  unread: boolean
  riskLabels: Array<{
    label: string
    level: UiWorkspaceTaskRiskLevel
  }>
}

export type UiMobileSupervisionSummary = {
  headline: string
  statusText: string
  primaryTask: UiMobileSupervisionTask | null
  pendingApprovalCount: number
  failedValidationCount: number
  latestValidationStatus: UiWorkspaceScriptRun['status'] | 'none'
  dirtyFileCount: number
  riskCount: number
  canContinue: boolean
  canPause: boolean
  canInterrupt: boolean
  canArchive: boolean
}

function latestValidationRun(runs: UiWorkspaceScriptRun[]): UiWorkspaceScriptRun | null {
  return runs
    .slice()
    .sort((first, second) => second.endedAtIso.localeCompare(first.endedAtIso))
    .at(0) ?? null
}

function riskWeight(level: UiWorkspaceTaskRiskLevel): number {
  return {
    danger: 4,
    warning: 3,
    info: 2,
    neutral: 1,
  }[level]
}

function taskPriority(task: UiMobileSupervisionTask): number {
  const riskScore = task.riskLabels.reduce((sum, risk) => sum + riskWeight(risk.level), 0)
  return (task.inProgress ? 100 : 0) + (task.unread ? 40 : 0) + riskScore
}

export function buildMobileSupervisionSummary(params: {
  threads: UiThread[]
  snapshot: UiWorkspaceSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  pendingRequests: UiServerRequest[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
}): UiMobileSupervisionSummary {
  const board = buildWorkspaceTaskBoard({
    threads: params.threads,
    snapshot: params.snapshot,
    validationRuns: params.validationRuns,
    rateLimitSnapshot: params.rateLimitSnapshot,
    pendingRequests: params.pendingRequests,
    limit: 16,
  })
  const tasks: UiMobileSupervisionTask[] = board.cards.map((card) => {
    const thread = params.threads.find((candidate) => candidate.id === card.id)
    return {
      id: card.id,
      title: card.title,
      preview: card.preview,
      statusLabel: card.statusLabel,
      updatedAtIso: card.updatedAtIso,
      inProgress: thread?.inProgress === true,
      unread: thread?.unread === true,
      riskLabels: card.risks,
    }
  })
  const primaryTask = tasks
    .slice()
    .sort((first, second) => taskPriority(second) - taskPriority(first) || second.updatedAtIso.localeCompare(first.updatedAtIso))
    .at(0) ?? null
  const latestRun = latestValidationRun(params.validationRuns)
  const failedValidationCount = params.validationRuns.filter((run) => run.status !== 'passed').length
  const dirtyFileCount = params.snapshot?.gitStatus.dirtyFileCount ?? 0
  const riskCount = (primaryTask?.riskLabels.filter((risk) => risk.level === 'danger' || risk.level === 'warning').length ?? 0) +
    params.pendingRequests.length +
    failedValidationCount

  const headline = params.pendingRequests.length > 0
    ? 'Approval needed'
    : primaryTask?.inProgress
      ? 'Agent running'
      : failedValidationCount > 0
        ? 'Validation risk'
        : primaryTask
          ? 'Ready to supervise'
          : 'No active task'

  return {
    headline,
    statusText: [
      `${String(params.pendingRequests.length)} approvals`,
      `${String(failedValidationCount)} failed validations`,
      `${String(dirtyFileCount)} dirty files`,
    ].join(' · '),
    primaryTask,
    pendingApprovalCount: params.pendingRequests.length,
    failedValidationCount,
    latestValidationStatus: latestRun?.status ?? 'none',
    dirtyFileCount,
    riskCount,
    canContinue: Boolean(primaryTask),
    canPause: primaryTask?.inProgress === true,
    canInterrupt: primaryTask?.inProgress === true,
    canArchive: Boolean(primaryTask),
  }
}
