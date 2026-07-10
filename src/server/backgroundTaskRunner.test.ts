import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackgroundTaskRunner } from './backgroundTaskRunner'

afterEach(() => {
  vi.useRealTimers()
})

describe('BackgroundTaskRunner', () => {
  it('runs immediately, records status, and schedules the next run', async () => {
    vi.useFakeTimers()
    const task = vi.fn(async () => undefined)
    const runner = new BackgroundTaskRunner({ name: 'catalog', intervalMs: 30_000, task })

    runner.start()
    await runner.runNow()

    expect(task).toHaveBeenCalledTimes(1)
    expect(runner.getStatus()).toMatchObject({
      name: 'catalog',
      running: false,
      runCount: 1,
      successCount: 1,
      failureCount: 0,
      lastError: '',
    })
    expect(runner.getStatus().nextRunAtIso).not.toBeNull()
    runner.stop()
  })

  it('deduplicates overlapping runs', async () => {
    let resolveTask: () => void = () => undefined
    const task = vi.fn(() => new Promise<void>((resolve) => { resolveTask = resolve }))
    const runner = new BackgroundTaskRunner({ name: 'catalog', intervalMs: 30_000, task })

    const first = runner.runNow()
    const second = runner.runNow()
    expect(task).toHaveBeenCalledTimes(1)
    resolveTask()
    await Promise.all([first, second])
    expect(runner.getStatus().successCount).toBe(1)
  })

  it('records failures without rejecting callers', async () => {
    const runner = new BackgroundTaskRunner({
      name: 'catalog',
      intervalMs: 30_000,
      task: async () => { throw new Error('offline') },
    })

    await expect(runner.runNow()).resolves.toBeUndefined()
    expect(runner.getStatus()).toMatchObject({
      runCount: 1,
      successCount: 0,
      failureCount: 1,
      lastError: 'offline',
    })
  })
})
