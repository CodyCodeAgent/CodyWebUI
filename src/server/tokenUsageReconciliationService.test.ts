import { describe, expect, it } from 'vitest'
import { parseRolloutDailyTokenUsage } from './tokenUsageReconciliationService'

describe('parseRolloutDailyTokenUsage', () => {
  it('sums exact last-token deltas for the requested day', () => {
    const raw = [
      { timestamp: '2026-07-11T01:00:00.000Z', type: 'session_meta', payload: { id: 'session-a', cwd: '/repo' } },
      { timestamp: '2026-07-11T01:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } } },
      { timestamp: '2026-07-11T01:02:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 } } } },
      { timestamp: '2026-07-10T23:59:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 999, output_tokens: 999, total_tokens: 1998 } } } },
    ].map((row) => JSON.stringify(row)).join('\n')

    expect(parseRolloutDailyTokenUsage(raw, '2026-07-11')).toEqual({
      cwd: '/repo',
      sessionId: 'session-a',
      date: '2026-07-11',
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
      eventCount: 2,
    })
  })
})
