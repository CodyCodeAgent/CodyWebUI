import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BackgroundTaskRunner, type BackgroundTaskStatus } from './backgroundTaskRunner.js'
import { readBackgroundTaskStatus, writeBackgroundTaskStatus } from './backgroundTaskStore.js'
import { appendReconciledTokenUsageSnapshot } from './sessionEventStore.js'

const RECONCILIATION_INTERVAL_MS = 60_000

type RolloutUsage = {
  cwd: string
  sessionId: string
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  eventCount: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function localDate(value: string | Date, timezoneOffsetMinutes: number): string {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

export function parseRolloutDailyTokenUsage(raw: string, date: string, timezoneOffsetMinutes = 0): RolloutUsage | null {
  let cwd = ''
  let sessionId = ''
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let eventCount = 0
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    try {
      const row = record(JSON.parse(line))
      const payload = record(row?.payload)
      if (row?.type === 'session_meta') {
        cwd = typeof payload?.cwd === 'string' ? payload.cwd : cwd
        sessionId = typeof payload?.id === 'string' ? payload.id : typeof payload?.session_id === 'string' ? payload.session_id : sessionId
        continue
      }
      if (row?.type !== 'event_msg' || payload?.type !== 'token_count') continue
      const timestamp = typeof row.timestamp === 'string' ? row.timestamp : ''
      if (localDate(timestamp, timezoneOffsetMinutes) !== date) continue
      const usage = record(record(payload.info)?.last_token_usage)
      if (!usage) continue
      inputTokens += number(usage.input_tokens)
      outputTokens += number(usage.output_tokens)
      totalTokens += number(usage.total_tokens) || number(usage.input_tokens) + number(usage.output_tokens)
      eventCount += 1
    } catch {
      // A partially written final line is normal while Codex is still running.
    }
  }
  return cwd && sessionId && eventCount > 0 ? { cwd, sessionId, date, inputTokens, outputTokens, totalTokens, eventCount } : null
}

export class TokenUsageReconciliationService {
  private readonly runner: BackgroundTaskRunner
  private readonly sessionsRoot: string
  private readonly savedFingerprints = new Map<string, string>()

  constructor(options: { sessionsRoot?: string } = {}) {
    this.sessionsRoot = options.sessionsRoot ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
    this.runner = new BackgroundTaskRunner({
      name: 'token-usage-reconciliation',
      intervalMs: RECONCILIATION_INTERVAL_MS,
      timeoutMs: 45_000,
      onStatus: (status) => { void writeBackgroundTaskStatus(status).catch(() => undefined) },
      task: (context) => this.reconcileToday(new Date(), context),
    })
  }

  start(): void {
    void readBackgroundTaskStatus('token-usage-reconciliation')
      .then((status) => this.runner.hydrateStatus(status))
      .catch(() => undefined)
      .finally(() => this.runner.start({ immediate: true }))
  }
  stop(): void { this.runner.stop() }
  pause(): void { this.runner.pause() }
  resume(): void { this.runner.resume({ immediate: true }) }
  async runNow(): Promise<void> { await this.runner.runNow() }
  getStatus(): BackgroundTaskStatus { return this.runner.getStatus() }

  async reconcileToday(
    now = new Date(),
    context?: { signal: AbortSignal; reportProgress: (progress: { completed: number; total?: number | null; message?: string }) => void },
  ): Promise<void> {
    const timezoneOffsetMinutes = now.getTimezoneOffset()
    const date = localDate(now, timezoneOffsetMinutes)
    const reconciledAtIso = now.toISOString()
    const directoryDates = [...new Set([
      date,
      localDate(new Date(now.getTime() - 86_400_000), timezoneOffsetMinutes),
    ])]

    const rolloutPaths: string[] = []
    for (const directoryDate of directoryDates) {
      context?.signal.throwIfAborted()
      const [year, month, day] = directoryDate.split('-')
      const directory = join(this.sessionsRoot, year, month, day)
      let names: string[]
      try {
        names = await readdir(directory)
      } catch {
        continue
      }
      rolloutPaths.push(...names
        .filter((value) => value.startsWith('rollout-') && value.endsWith('.jsonl'))
        .map((name) => join(directory, name)))
    }

    context?.reportProgress({ completed: 0, total: rolloutPaths.length, message: 'Scanning Codex rollouts' })
    for (let index = 0; index < rolloutPaths.length; index += 1) {
        context?.signal.throwIfAborted()
        const path = rolloutPaths[index]!
        const usage = parseRolloutDailyTokenUsage(
          await readFile(path, { encoding: 'utf8', signal: context?.signal }),
          date,
          timezoneOffsetMinutes,
        )
        if (!usage) continue
        const fingerprintKey = `${date}:${path}`
        const fingerprint = `${usage.inputTokens}:${usage.outputTokens}:${usage.totalTokens}:${usage.eventCount}`
        if (this.savedFingerprints.get(fingerprintKey) === fingerprint) continue
        try {
          await appendReconciledTokenUsageSnapshot({ ...usage, reconciledAtIso })
          this.savedFingerprints.set(fingerprintKey, fingerprint)
        } catch {
          // Rollouts outside a git workspace are intentionally ignored by this workspace-scoped feature.
        }
        context?.reportProgress({ completed: index + 1, total: rolloutPaths.length, message: 'Reconciling token usage' })
    }
  }
}
