import { describe, expect, it } from 'vitest'
import type { UiThreadContextUsage } from '../types/codex'
import {
  buildThreadContextUsagePresentation,
  formatCompactTokenCount,
} from './threadContextUsageRules'

function usage(overrides: Partial<UiThreadContextUsage> = {}): UiThreadContextUsage {
  return {
    threadId: 'thread-1',
    turnId: 'turn-1',
    usedTokens: 60_000,
    inputTokens: 55_000,
    contextWindow: 200_000,
    autoCompactTokenLimit: 180_000,
    updatedAtIso: '2026-07-24T00:00:00.000Z',
    compactionState: 'idle',
    ...overrides,
  }
}

describe('thread context usage rules', () => {
  it('formats compact token counts without false precision', () => {
    expect(formatCompactTokenCount(950)).toBe('950')
    expect(formatCompactTokenCount(12_500)).toBe('12.5K')
    expect(formatCompactTokenCount(200_000)).toBe('200K')
    expect(formatCompactTokenCount(1_500_000)).toBe('1.5M')
  })

  it('calculates actual context occupancy and automatic compaction marker', () => {
    expect(buildThreadContextUsagePresentation(usage())).toEqual({
      tone: 'normal',
      usedPercent: 30,
      autoCompactPercent: 90,
      usedLabel: '60K / 200K',
    })
  })

  it('warns relative to the configured automatic compaction limit', () => {
    expect(buildThreadContextUsagePresentation(usage({ usedTokens: 145_000 })).tone).toBe('warning')
    expect(buildThreadContextUsagePresentation(usage({ usedTokens: 172_000 })).tone).toBe('critical')
  })

  it('gives explicit compaction states precedence over usage thresholds', () => {
    expect(buildThreadContextUsagePresentation(usage({
      usedTokens: 190_000,
      compactionState: 'compacting',
    })).tone).toBe('compacting')
    expect(buildThreadContextUsagePresentation(usage({
      usedTokens: 190_000,
      compactionState: 'compacted',
    })).tone).toBe('compacted')
  })
})
