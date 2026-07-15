export type BackgroundTaskStatus = {
  name: string
  state: 'idle' | 'scheduled' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'paused'
  running: boolean
  paused: boolean
  pendingRerun: boolean
  currentRunId: string | null
  runCount: number
  successCount: number
  failureCount: number
  timedOutCount: number
  consecutiveFailures: number
  lastStartedAtIso: string | null
  lastSuccessAtIso: string | null
  lastFailureAtIso: string | null
  lastDurationMs: number | null
  lastError: string
  nextRunAtIso: string | null
  progress: BackgroundTaskProgress | null
  health: 'healthy' | 'degraded' | 'unhealthy' | 'paused'
}

export type BackgroundTaskProgress = {
  completed: number
  total: number | null
  message: string
  updatedAtIso: string
}

export type BackgroundTaskContext = {
  runId: string
  signal: AbortSignal
  reportProgress: (progress: { completed: number; total?: number | null; message?: string }) => void
}

export type BackgroundTaskRunnerOptions = {
  name: string
  intervalMs: number
  maxBackoffMs?: number
  timeoutMs?: number
  task: (context: BackgroundTaskContext) => Promise<void>
  now?: () => number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
  onStatus?: (status: BackgroundTaskStatus) => void
}

export class BackgroundTaskRunner {
  private readonly name: string
  private readonly intervalMs: number
  private readonly maxBackoffMs: number
  private readonly timeoutMs: number
  private readonly task: (context: BackgroundTaskContext) => Promise<void>
  private readonly now: () => number
  private readonly setTimer: typeof setTimeout
  private readonly clearTimer: typeof clearTimeout
  private readonly onStatus?: (status: BackgroundTaskStatus) => void
  private timer: ReturnType<typeof setTimeout> | null = null
  private runningPromise: Promise<void> | null = null
  private lingeringPromise: Promise<void> | null = null
  private stopped = true
  private paused = false
  private rerunRequested = false
  private activeAbortController: AbortController | null = null
  private runSequence = 0
  private consecutiveFailures = 0
  private status: BackgroundTaskStatus

  constructor(options: BackgroundTaskRunnerOptions) {
    this.name = options.name
    this.intervalMs = Math.max(1_000, options.intervalMs)
    this.maxBackoffMs = Math.max(this.intervalMs, options.maxBackoffMs ?? 5 * 60_000)
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? Math.min(this.intervalMs, 60_000))
    this.task = options.task
    this.now = options.now ?? Date.now
    this.setTimer = options.setTimer ?? setTimeout
    this.clearTimer = options.clearTimer ?? clearTimeout
    this.onStatus = options.onStatus
    this.status = {
      name: this.name,
      state: 'idle',
      running: false,
      paused: false,
      pendingRerun: false,
      currentRunId: null,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      timedOutCount: 0,
      consecutiveFailures: 0,
      lastStartedAtIso: null,
      lastSuccessAtIso: null,
      lastFailureAtIso: null,
      lastDurationMs: null,
      lastError: '',
      nextRunAtIso: null,
      progress: null,
      health: 'healthy',
    }
  }

  start(options: { immediate?: boolean } = {}): void {
    if (!this.stopped) return
    this.stopped = false
    if (this.paused) {
      this.status.state = 'paused'
      this.emitStatus()
      return
    }
    if (options.immediate !== false) {
      void this.runNow()
      return
    }
    this.schedule(this.intervalMs)
  }

  async runNow(): Promise<void> {
    if (this.lingeringPromise) {
      this.rerunRequested = true
      this.status.pendingRerun = true
      return this.lingeringPromise
    }
    if (this.runningPromise) {
      this.rerunRequested = true
      this.status.pendingRerun = true
      return this.runningPromise
    }
    if (this.paused) return
    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
      this.status.nextRunAtIso = null
    }

    const startedAtMs = this.now()
    const runId = `${this.name}:${String(++this.runSequence)}:${String(startedAtMs)}`
    const abortController = new AbortController()
    this.activeAbortController = abortController
    this.status.running = true
    this.status.state = 'running'
    this.status.currentRunId = runId
    this.status.progress = null
    this.status.runCount += 1
    this.status.lastStartedAtIso = new Date(startedAtMs).toISOString()
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutTimer = this.setTimer(() => {
        timedOut = true
        abortController.abort(new Error(`${this.name} timed out after ${String(this.timeoutMs)}ms`))
        reject(new Error(`${this.name} timed out after ${String(this.timeoutMs)}ms`))
      }, this.timeoutMs)
      timeoutTimer.unref?.()
    })
    let rejectAbortPromise: (reason?: unknown) => void = () => undefined
    const abortPromise = new Promise<never>((_resolve, reject) => { rejectAbortPromise = reject })
    const onTaskAbort = () => rejectAbortPromise(abortController.signal.reason ?? new Error(`${this.name} aborted`))
    abortController.signal.addEventListener('abort', onTaskAbort, { once: true })
    const context: BackgroundTaskContext = {
      runId,
      signal: abortController.signal,
      reportProgress: (progress) => {
        if (this.status.currentRunId !== runId) return
        this.status.progress = {
          completed: Math.max(0, progress.completed),
          total: typeof progress.total === 'number' ? Math.max(0, progress.total) : null,
          message: progress.message?.trim() ?? '',
          updatedAtIso: new Date(this.now()).toISOString(),
        }
      },
    }
    const taskPromise = this.task(context)
    let taskSettled = false
    void taskPromise.then(() => { taskSettled = true }, () => { taskSettled = true })
    this.runningPromise = Promise.race([taskPromise, timeoutPromise, abortPromise])
      .then(() => {
        this.consecutiveFailures = 0
        this.status.consecutiveFailures = 0
        this.status.successCount += 1
        this.status.state = 'succeeded'
        this.status.lastSuccessAtIso = new Date(this.now()).toISOString()
        this.status.lastError = ''
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted && !timedOut && (this.paused || this.stopped)) {
          this.status.lastError = ''
          return
        }
        this.consecutiveFailures += 1
        this.status.consecutiveFailures = this.consecutiveFailures
        this.status.failureCount += 1
        if (timedOut) this.status.timedOutCount += 1
        this.status.state = timedOut ? 'timed_out' : 'failed'
        this.status.lastFailureAtIso = new Date(this.now()).toISOString()
        this.status.lastError = error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        if (timeoutTimer) this.clearTimer(timeoutTimer)
        abortController.signal.removeEventListener('abort', onTaskAbort)
        this.status.running = false
        this.status.currentRunId = null
        this.status.lastDurationMs = Math.max(0, this.now() - startedAtMs)
        this.activeAbortController = null
        this.runningPromise = null
        const shouldRerun = this.rerunRequested
        this.rerunRequested = false
        this.status.pendingRerun = false
        if (timedOut && !taskSettled) {
          this.lingeringPromise = taskPromise.then(() => undefined, () => undefined).finally(() => {
            this.lingeringPromise = null
            const rerunAfterLingering = this.rerunRequested || shouldRerun
            this.rerunRequested = false
            this.status.pendingRerun = false
            if (!this.stopped && !this.paused) this.schedule(rerunAfterLingering ? 0 : this.nextDelayMs())
          })
          this.emitStatus()
          return
        }
        if (!this.stopped && !this.paused) this.schedule(shouldRerun ? 0 : this.nextDelayMs())
        this.emitStatus()
      })

    return this.runningPromise
  }

  scheduleSoon(delayMs = 750): void {
    if (this.stopped || this.paused) return
    if (this.lingeringPromise) {
      this.rerunRequested = true
      this.status.pendingRerun = true
      return
    }
    if (this.runningPromise) {
      this.rerunRequested = true
      this.status.pendingRerun = true
      return
    }
    const normalizedDelay = Math.max(0, delayMs)
    if (this.timer) this.clearTimer(this.timer)
    this.schedule(normalizedDelay)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.status.nextRunAtIso = null
    this.activeAbortController?.abort(new Error(`${this.name} stopped`))
    this.status.state = 'idle'
    this.emitStatus()
  }

  pause(): void {
    this.paused = true
    this.status.paused = true
    this.status.state = 'paused'
    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.status.nextRunAtIso = null
    this.activeAbortController?.abort(new Error(`${this.name} paused`))
    this.emitStatus()
  }

  resume(options: { immediate?: boolean } = {}): void {
    if (!this.paused) return
    this.paused = false
    this.status.paused = false
    this.status.state = 'idle'
    if (options.immediate !== false) void this.runNow()
    else this.schedule(this.intervalMs)
    this.emitStatus()
  }

  getStatus(): BackgroundTaskStatus {
    const health = this.paused ? 'paused' : this.status.consecutiveFailures >= 3 ? 'unhealthy' : this.status.consecutiveFailures > 0 ? 'degraded' : 'healthy'
    return { ...this.status, health }
  }

  hydrateStatus(saved: Partial<BackgroundTaskStatus> | null): void {
    if (!saved || saved.name !== this.name || this.status.runCount > 0) return
    for (const key of ['runCount', 'successCount', 'failureCount', 'timedOutCount', 'consecutiveFailures', 'lastStartedAtIso', 'lastSuccessAtIso', 'lastFailureAtIso', 'lastDurationMs', 'lastError'] as const) {
      if (saved[key] !== undefined) Object.assign(this.status, { [key]: saved[key] })
    }
    this.consecutiveFailures = this.status.consecutiveFailures
    this.paused = saved.paused === true
    this.status.paused = this.paused
    this.status.state = this.paused ? 'paused' : 'idle'
  }

  private emitStatus(): void { this.onStatus?.(this.getStatus()) }

  private nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return this.intervalMs
    return Math.min(this.intervalMs * (2 ** Math.min(this.consecutiveFailures - 1, 8)), this.maxBackoffMs)
  }

  private schedule(delayMs: number): void {
    const scheduledAtMs = this.now() + delayMs
    this.status.nextRunAtIso = new Date(scheduledAtMs).toISOString()
    this.status.state = 'scheduled'
    this.emitStatus()
    this.timer = this.setTimer(() => {
      this.timer = null
      this.status.nextRunAtIso = null
      void this.runNow()
    }, delayMs)
    this.timer.unref?.()
  }
}
