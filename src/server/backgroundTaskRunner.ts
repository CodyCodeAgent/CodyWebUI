export type BackgroundTaskStatus = {
  name: string
  running: boolean
  runCount: number
  successCount: number
  failureCount: number
  lastStartedAtIso: string | null
  lastSuccessAtIso: string | null
  lastFailureAtIso: string | null
  lastDurationMs: number | null
  lastError: string
  nextRunAtIso: string | null
}

export type BackgroundTaskRunnerOptions = {
  name: string
  intervalMs: number
  maxBackoffMs?: number
  task: () => Promise<void>
  now?: () => number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

export class BackgroundTaskRunner {
  private readonly name: string
  private readonly intervalMs: number
  private readonly maxBackoffMs: number
  private readonly task: () => Promise<void>
  private readonly now: () => number
  private readonly setTimer: typeof setTimeout
  private readonly clearTimer: typeof clearTimeout
  private timer: ReturnType<typeof setTimeout> | null = null
  private runningPromise: Promise<void> | null = null
  private stopped = true
  private consecutiveFailures = 0
  private status: BackgroundTaskStatus

  constructor(options: BackgroundTaskRunnerOptions) {
    this.name = options.name
    this.intervalMs = Math.max(1_000, options.intervalMs)
    this.maxBackoffMs = Math.max(this.intervalMs, options.maxBackoffMs ?? 5 * 60_000)
    this.task = options.task
    this.now = options.now ?? Date.now
    this.setTimer = options.setTimer ?? setTimeout
    this.clearTimer = options.clearTimer ?? clearTimeout
    this.status = {
      name: this.name,
      running: false,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      lastStartedAtIso: null,
      lastSuccessAtIso: null,
      lastFailureAtIso: null,
      lastDurationMs: null,
      lastError: '',
      nextRunAtIso: null,
    }
  }

  start(options: { immediate?: boolean } = {}): void {
    if (!this.stopped) return
    this.stopped = false
    if (options.immediate !== false) {
      void this.runNow()
      return
    }
    this.schedule(this.intervalMs)
  }

  async runNow(): Promise<void> {
    if (this.runningPromise) return this.runningPromise
    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = null
      this.status.nextRunAtIso = null
    }

    const startedAtMs = this.now()
    this.status.running = true
    this.status.runCount += 1
    this.status.lastStartedAtIso = new Date(startedAtMs).toISOString()
    this.runningPromise = this.task()
      .then(() => {
        this.consecutiveFailures = 0
        this.status.successCount += 1
        this.status.lastSuccessAtIso = new Date(this.now()).toISOString()
        this.status.lastError = ''
      })
      .catch((error: unknown) => {
        this.consecutiveFailures += 1
        this.status.failureCount += 1
        this.status.lastFailureAtIso = new Date(this.now()).toISOString()
        this.status.lastError = error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        this.status.running = false
        this.status.lastDurationMs = Math.max(0, this.now() - startedAtMs)
        this.runningPromise = null
        if (!this.stopped) this.schedule(this.nextDelayMs())
      })

    return this.runningPromise
  }

  scheduleSoon(delayMs = 750): void {
    if (this.stopped || this.runningPromise) return
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
  }

  getStatus(): BackgroundTaskStatus {
    return { ...this.status }
  }

  private nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return this.intervalMs
    return Math.min(this.intervalMs * (2 ** Math.min(this.consecutiveFailures - 1, 8)), this.maxBackoffMs)
  }

  private schedule(delayMs: number): void {
    const scheduledAtMs = this.now() + delayMs
    this.status.nextRunAtIso = new Date(scheduledAtMs).toISOString()
    this.timer = this.setTimer(() => {
      this.timer = null
      this.status.nextRunAtIso = null
      void this.runNow()
    }, delayMs)
    this.timer.unref?.()
  }
}
