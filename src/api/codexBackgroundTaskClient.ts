import { asRecord, fetchCodexResultRecord, jsonPostInit } from './codexHttpClient'

export type BackgroundTaskProgress = {
  completed: number
  total: number | null
  message: string
  updatedAtIso: string
}

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

function normalizeTask(value: unknown): BackgroundTaskStatus | null {
  const row = asRecord(value)
  if (!row || typeof row.name !== 'string') return null
  const progress = asRecord(row.progress)
  const state = typeof row.state === 'string' ? row.state : row.running === true ? 'running' : 'idle'
  return {
    name: row.name,
    state: ['idle', 'scheduled', 'running', 'succeeded', 'failed', 'timed_out', 'paused'].includes(state)
      ? state as BackgroundTaskStatus['state']
      : 'idle',
    running: row.running === true,
    paused: row.paused === true,
    pendingRerun: row.pendingRerun === true,
    currentRunId: typeof row.currentRunId === 'string' ? row.currentRunId : null,
    runCount: typeof row.runCount === 'number' ? row.runCount : 0,
    successCount: typeof row.successCount === 'number' ? row.successCount : 0,
    failureCount: typeof row.failureCount === 'number' ? row.failureCount : 0,
    timedOutCount: typeof row.timedOutCount === 'number' ? row.timedOutCount : 0,
    consecutiveFailures: typeof row.consecutiveFailures === 'number' ? row.consecutiveFailures : 0,
    lastStartedAtIso: typeof row.lastStartedAtIso === 'string' ? row.lastStartedAtIso : null,
    lastSuccessAtIso: typeof row.lastSuccessAtIso === 'string' ? row.lastSuccessAtIso : null,
    lastFailureAtIso: typeof row.lastFailureAtIso === 'string' ? row.lastFailureAtIso : null,
    lastDurationMs: typeof row.lastDurationMs === 'number' ? row.lastDurationMs : null,
    lastError: typeof row.lastError === 'string' ? row.lastError : '',
    nextRunAtIso: typeof row.nextRunAtIso === 'string' ? row.nextRunAtIso : null,
    progress: progress && typeof progress.completed === 'number'
      ? {
          completed: progress.completed,
          total: typeof progress.total === 'number' ? progress.total : null,
          message: typeof progress.message === 'string' ? progress.message : '',
          updatedAtIso: typeof progress.updatedAtIso === 'string' ? progress.updatedAtIso : '',
        }
      : null,
    health: ['healthy', 'degraded', 'unhealthy', 'paused'].includes(String(row.health))
      ? row.health as BackgroundTaskStatus['health']
      : 'healthy',
  }
}

async function requestTasks(init?: RequestInit): Promise<BackgroundTaskStatus[]> {
  const { result } = await fetchCodexResultRecord('/codex-api/background-tasks', {
    init,
    method: 'background-tasks',
    networkErrorMessage: 'Background task request failed before it was sent',
    httpErrorMessage: 'Background task request failed',
    malformedMessage: 'Background task request returned malformed data',
  })
  return (Array.isArray(result.tasks) ? result.tasks : [])
    .map(normalizeTask)
    .filter((task): task is BackgroundTaskStatus => task !== null)
}

export function fetchBackgroundTasks(): Promise<BackgroundTaskStatus[]> {
  return requestTasks()
}

export function controlBackgroundTask(name: string, action: 'run' | 'pause' | 'resume'): Promise<BackgroundTaskStatus[]> {
  return requestTasks(jsonPostInit({ name, action }))
}
