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

    runner.start()
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

  it('aborts timed out work and records a timed-out state', async () => {
    vi.useFakeTimers()
    const runner = new BackgroundTaskRunner({
      name: 'slow-scan',
      intervalMs: 30_000,
      timeoutMs: 1_000,
      task: ({ signal }) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    })

    const running = runner.runNow()
    await vi.advanceTimersByTimeAsync(1_000)
    await running

    expect(runner.getStatus()).toMatchObject({
      state: 'timed_out',
      running: false,
      timedOutCount: 1,
      consecutiveFailures: 1,
    })
  })

  it('does not start a replacement while timed-out work is still settling', async () => {
    vi.useFakeTimers()
    let resolveTask: () => void = () => undefined
    const task = vi.fn(() => new Promise<void>((resolve) => { resolveTask = resolve }))
    const runner = new BackgroundTaskRunner({ name: 'fenced', intervalMs: 30_000, timeoutMs: 1_000, task })
    runner.start()
    await vi.advanceTimersByTimeAsync(1_000)
    void runner.runNow()
    expect(task).toHaveBeenCalledTimes(1)
    resolveTask()
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(2)
    runner.stop()
  })

  it('coalesces triggers received during a run and reports progress', async () => {
    vi.useFakeTimers()
    let resolveFirst: () => void = () => undefined
    const task = vi.fn(({ reportProgress }) => {
      reportProgress({ completed: 2, total: 5, message: 'Scanning projects' })
      if (task.mock.calls.length > 1) return Promise.resolve()
      return new Promise<void>((resolve) => { resolveFirst = resolve })
    })
    const runner = new BackgroundTaskRunner({ name: 'catalog', intervalMs: 30_000, task })

    runner.start()
    const first = runner.runNow()
    runner.scheduleSoon()
    expect(runner.getStatus()).toMatchObject({
      pendingRerun: true,
      progress: { completed: 2, total: 5, message: 'Scanning projects' },
    })
    resolveFirst()
    await first
    await vi.advanceTimersByTimeAsync(0)

    expect(task).toHaveBeenCalledTimes(2)
    expect(runner.getStatus().successCount).toBe(2)
    runner.stop()
  })

  it('supports pause and resume without losing task status', async () => {
    const task = vi.fn(async () => undefined)
    const runner = new BackgroundTaskRunner({ name: 'catalog', intervalMs: 30_000, task })
    runner.start({ immediate: false })
    runner.pause()
    expect(runner.getStatus()).toMatchObject({ state: 'paused', paused: true, nextRunAtIso: null })

    runner.resume({ immediate: true })
    await runner.runNow()
    expect(task).toHaveBeenCalledTimes(1)
    expect(runner.getStatus()).toMatchObject({ paused: false, successCount: 1 })
    runner.stop()
  })
})
