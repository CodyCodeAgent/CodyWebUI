import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRolloutDailyTokenUsage, TokenUsageReconciliationService } from './tokenUsageReconciliationService'
import { summarizeDailyTokenUsage } from './sessionEventStore'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

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

  it('reconciles today usage from a session file created on the previous day', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cody-token-midnight-'))
    tempDirs.push(root)
    const repo = join(root, 'repo')
    const sessionsRoot = join(root, 'sessions')
    await mkdir(repo)
    await execFileAsync('git', ['init'], { cwd: repo })
    process.env.CODY_WEB_UI_SETTINGS_DB = join(root, 'settings.sqlite3')

    const previousDirectory = join(sessionsRoot, '2026', '07', '11')
    await mkdir(previousDirectory, { recursive: true })
    await writeFile(join(previousDirectory, 'rollout-cross-midnight.jsonl'), [
      { timestamp: '2026-07-11T15:50:00.000Z', type: 'session_meta', payload: { id: 'session-a', cwd: repo } },
      { timestamp: '2026-07-11T16:05:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 } } } },
    ].map((row) => JSON.stringify(row)).join('\n'), 'utf8')

    const service = new TokenUsageReconciliationService({ sessionsRoot })
    await service.reconcileToday(new Date('2026-07-11T16:10:00.000Z'))

    const usage = await summarizeDailyTokenUsage({ cwd: repo, date: '2026-07-12', timezoneOffsetMinutes: -480 })
    expect(usage).toMatchObject({ totalTokens: 100, inputTokens: 80, outputTokens: 20, source: 'reconciled-rollouts' })
  })
})
