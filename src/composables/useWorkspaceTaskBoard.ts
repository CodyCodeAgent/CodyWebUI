import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiValidationPlanItem,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../types/codex'

export type UiWorkspaceTaskStatus =
  | 'coding'
  | 'waiting_for_approval'
  | 'testing'
  | 'failed'
  | 'ready_for_review'
  | 'queued'
export type UiWorkspaceTaskRiskLevel = 'neutral' | 'info' | 'warning' | 'danger'

export type UiWorkspaceTaskRisk = {
  label: string
  level: UiWorkspaceTaskRiskLevel
}

export type UiWorkspaceValidationGate = {
  status: 'clear' | 'missing_required' | 'failed_required' | 'manual_required' | 'not_configured'
  requiredCount: number
  coveredRequiredCount: number
  missingRequiredCount: number
  failedRequiredCount: number
  manualRequiredCount: number
  recommendedMissingCount: number
}

export type UiWorkspaceTaskCard = {
  id: string
  title: string
  preview: string
  updatedAtIso: string
  status: UiWorkspaceTaskStatus
  statusLabel: string
  risks: UiWorkspaceTaskRisk[]
  validationGate: UiWorkspaceValidationGate
}

export type UiWorkspaceTaskLane = {
  status: UiWorkspaceTaskStatus
  label: string
  cards: UiWorkspaceTaskCard[]
}

export type UiWorkspaceTaskBoard = {
  cards: UiWorkspaceTaskCard[]
  lanes: UiWorkspaceTaskLane[]
  summary: {
    totalCount: number
    codingCount: number
    waitingApprovalCount: number
    testingCount: number
    failedCount: number
    readyForReviewCount: number
    queuedCount: number
    failedValidationCount: number
    missingRequiredValidationCount: number
    warningCount: number
  }
}

const LANE_LABELS: Record<UiWorkspaceTaskStatus, string> = {
  coding: 'Coding',
  waiting_for_approval: 'Approval',
  testing: 'Testing',
  failed: 'Failed',
  ready_for_review: 'Ready',
  queued: 'Recent',
}

function latestValidationRun(runs: UiWorkspaceScriptRun[]): UiWorkspaceScriptRun | null {
  return runs
    .slice()
    .sort((first, second) => second.endedAtIso.localeCompare(first.endedAtIso))
    .at(0) ?? null
}

function highRateLimitRisk(snapshot: UiRateLimitSnapshot | null): UiWorkspaceTaskRisk | null {
  const usedPercent = snapshot?.primary?.usedPercent
  if (typeof usedPercent !== 'number') return null
  if (usedPercent >= 90) return { label: `Rate ${String(Math.round(usedPercent))}%`, level: 'danger' }
  if (usedPercent >= 75) return { label: `Rate ${String(Math.round(usedPercent))}%`, level: 'warning' }
  return null
}

function isStale(updatedAtIso: string): boolean {
  const updatedAt = new Date(updatedAtIso).getTime()
  if (!Number.isFinite(updatedAt)) return false
  const ageMs = Date.now() - updatedAt
  return ageMs > 3 * 24 * 60 * 60 * 1000
}

function itemIsMissingRequired(item: UiValidationPlanItem): boolean {
  return (
    item.priority === 'required' &&
    (item.status === 'ready' || item.status === 'blocked' || item.evidence.status === 'missing')
  )
}

export function buildWorkspaceValidationGate(snapshot: UiWorkspaceSnapshot | null): UiWorkspaceValidationGate {
  const items = snapshot?.validationPlan.items ?? []
  const requiredItems = items.filter((item) => item.priority === 'required')
  const failedRequiredCount = requiredItems.filter((item) => item.status === 'failed').length
  const manualRequiredCount = requiredItems.filter((item) => item.status === 'manual').length
  const missingRequiredCount = requiredItems.filter(itemIsMissingRequired).length
  const coveredRequiredCount = requiredItems.filter((item) => item.status === 'covered').length
  const recommendedMissingCount = items.filter((item) =>
    item.priority === 'recommended' &&
    (item.status === 'ready' || item.status === 'blocked' || item.evidence.status === 'missing')
  ).length

  let status: UiWorkspaceValidationGate['status'] = 'clear'
  if (items.length === 0 || requiredItems.length === 0) status = 'not_configured'
  else if (failedRequiredCount > 0) status = 'failed_required'
  else if (missingRequiredCount > 0) status = 'missing_required'
  else if (manualRequiredCount > 0) status = 'manual_required'

  return {
    status,
    requiredCount: requiredItems.length,
    coveredRequiredCount,
    missingRequiredCount,
    failedRequiredCount,
    manualRequiredCount,
    recommendedMissingCount,
  }
}

function latestRunFailed(runs: UiWorkspaceScriptRun[] = []): boolean {
  const latestRun = latestValidationRun(runs)
  return Boolean(latestRun && latestRun.status !== 'passed')
}

export function deriveWorkspaceTaskStatus(
  thread: UiThread,
  snapshot: UiWorkspaceSnapshot | null,
  params: {
    pendingRequests?: UiServerRequest[]
    validationRuns?: UiWorkspaceScriptRun[]
  } = {},
): UiWorkspaceTaskStatus {
  if (thread.inProgress) return 'coding'
  if ((params.pendingRequests?.length ?? 0) > 0) return 'waiting_for_approval'

  const gate = buildWorkspaceValidationGate(snapshot)
  if (gate.failedRequiredCount > 0 || latestRunFailed(params.validationRuns)) return 'failed'

  const needsReview = thread.unread || (snapshot?.gitStatus.dirtyFileCount ?? 0) > 0
  if (needsReview) {
    if (gate.missingRequiredCount > 0 || gate.manualRequiredCount > 0) return 'testing'
    return 'ready_for_review'
  }

  return 'queued'
}

export function deriveWorkspaceTaskRisks(params: {
  thread: UiThread
  snapshot: UiWorkspaceSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
  pendingRequests?: UiServerRequest[]
}): UiWorkspaceTaskRisk[] {
  const risks: UiWorkspaceTaskRisk[] = []
  const latestRun = latestValidationRun(params.validationRuns)
  const problemCount = latestRun?.problems.length ?? 0
  const dirtyFileCount = params.snapshot?.gitStatus.dirtyFileCount ?? 0
  const warningCount = params.snapshot?.warnings.length ?? 0
  const gate = buildWorkspaceValidationGate(params.snapshot)

  if (params.thread.inProgress) {
    risks.push({ label: 'Agent running', level: 'info' })
  }
  if ((params.pendingRequests?.length ?? 0) > 0) {
    risks.push({ label: `${String(params.pendingRequests?.length ?? 0)} approvals`, level: 'warning' })
  }
  if (gate.failedRequiredCount > 0) {
    risks.push({ label: 'Validation gate failed', level: 'danger' })
  }
  if (gate.missingRequiredCount > 0) {
    risks.push({ label: `${String(gate.missingRequiredCount)} required checks missing`, level: 'warning' })
  }
  if (gate.manualRequiredCount > 0) {
    risks.push({ label: `${String(gate.manualRequiredCount)} manual checks`, level: 'warning' })
  }
  if (gate.status === 'not_configured') {
    risks.push({ label: 'No required validation gate', level: 'warning' })
  }
  if (latestRun && latestRun.status !== 'passed') {
    risks.push({ label: `Validation ${latestRun.status}`, level: 'danger' })
  }
  if (problemCount > 0) {
    risks.push({ label: `${String(problemCount)} problems`, level: 'danger' })
  }
  if (dirtyFileCount > 0) {
    risks.push({ label: `${String(dirtyFileCount)} dirty files`, level: 'warning' })
  }
  if (warningCount > 0) {
    risks.push({ label: `${String(warningCount)} safety warnings`, level: 'warning' })
  }

  const rateRisk = highRateLimitRisk(params.rateLimitSnapshot)
  if (rateRisk) risks.push(rateRisk)

  if (isStale(params.thread.updatedAtIso)) {
    risks.push({ label: 'Stale', level: 'neutral' })
  }
  if (risks.length === 0) {
    risks.push({ label: 'No open risks', level: 'neutral' })
  }

  return risks.slice(0, 8)
}

export function buildWorkspaceTaskBoard(params: {
  threads: UiThread[]
  snapshot: UiWorkspaceSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
  pendingRequests?: UiServerRequest[]
  limit?: number
}): UiWorkspaceTaskBoard {
  const orderedThreads = params.threads
    .slice()
    .sort((first, second) => second.updatedAtIso.localeCompare(first.updatedAtIso))
    .slice(0, params.limit ?? 12)
  const cards = orderedThreads.map((thread) => {
    const validationGate = buildWorkspaceValidationGate(params.snapshot)
    const status = deriveWorkspaceTaskStatus(thread, params.snapshot, {
      pendingRequests: params.pendingRequests,
      validationRuns: params.validationRuns,
    })
    return {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      updatedAtIso: thread.updatedAtIso,
      status,
      statusLabel: LANE_LABELS[status],
      validationGate,
      risks: deriveWorkspaceTaskRisks({
        thread,
        snapshot: params.snapshot,
        validationRuns: params.validationRuns,
        rateLimitSnapshot: params.rateLimitSnapshot,
        pendingRequests: params.pendingRequests,
      }),
    }
  })
  const lanes: UiWorkspaceTaskLane[] = ([
    'coding',
    'waiting_for_approval',
    'testing',
    'failed',
    'ready_for_review',
    'queued',
  ] as UiWorkspaceTaskStatus[]).map(
    (status) => ({
      status,
      label: LANE_LABELS[status],
      cards: cards.filter((card) => card.status === status),
    }),
  )
  const latestRun = latestValidationRun(params.validationRuns)

  return {
    cards,
    lanes,
    summary: {
      totalCount: cards.length,
      codingCount: lanes.find((lane) => lane.status === 'coding')?.cards.length ?? 0,
      waitingApprovalCount: lanes.find((lane) => lane.status === 'waiting_for_approval')?.cards.length ?? 0,
      testingCount: lanes.find((lane) => lane.status === 'testing')?.cards.length ?? 0,
      failedCount: lanes.find((lane) => lane.status === 'failed')?.cards.length ?? 0,
      readyForReviewCount: lanes.find((lane) => lane.status === 'ready_for_review')?.cards.length ?? 0,
      queuedCount: lanes.find((lane) => lane.status === 'queued')?.cards.length ?? 0,
      failedValidationCount: latestRun && latestRun.status !== 'passed' ? 1 : 0,
      missingRequiredValidationCount: buildWorkspaceValidationGate(params.snapshot).missingRequiredCount,
      warningCount: params.snapshot?.warnings.length ?? 0,
    },
  }
}
