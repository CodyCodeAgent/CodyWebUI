import type { UiThreadContextUsage } from '../types/codex'

export type ThreadContextUsageTone =
  | 'normal'
  | 'warning'
  | 'critical'
  | 'compacting'
  | 'compacted'

export type ThreadContextUsagePresentation = {
  tone: ThreadContextUsageTone
  usedPercent: number | null
  autoCompactPercent: number | null
  usedLabel: string
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/u, '')}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/u, '')}K`
  }
  return String(Math.round(value))
}

export function buildThreadContextUsagePresentation(
  usage: UiThreadContextUsage,
): ThreadContextUsagePresentation {
  const contextWindow = positiveFinite(usage.contextWindow)
  const autoCompactLimit = positiveFinite(usage.autoCompactTokenLimit)
  const usedTokens = Math.max(0, usage.usedTokens)
  const usedPercent = contextWindow === null
    ? null
    : Math.min(100, Math.max(0, Math.round((usedTokens / contextWindow) * 100)))
  const autoCompactPercent = contextWindow === null || autoCompactLimit === null
    ? null
    : Math.min(100, Math.max(0, Math.round((autoCompactLimit / contextWindow) * 100)))

  let tone: ThreadContextUsageTone = 'normal'
  if (usage.compactionState === 'compacting') {
    tone = 'compacting'
  } else if (usage.compactionState === 'compacted') {
    tone = 'compacted'
  } else {
    const warningBoundary = autoCompactLimit === null
      ? contextWindow === null ? null : contextWindow * 0.7
      : autoCompactLimit * 0.8
    const criticalBoundary = autoCompactLimit === null
      ? contextWindow === null ? null : contextWindow * 0.88
      : autoCompactLimit * 0.95
    if (criticalBoundary !== null && usedTokens >= criticalBoundary) {
      tone = 'critical'
    } else if (warningBoundary !== null && usedTokens >= warningBoundary) {
      tone = 'warning'
    }
  }

  return {
    tone,
    usedPercent,
    autoCompactPercent,
    usedLabel: contextWindow === null
      ? formatCompactTokenCount(usedTokens)
      : `${formatCompactTokenCount(usedTokens)} / ${formatCompactTokenCount(contextWindow)}`,
  }
}
