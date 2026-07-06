import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiWorkspaceScriptRun,
  UiWorkspaceSessionSummary,
} from '../types/codex'

export type UiWorkspaceResourceTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export type UiWorkspaceResourceMetric = {
  label: string
  value: string
  detail: string
  tone: UiWorkspaceResourceTone
}

export type UiWorkspaceResourceSummary = {
  generatedAtIso: string
  tone: UiWorkspaceResourceTone
  headline: string
  rateLimit: UiWorkspaceResourceMetric
  tokens: UiWorkspaceResourceMetric
  validation: UiWorkspaceResourceMetric
  activity: UiWorkspaceResourceMetric
  notes: string[]
}

function toneRank(tone: UiWorkspaceResourceTone): number {
  return {
    neutral: 0,
    success: 1,
    info: 2,
    warning: 3,
    danger: 4,
  }[tone]
}

function worstTone(tones: UiWorkspaceResourceTone[]): UiWorkspaceResourceTone {
  return tones.slice().sort((first, second) => toneRank(second) - toneRank(first))[0] ?? 'neutral'
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function formatDuration(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return '0s'
  if (totalMs < 60_000) return `${Math.round(totalMs / 1000)}s`
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.round((totalMs % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function maxRateLimitPercent(snapshot: UiRateLimitSnapshot | null): number | null {
  const values = [
    snapshot?.primary?.usedPercent,
    snapshot?.secondary?.usedPercent,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (values.length === 0) return null
  return Math.max(...values)
}

function rateLimitMetric(snapshot: UiRateLimitSnapshot | null): UiWorkspaceResourceMetric {
  const percent = maxRateLimitPercent(snapshot)
  if (percent === null) {
    return {
      label: 'Rate limit',
      value: 'unknown',
      detail: 'No Codex rate-limit snapshot is available yet.',
      tone: 'neutral',
    }
  }

  const tone: UiWorkspaceResourceTone = percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'success'
  const credits = snapshot?.availableResetCredits
  return {
    label: 'Rate limit',
    value: `${String(Math.round(percent))}%`,
    detail: [
      snapshot?.planType || 'plan unknown',
      snapshot?.limitName || snapshot?.limitId || 'Codex',
      typeof credits === 'number' ? `${String(credits)} reset credit${credits === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · '),
    tone,
  }
}

function tokenMetric(sessions: UiWorkspaceSessionSummary[]): UiWorkspaceResourceMetric {
  const totalTokens = sessions.reduce((sum, session) => sum + Math.max(0, session.totalTokens || 0), 0)
  const inputTokens = sessions.reduce((sum, session) => sum + Math.max(0, session.inputTokens || 0), 0)
  const outputTokens = sessions.reduce((sum, session) => sum + Math.max(0, session.outputTokens || 0), 0)
  const usageEvents = sessions.reduce((sum, session) => sum + Math.max(0, session.tokenUsageEventCount || 0), 0)
  const costUsd = sessions.reduce((sum, session) => sum + Math.max(0, session.costUsd ?? 0), 0)
  const costEvents = sessions.reduce((sum, session) => sum + Math.max(0, session.costEventCount || 0), 0)

  if (usageEvents === 0) {
    return {
      label: 'Tokens',
      value: 'untracked',
      detail: 'No token usage events have been emitted by Codex for this workspace yet.',
      tone: 'neutral',
    }
  }

  return {
    label: 'Tokens',
    value: formatNumber(totalTokens),
    detail: [
      `${formatNumber(inputTokens)} in`,
      `${formatNumber(outputTokens)} out`,
      `${String(usageEvents)} usage event${usageEvents === 1 ? '' : 's'}`,
      costEvents > 0 ? `$${costUsd.toFixed(4)}` : 'cost unavailable',
    ].join(' · '),
    tone: totalTokens > 0 ? 'info' : 'neutral',
  }
}

function validationMetric(runs: UiWorkspaceScriptRun[]): UiWorkspaceResourceMetric {
  if (runs.length === 0) {
    return {
      label: 'Validation',
      value: 'none',
      detail: 'No validation runs are recorded for this workspace.',
      tone: 'neutral',
    }
  }

  const failedCount = runs.filter((run) => run.status !== 'passed').length
  const totalDurationMs = runs.reduce((sum, run) => sum + Math.max(0, run.durationMs || 0), 0)
  return {
    label: 'Validation',
    value: `${String(runs.length)} run${runs.length === 1 ? '' : 's'}`,
    detail: `${String(failedCount)} failed · ${formatDuration(totalDurationMs)} captured`,
    tone: failedCount > 0 ? 'danger' : 'success',
  }
}

function activityMetric(params: {
  threads: UiThread[]
  sessions: UiWorkspaceSessionSummary[]
  pendingRequests: UiServerRequest[]
}): UiWorkspaceResourceMetric {
  const activeThreads = params.threads.filter((thread) => thread.inProgress).length
  const activeSessions = params.sessions.filter((session) => session.status === 'running' || session.status === 'active').length
  const waitingApprovals = params.pendingRequests.length +
    params.sessions.filter((session) => session.status === 'waiting_for_approval').length
  const value = `${String(activeThreads || activeSessions)} active`
  return {
    label: 'Activity',
    value,
    detail: `${String(waitingApprovals)} waiting approval · ${String(params.sessions.length)} recent sessions`,
    tone: waitingApprovals > 0 ? 'warning' : activeThreads > 0 || activeSessions > 0 ? 'info' : 'success',
  }
}

export function buildWorkspaceResourceSummary(params: {
  rateLimitSnapshot: UiRateLimitSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  sessions: UiWorkspaceSessionSummary[]
  threads: UiThread[]
  pendingRequests: UiServerRequest[]
  now?: () => Date
}): UiWorkspaceResourceSummary {
  const rateLimit = rateLimitMetric(params.rateLimitSnapshot)
  const tokens = tokenMetric(params.sessions)
  const validation = validationMetric(params.validationRuns)
  const activity = activityMetric({
    threads: params.threads,
    sessions: params.sessions,
    pendingRequests: params.pendingRequests,
  })
  const tone = worstTone([rateLimit.tone, tokens.tone, validation.tone, activity.tone])
  const notes = [
    tokens.tone === 'neutral' ? 'Token and cost totals require Codex usage metadata; rate-limit usage is still live.' : '',
    validation.tone === 'neutral' ? 'Run validation commands to attach stronger evidence to this workspace.' : '',
    rateLimit.tone === 'danger' ? 'Rate-limit usage is high; consider waiting for reset before starting large multi-agent work.' : '',
  ].filter(Boolean)

  return {
    generatedAtIso: (params.now ?? (() => new Date()))().toISOString(),
    tone,
    headline: tone === 'danger'
      ? 'Resource risk needs attention'
      : tone === 'warning'
        ? 'Resource pressure is elevated'
        : 'Resource posture is usable',
    rateLimit,
    tokens,
    validation,
    activity,
    notes,
  }
}
