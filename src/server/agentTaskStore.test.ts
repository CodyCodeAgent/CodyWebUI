import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  calculateNextAgentTaskRun,
  claimAgentTask,
  completeAgentTaskRun,
  createAgentTask,
  deleteAgentTask,
  getAgentTask,
  listAgentTaskRunEvents,
  listAgentTaskRuns,
  listAgentTasks,
  listAgentTaskVersions,
  markAgentTaskRunStarted,
  permanentlyDeleteAgentTask,
  restoreAgentTask,
  rollbackAgentTask,
  setAgentTaskEnabled,
  updateAgentTask,
  type AgentTaskInput,
} from './agentTaskStore'

let tempDir = ''
const previousDb = process.env.CODY_WEB_UI_SETTINGS_DB

function input(overrides: Partial<AgentTaskInput> = {}): AgentTaskInput {
  return {
    name: 'Daily review',
    description: 'Review current changes',
    cwd: tempDir,
    prompt: 'Review the workspace and report concrete risks.',
    schedule: { kind: 'daily', time: '09:00' },
    timezone: 'Asia/Shanghai',
    model: '',
    effort: 'medium',
    permission: 'read-only',
    enabled: true,
    timeoutMinutes: 45,
    maxRetries: 1,
    concurrencyPolicy: 'skip',
    notificationPolicy: 'important',
    outputMode: 'conversation',
    outputPath: '',
    maxTokens: 0,
    pauseAfterFailures: 3,
    ...overrides,
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cody-agent-task-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
})

afterEach(async () => {
  if (previousDb === undefined) delete process.env.CODY_WEB_UI_SETTINGS_DB
  else process.env.CODY_WEB_UI_SETTINGS_DB = previousDb
  await rm(tempDir, { recursive: true, force: true })
})

describe('Agent task schedule', () => {
  it('calculates wall-clock daily and weekly runs in the selected timezone', () => {
    const after = Date.parse('2026-07-16T00:30:00.000Z') // 08:30 in Shanghai
    expect(calculateNextAgentTaskRun({ kind: 'daily', time: '09:00' }, 'Asia/Shanghai', after))
      .toBe('2026-07-16T01:00:00.000Z')
    expect(calculateNextAgentTaskRun({ kind: 'weekly', weekday: 4, time: '08:00' }, 'Asia/Shanghai', after))
      .toBe('2026-07-23T00:00:00.000Z')
  })

  it('preserves local time across daylight-saving transitions', () => {
    const next = calculateNextAgentTaskRun({ kind: 'daily', time: '09:00' }, 'America/New_York', Date.parse('2026-03-07T15:00:00.000Z'))
    expect(next).toBe('2026-03-08T13:00:00.000Z')
  })

  it('uses deterministic daylight-saving gap and overlap behavior', () => {
    expect(calculateNextAgentTaskRun({ kind: 'daily', time: '02:30' }, 'America/New_York', Date.parse('2026-03-08T05:00:00.000Z')))
      .toBe('2026-03-08T07:30:00.000Z')
    expect(calculateNextAgentTaskRun({ kind: 'daily', time: '01:30' }, 'America/New_York', Date.parse('2026-11-01T04:00:00.000Z')))
      .toBe('2026-11-01T05:30:00.000Z')
  })

  it('supports workdays, exclusions, monthly dates, and five-field cron', () => {
    expect(calculateNextAgentTaskRun({ kind: 'daily', time: '09:00', weekdaysOnly: true, excludedDates: ['2026-07-17'] }, 'Asia/Shanghai', Date.parse('2026-07-16T02:00:00.000Z')))
      .toBe('2026-07-20T01:00:00.000Z')
    expect(calculateNextAgentTaskRun({ kind: 'monthly', day: 31, time: '09:00' }, 'UTC', Date.parse('2026-07-31T10:00:00.000Z')))
      .toBe('2026-08-31T09:00:00.000Z')
    expect(calculateNextAgentTaskRun({ kind: 'cron', expression: '0 9 * * 1-5' }, 'UTC', Date.parse('2026-07-17T10:00:00.000Z')))
      .toBe('2026-07-20T09:00:00.000Z')
  })
})

describe('Agent task persistence', () => {
  it('creates, updates, pauses, resumes, and deletes definitions in SQLite', async () => {
    const created = await createAgentTask(input(), new Date('2026-07-16T00:00:00.000Z'))
    expect(created.nextRunAtIso).toBe('2026-07-16T01:00:00.000Z')
    expect(await listAgentTasks()).toHaveLength(1)

    const updated = await updateAgentTask(created.id, input({ name: 'Weekly review', schedule: { kind: 'weekly', weekday: 1, time: '10:30' }, permission: 'workspace-write' }), new Date('2026-07-16T00:00:00.000Z'))
    expect(updated).toMatchObject({ name: 'Weekly review', permission: 'workspace-write' })

    expect((await setAgentTaskEnabled(created.id, false)).enabled).toBe(false)
    expect((await setAgentTaskEnabled(created.id, true, new Date('2026-07-16T00:00:00.000Z'))).nextRunAtIso).not.toBeNull()
    await deleteAgentTask(created.id)
    expect(await getAgentTask(created.id)).toBeNull()
  })

  it('claims a due task once and releases it after completion', async () => {
    const task = await createAgentTask(input({ schedule: { kind: 'interval', intervalMinutes: 5 } }), new Date('2026-07-16T00:00:00.000Z'))
    const dueAt = new Date('2026-07-16T00:05:01.000Z')
    const claimed = await claimAgentTask(task.id, 'schedule', dueAt)
    expect(claimed?.run.status).toBe('queued')
    await expect(claimAgentTask(task.id, 'manual', dueAt)).resolves.toBeNull()

    await completeAgentTaskRun(claimed!.run.id, { status: 'succeeded', summary: 'No risks found', totalTokens: 1200 }, new Date('2026-07-16T00:06:00.000Z'))
    const runs = await listAgentTaskRuns(task.id)
    expect(runs[0]).toMatchObject({ status: 'succeeded', summary: 'No risks found', totalTokens: 1200 })
    expect((await getAgentTask(task.id))?.consecutiveFailures).toBe(0)
  })

  it('schedules bounded retries and keeps one-time tasks enabled until retries are exhausted', async () => {
    const task = await createAgentTask(input({
      schedule: { kind: 'once', runAtIso: '2026-07-16T00:05:00.000Z' },
      maxRetries: 1,
    }), new Date('2026-07-16T00:00:00.000Z'))
    const claimed = await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:05:01.000Z'))
    await completeAgentTaskRun(claimed!.run.id, { status: 'failed', error: 'temporary failure' }, new Date('2026-07-16T00:05:02.000Z'))
    const retriedTask = await getAgentTask(task.id)
    expect(retriedTask).toMatchObject({ enabled: true, consecutiveFailures: 1 })
    expect(retriedTask?.nextRunAtIso).toBe('2026-07-16T00:05:32.000Z')

    const retry = await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:05:33.000Z'))
    expect(retry?.run).toMatchObject({ trigger: 'retry', retryNumber: 1, scheduledAtIso: '2026-07-16T00:05:00.000Z' })
    await completeAgentTaskRun(retry!.run.id, { status: 'failed', error: 'still failing' }, new Date('2026-07-16T00:06:00.000Z'))
    expect((await getAgentTask(task.id))?.nextRunAtIso).toBeNull()
  })

  it('persists one queued overlap and keeps audit history when a task is archived', async () => {
    const task = await createAgentTask(input({ schedule: { kind: 'interval', intervalMinutes: 5 }, concurrencyPolicy: 'queue' }), new Date('2026-07-16T00:00:00.000Z'))
    const active = await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:05:01.000Z'))
    await markAgentTaskRunStarted(active!.run.id, 'thread-queue', 'turn-queue', new Date('2026-07-16T00:05:02.000Z'))
    await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:10:01.000Z'))
    await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:15:01.000Z'))
    expect((await listAgentTaskRuns(task.id)).filter((run) => run.status === 'queued')).toHaveLength(1)
    await completeAgentTaskRun(active!.run.id, { status: 'succeeded' }, new Date('2026-07-16T00:16:00.000Z'))
    await deleteAgentTask(task.id)
    expect(await getAgentTask(task.id)).toBeNull()
    expect(await listAgentTasks('archived')).toEqual([expect.objectContaining({ id: task.id, archivedAtIso: expect.any(String) })])
    expect(await listAgentTaskRuns(task.id)).not.toHaveLength(0)
    const restored = await restoreAgentTask(task.id, new Date('2026-07-16T00:17:00.000Z'))
    expect(restored).toMatchObject({ id: task.id, enabled: false, archivedAtIso: null })
    await deleteAgentTask(task.id)
    await permanentlyDeleteAgentTask(task.id)
    expect(await listAgentTasks('archived')).toHaveLength(0)
    expect(await listAgentTaskRuns(task.id)).toHaveLength(0)
  })

  it('records definition versions and restores an earlier definition as a new version', async () => {
    const created = await createAgentTask(input({ name: 'Original' }), new Date('2026-07-16T00:00:00.000Z'))
    await updateAgentTask(created.id, input({ name: 'Changed' }), new Date('2026-07-16T00:01:00.000Z'))
    expect((await listAgentTaskVersions(created.id)).map((item) => item.version)).toEqual([2, 1])
    const restored = await rollbackAgentTask(created.id, 1, new Date('2026-07-16T00:02:00.000Z'))
    expect(restored).toMatchObject({ name: 'Original', version: 3 })
  })

  it('records skipped overlaps, run timelines, and auto-pauses repeated failures', async () => {
    const task = await createAgentTask(input({ schedule: { kind: 'interval', intervalMinutes: 5 }, pauseAfterFailures: 1 }), new Date('2026-07-16T00:00:00.000Z'))
    const active = await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:05:01.000Z'))
    await claimAgentTask(task.id, 'schedule', new Date('2026-07-16T00:10:02.000Z'))
    expect((await listAgentTaskRuns(task.id)).map((run) => run.status)).toContain('skipped')
    await completeAgentTaskRun(active!.run.id, { status: 'failed', error: 'persistent failure' }, new Date('2026-07-16T00:10:03.000Z'))
    expect(await getAgentTask(task.id)).toMatchObject({ enabled: false, consecutiveFailures: 1, nextRunAtIso: null })
    expect((await listAgentTaskRunEvents(active!.run.id)).map((event) => event.kind)).toEqual(['queued', 'completed'])
  })
})
