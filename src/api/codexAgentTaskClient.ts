import { CodexApiError } from './codexErrors'
import { asRecord, fetchCodexResultRecord, jsonPostInit, queryPath } from './codexHttpClient'

export type AgentTaskSchedule =
  | { kind: 'once'; runAtIso: string }
  | { kind: 'interval'; intervalMinutes: number }
  | { kind: 'daily'; time: string; weekdaysOnly?: boolean; excludedDates?: string[] }
  | { kind: 'weekly'; weekday: number; weekdays?: number[]; time: string; excludedDates?: string[] }
  | { kind: 'monthly'; day: number; time: string; excludedDates?: string[] }
  | { kind: 'cron'; expression: string }

export type AgentTaskInput = {
  name: string
  description: string
  cwd: string
  prompt: string
  schedule: AgentTaskSchedule
  timezone: string
  model: string
  effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null
  permission: 'read-only' | 'workspace-write'
  enabled: boolean
  timeoutMinutes: number
  maxRetries: number
  concurrencyPolicy: 'skip' | 'queue' | 'replace'
  notificationPolicy: 'off' | 'important' | 'all'
  conversationMode: 'new' | 'reuse'
  outputMode: 'conversation' | 'file' | 'notification' | 'file-and-notification'
  outputPath: string
  maxTokens: number
  pauseAfterFailures: number
}

export type AgentTask = AgentTaskInput & {
  id: string
  fixedThreadId: string
  nextRunAtIso: string | null
  lastRunAtIso: string | null
  consecutiveFailures: number
  archivedAtIso: string | null
  version: number
  createdAtIso: string
  updatedAtIso: string
}

export type AgentTaskRun = {
  id: string
  taskId: string
  status: 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'skipped'
  trigger: 'schedule' | 'manual' | 'retry'
  scheduledAtIso: string
  startedAtIso: string | null
  completedAtIso: string | null
  threadId: string
  turnId: string
  summary: string
  error: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  retryNumber: number
  taskVersion: number
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'not_requested'
  deliveryError: string
}

export type AgentTaskRunEvent = { id: number; runId: string; kind: string; message: string; createdAtIso: string }
export type AgentTaskVersion = { taskId: string; version: number; definition: AgentTaskInput; createdAtIso: string }
export type AgentTaskDraft = Pick<AgentTaskInput, 'name' | 'prompt' | 'schedule' | 'timezone'> & { confidence: 'high' | 'medium' | 'low'; explanation: string }

function schedule(value: unknown): AgentTaskSchedule | null {
  const row = asRecord(value)
  if (!row || typeof row.kind !== 'string') return null
  if (row.kind === 'once' && typeof row.runAtIso === 'string') return { kind: 'once', runAtIso: row.runAtIso }
  if (row.kind === 'interval' && typeof row.intervalMinutes === 'number') return { kind: 'interval', intervalMinutes: row.intervalMinutes }
  if (row.kind === 'daily' && typeof row.time === 'string') return { kind: 'daily', time: row.time, weekdaysOnly: row.weekdaysOnly === true, excludedDates: Array.isArray(row.excludedDates) ? row.excludedDates.filter((item): item is string => typeof item === 'string') : undefined }
  if (row.kind === 'weekly' && typeof row.weekday === 'number' && typeof row.time === 'string') return { kind: 'weekly', weekday: row.weekday, weekdays: Array.isArray(row.weekdays) ? row.weekdays.filter((item): item is number => typeof item === 'number') : undefined, time: row.time, excludedDates: Array.isArray(row.excludedDates) ? row.excludedDates.filter((item): item is string => typeof item === 'string') : undefined }
  if (row.kind === 'monthly' && typeof row.day === 'number' && typeof row.time === 'string') return { kind: 'monthly', day: row.day, time: row.time, excludedDates: Array.isArray(row.excludedDates) ? row.excludedDates.filter((item): item is string => typeof item === 'string') : undefined }
  if (row.kind === 'cron' && typeof row.expression === 'string') return { kind: 'cron', expression: row.expression }
  return null
}

function task(value: unknown): AgentTask | null {
  const row = asRecord(value)
  const normalizedSchedule = schedule(row?.schedule)
  if (!row || !normalizedSchedule || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.cwd !== 'string' || typeof row.prompt !== 'string') return null
  return {
    id: row.id,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : '',
    cwd: row.cwd,
    prompt: row.prompt,
    schedule: normalizedSchedule,
    timezone: typeof row.timezone === 'string' ? row.timezone : 'UTC',
    model: typeof row.model === 'string' ? row.model : '',
    effort: ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(String(row.effort)) ? row.effort as AgentTask['effort'] : null,
    permission: row.permission === 'workspace-write' ? 'workspace-write' : 'read-only',
    enabled: row.enabled === true,
    timeoutMinutes: typeof row.timeoutMinutes === 'number' ? row.timeoutMinutes : 45,
    maxRetries: typeof row.maxRetries === 'number' ? row.maxRetries : 0,
    concurrencyPolicy: ['skip', 'queue', 'replace'].includes(String(row.concurrencyPolicy)) ? row.concurrencyPolicy as AgentTask['concurrencyPolicy'] : 'skip',
    notificationPolicy: ['off', 'important', 'all'].includes(String(row.notificationPolicy)) ? row.notificationPolicy as AgentTask['notificationPolicy'] : 'important',
    conversationMode: row.conversationMode === 'reuse' ? 'reuse' : 'new',
    fixedThreadId: typeof row.fixedThreadId === 'string' ? row.fixedThreadId : '',
    outputMode: ['conversation', 'file', 'notification', 'file-and-notification'].includes(String(row.outputMode)) ? row.outputMode as AgentTask['outputMode'] : 'conversation',
    outputPath: typeof row.outputPath === 'string' ? row.outputPath : '',
    maxTokens: typeof row.maxTokens === 'number' ? row.maxTokens : 0,
    pauseAfterFailures: typeof row.pauseAfterFailures === 'number' ? row.pauseAfterFailures : 3,
    nextRunAtIso: typeof row.nextRunAtIso === 'string' ? row.nextRunAtIso : null,
    lastRunAtIso: typeof row.lastRunAtIso === 'string' ? row.lastRunAtIso : null,
    consecutiveFailures: typeof row.consecutiveFailures === 'number' ? row.consecutiveFailures : 0,
    archivedAtIso: typeof row.archivedAtIso === 'string' ? row.archivedAtIso : null,
    version: typeof row.version === 'number' ? row.version : 1,
    createdAtIso: typeof row.createdAtIso === 'string' ? row.createdAtIso : '',
    updatedAtIso: typeof row.updatedAtIso === 'string' ? row.updatedAtIso : '',
  }
}

function run(value: unknown): AgentTaskRun | null {
  const row = asRecord(value)
  const statuses = ['queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'timed_out', 'cancelled', 'skipped']
  if (!row || typeof row.id !== 'string' || typeof row.taskId !== 'string' || !statuses.includes(String(row.status))) return null
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status as AgentTaskRun['status'],
    trigger: ['schedule', 'manual', 'retry'].includes(String(row.trigger)) ? row.trigger as AgentTaskRun['trigger'] : 'schedule',
    scheduledAtIso: typeof row.scheduledAtIso === 'string' ? row.scheduledAtIso : '',
    startedAtIso: typeof row.startedAtIso === 'string' ? row.startedAtIso : null,
    completedAtIso: typeof row.completedAtIso === 'string' ? row.completedAtIso : null,
    threadId: typeof row.threadId === 'string' ? row.threadId : '',
    turnId: typeof row.turnId === 'string' ? row.turnId : '',
    summary: typeof row.summary === 'string' ? row.summary : '',
    error: typeof row.error === 'string' ? row.error : '',
    inputTokens: typeof row.inputTokens === 'number' ? row.inputTokens : 0,
    outputTokens: typeof row.outputTokens === 'number' ? row.outputTokens : 0,
    totalTokens: typeof row.totalTokens === 'number' ? row.totalTokens : 0,
    retryNumber: typeof row.retryNumber === 'number' ? row.retryNumber : 0,
    taskVersion: typeof row.taskVersion === 'number' ? row.taskVersion : 1,
    deliveryStatus: ['pending', 'sent', 'failed', 'not_requested'].includes(String(row.deliveryStatus)) ? row.deliveryStatus as AgentTaskRun['deliveryStatus'] : 'not_requested',
    deliveryError: typeof row.deliveryError === 'string' ? row.deliveryError : '',
  }
}

export async function fetchAgentTasks(visibility: 'active' | 'archived' = 'active'): Promise<{ tasks: AgentTask[]; runs: AgentTaskRun[] }> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/agent-tasks', { visibility }), {
    method: 'agent-tasks/list',
    networkErrorMessage: 'Agent tasks request failed before it was sent',
    httpErrorMessage: 'Agent tasks request failed',
    malformedMessage: 'Agent tasks returned malformed data',
  })
  if (!Array.isArray(result.tasks) || !Array.isArray(result.runs)) throw new CodexApiError('Agent tasks returned malformed data', { code: 'invalid_response', method: 'agent-tasks/list', status })
  return {
    tasks: result.tasks.map(task).filter((value): value is AgentTask => value !== null),
    runs: result.runs.map(run).filter((value): value is AgentTaskRun => value !== null),
  }
}

async function save(path: string, init: RequestInit, method: string): Promise<AgentTask> {
  const { result, status } = await fetchCodexResultRecord(path, {
    init, method,
    networkErrorMessage: 'Agent task save failed before it was sent',
    httpErrorMessage: 'Agent task save failed',
    malformedMessage: 'Agent task returned malformed data',
  })
  const normalized = task(result.task)
  if (!normalized) throw new CodexApiError('Agent task returned malformed data', { code: 'invalid_response', method, status })
  return normalized
}

export function createAgentTask(input: AgentTaskInput): Promise<AgentTask> {
  return save('/codex-api/agent-tasks', jsonPostInit({ task: input }), 'agent-tasks/create')
}

export function updateAgentTask(id: string, input: AgentTaskInput): Promise<AgentTask> {
  return save('/codex-api/agent-tasks/item', { ...jsonPostInit({ id, task: input }), method: 'PUT' }, 'agent-tasks/update')
}

export async function deleteAgentTask(id: string, permanent = false): Promise<void> {
  await fetchCodexResultRecord(queryPath('/codex-api/agent-tasks/item', { id, ...(permanent ? { permanent: 'true' } : {}) }), {
    init: { method: 'DELETE' }, method: 'agent-tasks/delete',
    networkErrorMessage: 'Agent task delete failed before it was sent',
    httpErrorMessage: 'Agent task delete failed',
    malformedMessage: 'Agent task delete returned malformed data',
  })
}

export async function controlAgentTask(id: string, action: 'run' | 'pause' | 'resume' | 'cancel' | 'duplicate' | 'restore', runId = ''): Promise<AgentTask | AgentTaskRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/agent-tasks/control', {
    init: jsonPostInit({ id, action, runId }), method: `agent-tasks/${action}`,
    networkErrorMessage: 'Agent task action failed before it was sent',
    httpErrorMessage: 'Agent task action failed',
    malformedMessage: 'Agent task action returned malformed data',
  })
  const normalized = action === 'run' || action === 'cancel' ? run(result.run) : task(result.task)
  if (!normalized) throw new CodexApiError('Agent task action returned malformed data', { code: 'invalid_response', method: `agent-tasks/${action}`, status })
  return normalized
}

export async function parseAgentTask(instruction: string, timezone: string): Promise<AgentTaskDraft> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/agent-tasks/parse', {
    init: jsonPostInit({ instruction, timezone }), method: 'agent-tasks/parse',
    networkErrorMessage: 'Agent task parser request failed before it was sent', httpErrorMessage: 'Agent task parser failed', malformedMessage: 'Agent task parser returned malformed data',
  })
  const row = asRecord(result.draft)
  const parsedSchedule = schedule(row?.schedule)
  if (!row || !parsedSchedule || typeof row.name !== 'string' || typeof row.prompt !== 'string') throw new CodexApiError('Agent task parser returned malformed data', { code: 'invalid_response', method: 'agent-tasks/parse', status })
  return { name: row.name, prompt: row.prompt, schedule: parsedSchedule, timezone: typeof row.timezone === 'string' ? row.timezone : timezone, confidence: ['high','medium','low'].includes(String(row.confidence)) ? row.confidence as AgentTaskDraft['confidence'] : 'low', explanation: typeof row.explanation === 'string' ? row.explanation : '' }
}

export async function fetchAgentTaskRunEvents(runId: string): Promise<AgentTaskRunEvent[]> {
  const { result } = await fetchCodexResultRecord(queryPath('/codex-api/agent-task-run-events', { runId }), { method: 'agent-tasks/events', networkErrorMessage: 'Run timeline request failed before it was sent', httpErrorMessage: 'Run timeline request failed', malformedMessage: 'Run timeline returned malformed data' })
  if (!Array.isArray(result.events)) return []
  return result.events.map(asRecord).filter((row): row is Record<string, unknown> => row !== null).map((row) => ({ id: Number(row.id), runId: String(row.runId ?? ''), kind: String(row.kind ?? ''), message: String(row.message ?? ''), createdAtIso: String(row.createdAtIso ?? '') }))
}

export async function fetchAgentTaskVersions(taskId: string): Promise<AgentTaskVersion[]> {
  const { result } = await fetchCodexResultRecord(queryPath('/codex-api/agent-task-versions', { taskId }), { method: 'agent-tasks/versions', networkErrorMessage: 'Task versions request failed before it was sent', httpErrorMessage: 'Task versions request failed', malformedMessage: 'Task versions returned malformed data' })
  if (!Array.isArray(result.versions)) return []
  return result.versions.map(asRecord).filter((row): row is Record<string, unknown> => row !== null).flatMap((row) => {
    const definition = asRecord(row.definition)
    const parsed = definition ? task({ ...definition, id: row.taskId, version: row.version }) : null
    if (!parsed) return []
    const { id: _id, fixedThreadId: _fixedThreadId, version: _version, nextRunAtIso: _next, lastRunAtIso: _last, consecutiveFailures: _failures,
      archivedAtIso: _archived, createdAtIso: _created, updatedAtIso: _updated, ...input } = parsed
    return [{ taskId: String(row.taskId), version: Number(row.version), definition: input, createdAtIso: String(row.createdAtIso ?? '') }]
  })
}

export function rollbackAgentTask(taskId: string, version: number): Promise<AgentTask> {
  return save('/codex-api/agent-task-versions/rollback', jsonPostInit({ taskId, version }), 'agent-tasks/rollback')
}

export async function exportAgentTasks(ids: string[] = []): Promise<unknown> {
  const { result } = await fetchCodexResultRecord(queryPath('/codex-api/agent-tasks/export', { ids: ids.join(',') }), { method: 'agent-tasks/export', networkErrorMessage: 'Task export failed before it was sent', httpErrorMessage: 'Task export failed', malformedMessage: 'Task export returned malformed data' })
  return result
}

export async function importAgentTasks(payload: unknown): Promise<AgentTask[]> {
  const { result } = await fetchCodexResultRecord('/codex-api/agent-tasks/import', { init: jsonPostInit(payload), method: 'agent-tasks/import', networkErrorMessage: 'Task import failed before it was sent', httpErrorMessage: 'Task import failed', malformedMessage: 'Task import returned malformed data' })
  return Array.isArray(result.tasks) ? result.tasks.map(task).filter((value): value is AgentTask => value !== null) : []
}

export async function fetchAgentTaskRuns(taskId: string, limit = 50): Promise<AgentTaskRun[]> {
  const { result } = await fetchCodexResultRecord(queryPath('/codex-api/agent-task-runs', { taskId, limit: String(limit) }), {
    method: 'agent-tasks/runs', networkErrorMessage: 'Task history request failed before it was sent',
    httpErrorMessage: 'Task history request failed', malformedMessage: 'Task history returned malformed data',
  })
  return Array.isArray(result.runs) ? result.runs.map(run).filter((value): value is AgentTaskRun => value !== null) : []
}
