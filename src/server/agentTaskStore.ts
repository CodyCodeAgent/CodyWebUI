import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { withLocalDatabase } from './localDatabase.js'

export type AgentTaskSchedule =
  | { kind: 'once'; runAtIso: string }
  | { kind: 'interval'; intervalMinutes: number }
  | { kind: 'daily'; time: string; weekdaysOnly?: boolean; excludedDates?: string[] }
  | { kind: 'weekly'; weekday: number; weekdays?: number[]; time: string; excludedDates?: string[] }
  | { kind: 'monthly'; day: number; time: string; excludedDates?: string[] }
  | { kind: 'cron'; expression: string }

export type AgentTaskPermission = 'read-only' | 'workspace-write'
export type AgentTaskEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type AgentTaskRunStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled'
export type AgentTaskConcurrencyPolicy = 'skip' | 'queue' | 'replace'
export type AgentTaskNotificationPolicy = 'off' | 'important' | 'all'
export type AgentTaskOutputMode = 'conversation' | 'file' | 'notification' | 'file-and-notification'

export type AgentTask = {
  id: string
  name: string
  description: string
  cwd: string
  prompt: string
  schedule: AgentTaskSchedule
  timezone: string
  model: string
  effort: AgentTaskEffort | null
  permission: AgentTaskPermission
  enabled: boolean
  timeoutMinutes: number
  maxRetries: number
  concurrencyPolicy: AgentTaskConcurrencyPolicy
  notificationPolicy: AgentTaskNotificationPolicy
  outputMode: AgentTaskOutputMode
  outputPath: string
  maxTokens: number
  pauseAfterFailures: number
  version: number
  nextRunAtIso: string | null
  lastRunAtIso: string | null
  consecutiveFailures: number
  archivedAtIso: string | null
  createdAtIso: string
  updatedAtIso: string
}

export type AgentTaskRun = {
  id: string
  taskId: string
  status: AgentTaskRunStatus | 'skipped'
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

export type AgentTaskRunEvent = {
  id: number
  runId: string
  kind: 'queued' | 'started' | 'approval' | 'progress' | 'usage' | 'delivery' | 'completed' | 'cancelled' | 'skipped'
  message: string
  createdAtIso: string
}

export type AgentTaskVersion = {
  taskId: string
  version: number
  definition: AgentTaskInput
  createdAtIso: string
}

export type AgentTaskInput = Omit<AgentTask, 'id' | 'version' | 'nextRunAtIso' | 'lastRunAtIso' | 'consecutiveFailures' | 'archivedAtIso' | 'createdAtIso' | 'updatedAtIso'>

type AgentTaskRow = {
  id: string
  name: string
  description: string
  cwd: string
  prompt: string
  scheduleJson: string
  timezone: string
  model: string
  effort: string | null
  permission: string
  enabled: number
  timeoutMinutes: number
  maxRetries: number
  concurrencyPolicy: string
  notificationPolicy: string
  outputMode: string
  outputPath: string
  maxTokens: number
  pauseAfterFailures: number
  version: number
  nextRunAtIso: string | null
  retryAtIso: string | null
  retryScheduledAtIso: string | null
  retryAttempt: number
  lastRunAtIso: string | null
  consecutiveFailures: number
  archivedAtIso: string | null
  createdAtIso: string
  updatedAtIso: string
}

type AgentTaskRunRow = {
  id: string
  taskId: string
  status: string
  trigger: string
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
  deliveryStatus: string
  deliveryError: string
}

const TASK_SELECT = `SELECT id, name, description, cwd, prompt,
  schedule_json AS scheduleJson, timezone, model, effort, permission, enabled,
  timeout_minutes AS timeoutMinutes, max_retries AS maxRetries,
  concurrency_policy AS concurrencyPolicy, notification_policy AS notificationPolicy,
  output_mode AS outputMode, output_path AS outputPath, max_tokens AS maxTokens,
  pause_after_failures AS pauseAfterFailures, version,
  next_run_at_iso AS nextRunAtIso, retry_at_iso AS retryAtIso,
  retry_scheduled_at_iso AS retryScheduledAtIso, retry_attempt AS retryAttempt,
  last_run_at_iso AS lastRunAtIso,
  consecutive_failures AS consecutiveFailures, created_at_iso AS createdAtIso,
  archived_at_iso AS archivedAtIso, updated_at_iso AS updatedAtIso FROM agent_tasks`

const RUN_SELECT = `SELECT id, task_id AS taskId, status, trigger,
  scheduled_at_iso AS scheduledAtIso, started_at_iso AS startedAtIso,
  completed_at_iso AS completedAtIso, thread_id AS threadId, turn_id AS turnId,
  summary, error, input_tokens AS inputTokens, output_tokens AS outputTokens,
  total_tokens AS totalTokens, retry_number AS retryNumber, task_version AS taskVersion,
  delivery_status AS deliveryStatus, delivery_error AS deliveryError FROM agent_task_runs`

function addColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((value) => value.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function ensureTables(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schedule_json TEXT NOT NULL,
    timezone TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    effort TEXT,
    permission TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    timeout_minutes INTEGER NOT NULL DEFAULT 45,
    max_retries INTEGER NOT NULL DEFAULT 1,
    concurrency_policy TEXT NOT NULL DEFAULT 'skip',
    notification_policy TEXT NOT NULL DEFAULT 'important',
    output_mode TEXT NOT NULL DEFAULT 'conversation',
    output_path TEXT NOT NULL DEFAULT '',
    max_tokens INTEGER NOT NULL DEFAULT 0,
    pause_after_failures INTEGER NOT NULL DEFAULT 3,
    version INTEGER NOT NULL DEFAULT 1,
    next_run_at_iso TEXT,
    retry_at_iso TEXT,
    retry_scheduled_at_iso TEXT,
    retry_attempt INTEGER NOT NULL DEFAULT 0,
    last_run_at_iso TEXT,
    lease_until_iso TEXT,
    archived_at_iso TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at_iso TEXT NOT NULL,
    updated_at_iso TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks(enabled, next_run_at_iso);
  CREATE TABLE IF NOT EXISTS agent_task_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL,
    scheduled_at_iso TEXT NOT NULL,
    started_at_iso TEXT,
    completed_at_iso TEXT,
    thread_id TEXT NOT NULL DEFAULT '',
    turn_id TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    retry_number INTEGER NOT NULL DEFAULT 0,
    task_version INTEGER NOT NULL DEFAULT 1,
    delivery_status TEXT NOT NULL DEFAULT 'not_requested',
    delivery_error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_agent_task_runs_task ON agent_task_runs(task_id, scheduled_at_iso DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_task_runs_active ON agent_task_runs(status, turn_id);
  CREATE TABLE IF NOT EXISTS agent_task_run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES agent_task_runs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    created_at_iso TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_task_run_events_run ON agent_task_run_events(run_id, id);
  CREATE TABLE IF NOT EXISTS agent_task_versions (
    task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    definition_json TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    PRIMARY KEY(task_id, version)
  );
  CREATE TABLE IF NOT EXISTS agent_task_scheduler_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    owner_id TEXT NOT NULL,
    lease_until_iso TEXT NOT NULL
  );`)
  addColumn(db, 'agent_tasks', 'concurrency_policy', "TEXT NOT NULL DEFAULT 'skip'")
  addColumn(db, 'agent_tasks', 'notification_policy', "TEXT NOT NULL DEFAULT 'important'")
  addColumn(db, 'agent_tasks', 'output_mode', "TEXT NOT NULL DEFAULT 'conversation'")
  addColumn(db, 'agent_tasks', 'output_path', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'agent_tasks', 'max_tokens', 'INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'agent_tasks', 'pause_after_failures', 'INTEGER NOT NULL DEFAULT 3')
  addColumn(db, 'agent_tasks', 'version', 'INTEGER NOT NULL DEFAULT 1')
  addColumn(db, 'agent_tasks', 'retry_at_iso', 'TEXT')
  addColumn(db, 'agent_tasks', 'retry_scheduled_at_iso', 'TEXT')
  addColumn(db, 'agent_tasks', 'retry_attempt', 'INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'agent_tasks', 'archived_at_iso', 'TEXT')
  addColumn(db, 'agent_task_runs', 'task_version', 'INTEGER NOT NULL DEFAULT 1')
  addColumn(db, 'agent_task_runs', 'delivery_status', "TEXT NOT NULL DEFAULT 'not_requested'")
  addColumn(db, 'agent_task_runs', 'delivery_error', "TEXT NOT NULL DEFAULT ''")
}

function parseSchedule(raw: string): AgentTaskSchedule {
  const value = JSON.parse(raw) as Record<string, unknown>
  return normalizeSchedule(value)
}

function normalizeTime(value: unknown): string {
  const time = typeof value === 'string' ? value.trim() : ''
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw new Error('Schedule time must use HH:mm')
  return time
}

function normalizeExcludedDates(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const dates = Array.from(new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/u.test(item)))).slice(0, 366)
  return dates.length > 0 ? dates : undefined
}

function cronValues(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isInteger(step) || step < 1) throw new Error('Cron step must be a positive integer')
    const [rawStart, rawEnd] = rangePart === '*' ? [String(min), String(max)] : rangePart.split('-')
    const start = Number(rawStart)
    const end = rawEnd === undefined ? start : Number(rawEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || end < start) throw new Error('Cron field is out of range')
    for (let value = start; value <= end; value += step) values.add(value)
  }
  return values
}

function parseCron(expression: string): { minute: Set<number>; hour: Set<number>; day: Set<number>; month: Set<number>; weekday: Set<number>; dayAny: boolean; weekdayAny: boolean } {
  const fields = expression.trim().split(/\s+/u)
  if (fields.length !== 5) throw new Error('Cron expression must contain five fields')
  return {
    minute: cronValues(fields[0]!, 0, 59), hour: cronValues(fields[1]!, 0, 23),
    day: cronValues(fields[2]!, 1, 31), month: cronValues(fields[3]!, 1, 12),
    weekday: cronValues(fields[4]!, 0, 6),
    dayAny: fields[2] === '*', weekdayAny: fields[4] === '*',
  }
}

export function normalizeSchedule(value: unknown): AgentTaskSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A valid schedule is required')
  const row = value as Record<string, unknown>
  if (row.kind === 'once') {
    const runAtIso = typeof row.runAtIso === 'string' ? row.runAtIso.trim() : ''
    if (!Number.isFinite(Date.parse(runAtIso))) throw new Error('One-time schedule requires a valid date')
    return { kind: 'once', runAtIso: new Date(runAtIso).toISOString() }
  }
  if (row.kind === 'interval') {
    const intervalMinutes = typeof row.intervalMinutes === 'number' ? Math.round(row.intervalMinutes) : 0
    if (intervalMinutes < 5 || intervalMinutes > 43_200) throw new Error('Interval must be between 5 minutes and 30 days')
    return { kind: 'interval', intervalMinutes }
  }
  if (row.kind === 'daily') return {
    kind: 'daily', time: normalizeTime(row.time), weekdaysOnly: row.weekdaysOnly === true || undefined,
    excludedDates: normalizeExcludedDates(row.excludedDates),
  }
  if (row.kind === 'weekly') {
    const weekday = typeof row.weekday === 'number' ? Math.round(row.weekday) : -1
    if (weekday < 0 || weekday > 6) throw new Error('Weekday must be between 0 and 6')
    const weekdays = Array.isArray(row.weekdays)
      ? Array.from(new Set(row.weekdays.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6))).sort()
      : []
    return { kind: 'weekly', weekday, weekdays: weekdays.length > 0 ? weekdays : undefined, time: normalizeTime(row.time), excludedDates: normalizeExcludedDates(row.excludedDates) }
  }
  if (row.kind === 'monthly') {
    const day = typeof row.day === 'number' ? Math.round(row.day) : 0
    if (day < 1 || day > 31) throw new Error('Monthly day must be between 1 and 31')
    return { kind: 'monthly', day, time: normalizeTime(row.time), excludedDates: normalizeExcludedDates(row.excludedDates) }
  }
  if (row.kind === 'cron') {
    const expression = typeof row.expression === 'string' ? row.expression.trim() : ''
    parseCron(expression)
    return { kind: 'cron', expression }
  }
  throw new Error('Unsupported schedule kind')
}

function zonedParts(timestampMs: number, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(timestampMs))
  const part = (type: Intl.DateTimeFormatPartTypes) => values.find((value) => value.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'))
  return {
    year: Number(part('year')), month: Number(part('month')), day: Number(part('day')),
    hour: Number(part('hour')), minute: Number(part('minute')), weekday,
  }
}

function localPartsToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string): number {
  // Deterministic DST policy: a nonexistent wall-clock time shifts forward by
  // the DST gap; an ambiguous wall-clock time resolves to its first occurrence.
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  let candidate = desiredAsUtc
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(candidate, timezone)
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    candidate += desiredAsUtc - actualAsUtc
  }
  return candidate
}

function addLocalDays(parts: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function calculateNextAgentTaskRun(schedule: AgentTaskSchedule, timezone: string, afterMs = Date.now()): string | null {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format() } catch { throw new Error('Invalid timezone') }
  if (schedule.kind === 'once') {
    const timestamp = Date.parse(schedule.runAtIso)
    return timestamp > afterMs ? new Date(timestamp).toISOString() : null
  }
  if (schedule.kind === 'interval') return new Date(afterMs + schedule.intervalMinutes * 60_000).toISOString()

  if (schedule.kind === 'cron') {
    const cron = parseCron(schedule.expression)
    let candidate = Math.floor(afterMs / 60_000) * 60_000 + 60_000
    const limit = candidate + 2 * 366 * 24 * 60 * 60_000
    while (candidate <= limit) {
      const parts = zonedParts(candidate, timezone)
      const dayMatch = cron.day.has(parts.day)
      const weekdayMatch = cron.weekday.has(parts.weekday)
      const calendarMatch = cron.dayAny ? weekdayMatch : cron.weekdayAny ? dayMatch : dayMatch || weekdayMatch
      if (cron.minute.has(parts.minute) && cron.hour.has(parts.hour) && cron.month.has(parts.month) && calendarMatch) return new Date(candidate).toISOString()
      candidate += 60_000
    }
    throw new Error('Cron schedule does not produce a run within two years')
  }

  const current = zonedParts(afterMs, timezone)
  const [hour, minute] = schedule.time.split(':').map(Number) as [number, number]
  const excluded = new Set(schedule.excludedDates ?? [])
  const allowedWeekdays = schedule.kind === 'weekly' ? new Set(schedule.weekdays ?? [schedule.weekday]) : null
  for (let offset = 0; offset <= 370; offset += 1) {
    const date = addLocalDays(current, offset)
    const candidate = localPartsToUtc({ ...date, hour, minute }, timezone)
    if (candidate <= afterMs) continue
    const parts = zonedParts(candidate, timezone)
    const dateKey = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    if (excluded.has(dateKey)) continue
    if (schedule.kind === 'daily' && schedule.weekdaysOnly && (parts.weekday === 0 || parts.weekday === 6)) continue
    if (schedule.kind === 'weekly' && !allowedWeekdays?.has(parts.weekday)) continue
    if (schedule.kind === 'monthly' && parts.day !== Math.min(schedule.day, new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate())) continue
    return new Date(candidate).toISOString()
  }
  throw new Error('Schedule does not produce a run within one year')
}

function normalizeInput(value: AgentTaskInput): AgentTaskInput {
  if (!value || typeof value !== 'object') throw new Error('Agent task definition is required')
  const name = value.name?.trim()
  const cwd = value.cwd?.trim()
  const prompt = value.prompt?.trim()
  if (!name || name.length > 120) throw new Error('Task name is required and must be at most 120 characters')
  if (!cwd) throw new Error('Workspace is required')
  if (!prompt || prompt.length > 100_000) throw new Error('Prompt is required and must be at most 100,000 characters')
  const timezone = value.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const schedule = normalizeSchedule(value.schedule)
  calculateNextAgentTaskRun(schedule, timezone, Date.now() - 1)
  const permission: AgentTaskPermission = value.permission === 'workspace-write' ? 'workspace-write' : 'read-only'
  const allowedEfforts = new Set<AgentTaskEffort>(['minimal', 'low', 'medium', 'high', 'xhigh'])
  const effort = value.effort && allowedEfforts.has(value.effort) ? value.effort : null
  const concurrencyPolicy: AgentTaskConcurrencyPolicy = ['skip', 'queue', 'replace'].includes(value.concurrencyPolicy) ? value.concurrencyPolicy : 'skip'
  const notificationPolicy: AgentTaskNotificationPolicy = ['off', 'important', 'all'].includes(value.notificationPolicy) ? value.notificationPolicy : 'important'
  const outputMode: AgentTaskOutputMode = ['conversation', 'file', 'notification', 'file-and-notification'].includes(value.outputMode) ? value.outputMode : 'conversation'
  const outputPath = value.outputPath?.trim().slice(0, 500) ?? ''
  if ((outputMode === 'file' || outputMode === 'file-and-notification') && (!outputPath || outputPath.startsWith('/') || outputPath.includes('..'))) {
    throw new Error('Output file must be a safe path relative to the workspace')
  }
  return {
    name,
    description: value.description?.trim().slice(0, 500) ?? '',
    cwd,
    prompt,
    schedule,
    timezone,
    model: value.model?.trim().slice(0, 120) ?? '',
    effort,
    permission,
    enabled: value.enabled !== false,
    timeoutMinutes: Math.min(240, Math.max(5, Math.round(value.timeoutMinutes || 45))),
    maxRetries: Math.min(5, Math.max(0, Math.round(value.maxRetries || 0))),
    concurrencyPolicy,
    notificationPolicy,
    outputMode,
    outputPath,
    maxTokens: Math.min(10_000_000, Math.max(0, Math.round(value.maxTokens || 0))),
    pauseAfterFailures: Math.min(20, Math.max(1, Math.round(value.pauseAfterFailures || 3))),
  }
}

export function validateAgentTaskInput(value: AgentTaskInput): AgentTaskInput {
  return normalizeInput(value)
}

export async function acquireAgentTaskSchedulerLease(ownerId: string, now = new Date(), ttlMs = 30_000): Promise<boolean> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const nowIso = now.toISOString()
    const leaseUntilIso = new Date(now.getTime() + ttlMs).toISOString()
    return db.transaction(() => {
      const current = db.prepare('SELECT owner_id AS ownerId, lease_until_iso AS leaseUntilIso FROM agent_task_scheduler_lock WHERE id = 1')
        .get() as { ownerId: string; leaseUntilIso: string } | undefined
      if (current && current.ownerId !== ownerId && current.leaseUntilIso > nowIso) return false
      db.prepare(`INSERT INTO agent_task_scheduler_lock (id, owner_id, lease_until_iso) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, lease_until_iso = excluded.lease_until_iso`)
        .run(ownerId, leaseUntilIso)
      return true
    })()
  })
}

export async function releaseAgentTaskSchedulerLease(ownerId: string): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare('DELETE FROM agent_task_scheduler_lock WHERE id = 1 AND owner_id = ?').run(ownerId)
  })
}

function mapTask(row: AgentTaskRow): AgentTask {
  const effectiveNextRunAtIso = row.retryAtIso && (!row.nextRunAtIso || row.retryAtIso < row.nextRunAtIso)
    ? row.retryAtIso
    : row.nextRunAtIso
  return {
    id: row.id, name: row.name, description: row.description, cwd: row.cwd, prompt: row.prompt,
    schedule: parseSchedule(row.scheduleJson), timezone: row.timezone, model: row.model,
    effort: row.effort as AgentTaskEffort | null, permission: row.permission as AgentTaskPermission,
    enabled: row.enabled === 1, timeoutMinutes: row.timeoutMinutes, maxRetries: row.maxRetries,
    concurrencyPolicy: row.concurrencyPolicy as AgentTaskConcurrencyPolicy,
    notificationPolicy: row.notificationPolicy as AgentTaskNotificationPolicy,
    outputMode: row.outputMode as AgentTaskOutputMode, outputPath: row.outputPath,
    maxTokens: row.maxTokens, pauseAfterFailures: row.pauseAfterFailures, version: row.version,
    nextRunAtIso: effectiveNextRunAtIso, lastRunAtIso: row.lastRunAtIso,
    consecutiveFailures: row.consecutiveFailures, archivedAtIso: row.archivedAtIso,
    createdAtIso: row.createdAtIso, updatedAtIso: row.updatedAtIso,
  }
}

function mapRun(row: AgentTaskRunRow): AgentTaskRun {
  return {
    id: row.id, taskId: row.taskId, status: row.status as AgentTaskRun['status'],
    trigger: row.trigger as AgentTaskRun['trigger'], scheduledAtIso: row.scheduledAtIso,
    startedAtIso: row.startedAtIso, completedAtIso: row.completedAtIso,
    threadId: row.threadId, turnId: row.turnId, summary: row.summary, error: row.error,
    inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.totalTokens,
    retryNumber: row.retryNumber, taskVersion: row.taskVersion,
    deliveryStatus: row.deliveryStatus as AgentTaskRun['deliveryStatus'], deliveryError: row.deliveryError,
  }
}

function inputFromTask(task: AgentTask): AgentTaskInput {
  const { id: _id, version: _version, nextRunAtIso: _next, lastRunAtIso: _last, consecutiveFailures: _failures,
    archivedAtIso: _archived,
    createdAtIso: _created, updatedAtIso: _updated, ...input } = task
  return input
}

function saveVersion(db: Database.Database, task: AgentTask, createdAtIso: string): void {
  db.prepare(`INSERT OR REPLACE INTO agent_task_versions (task_id, version, definition_json, created_at_iso)
    VALUES (?, ?, ?, ?)`).run(task.id, task.version, JSON.stringify(inputFromTask(task)), createdAtIso)
}

export async function listAgentTasks(visibility: 'active' | 'archived' = 'active'): Promise<AgentTask[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const predicate = visibility === 'archived' ? 'archived_at_iso IS NOT NULL' : 'archived_at_iso IS NULL'
    return (db.prepare(`${TASK_SELECT} WHERE ${predicate} ORDER BY COALESCE(archived_at_iso, created_at_iso) DESC`).all() as AgentTaskRow[]).map(mapTask)
  })
}

export async function getAgentTask(id: string): Promise<AgentTask | null> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const row = db.prepare(`${TASK_SELECT} WHERE id = ? AND archived_at_iso IS NULL`).get(id) as AgentTaskRow | undefined
    return row ? mapTask(row) : null
  })
}

export async function createAgentTask(value: AgentTaskInput, now = new Date()): Promise<AgentTask> {
  const input = normalizeInput(value)
  const id = randomUUID()
  const createdAtIso = now.toISOString()
  const nextRunAtIso = input.enabled ? calculateNextAgentTaskRun(input.schedule, input.timezone, now.getTime() - 1) : null
  if (input.schedule.kind === 'once' && input.enabled && !nextRunAtIso) throw new Error('One-time schedule must be in the future')
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare(`INSERT INTO agent_tasks (id, name, description, cwd, prompt, schedule_json, timezone, model, effort,
      permission, enabled, timeout_minutes, max_retries, concurrency_policy, notification_policy, output_mode,
      output_path, max_tokens, pause_after_failures, next_run_at_iso, created_at_iso, updated_at_iso)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.name, input.description, input.cwd, input.prompt, JSON.stringify(input.schedule), input.timezone,
        input.model, input.effort, input.permission, input.enabled ? 1 : 0, input.timeoutMinutes, input.maxRetries,
        input.concurrencyPolicy, input.notificationPolicy, input.outputMode, input.outputPath, input.maxTokens,
        input.pauseAfterFailures, nextRunAtIso, createdAtIso, createdAtIso)
    const task = mapTask(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow)
    saveVersion(db, task, createdAtIso)
  })
  return (await getAgentTask(id))!
}

export async function createAgentTaskBatch(values: AgentTaskInput[], now = new Date()): Promise<AgentTask[]> {
  const inputs = values.map(normalizeInput)
  if (inputs.length === 0) return []
  const createdAtIso = now.toISOString()
  return withLocalDatabase((db) => {
    ensureTables(db)
    return db.transaction(() => inputs.map((input) => {
      const id = randomUUID()
      const nextRunAtIso = input.enabled ? calculateNextAgentTaskRun(input.schedule, input.timezone, now.getTime() - 1) : null
      if (input.schedule.kind === 'once' && input.enabled && !nextRunAtIso) throw new Error('One-time schedule must be in the future')
      db.prepare(`INSERT INTO agent_tasks (id, name, description, cwd, prompt, schedule_json, timezone, model, effort,
        permission, enabled, timeout_minutes, max_retries, concurrency_policy, notification_policy, output_mode,
        output_path, max_tokens, pause_after_failures, next_run_at_iso, created_at_iso, updated_at_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.name, input.description, input.cwd, input.prompt, JSON.stringify(input.schedule), input.timezone,
          input.model, input.effort, input.permission, input.enabled ? 1 : 0, input.timeoutMinutes, input.maxRetries,
          input.concurrencyPolicy, input.notificationPolicy, input.outputMode, input.outputPath, input.maxTokens,
          input.pauseAfterFailures, nextRunAtIso, createdAtIso, createdAtIso)
      const task = mapTask(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow)
      saveVersion(db, task, createdAtIso)
      return task
    }))()
  })
}

export async function updateAgentTask(id: string, value: AgentTaskInput, now = new Date()): Promise<AgentTask> {
  const input = normalizeInput(value)
  const updatedAtIso = now.toISOString()
  const nextRunAtIso = input.enabled ? calculateNextAgentTaskRun(input.schedule, input.timezone, now.getTime() - 1) : null
  if (input.schedule.kind === 'once' && input.enabled && !nextRunAtIso) throw new Error('One-time schedule must be in the future')
  const changed = await withLocalDatabase((db) => {
    ensureTables(db)
    const transaction = db.transaction(() => {
      const current = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow | undefined
      if (!current) return 0
      const nextVersion = current.version + 1
      const changes = db.prepare(`UPDATE agent_tasks SET name = ?, description = ?, cwd = ?, prompt = ?, schedule_json = ?,
      timezone = ?, model = ?, effort = ?, permission = ?, enabled = ?, timeout_minutes = ?, max_retries = ?,
      concurrency_policy = ?, notification_policy = ?, output_mode = ?, output_path = ?, max_tokens = ?,
      pause_after_failures = ?, next_run_at_iso = ?, retry_at_iso = NULL, retry_scheduled_at_iso = NULL,
      retry_attempt = 0, version = ?, updated_at_iso = ? WHERE id = ?`)
      .run(input.name, input.description, input.cwd, input.prompt, JSON.stringify(input.schedule), input.timezone,
        input.model, input.effort, input.permission, input.enabled ? 1 : 0, input.timeoutMinutes, input.maxRetries,
        input.concurrencyPolicy, input.notificationPolicy, input.outputMode, input.outputPath, input.maxTokens,
        input.pauseAfterFailures, nextRunAtIso, nextVersion, updatedAtIso, id).changes
      if (changes) saveVersion(db, mapTask(db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow), updatedAtIso)
      return changes
    })
    return transaction()
  })
  if (!changed) throw new Error('Agent task not found')
  return (await getAgentTask(id))!
}

export async function deleteAgentTask(id: string): Promise<void> {
  const changed = await withLocalDatabase((db) => {
    ensureTables(db)
    const nowIso = new Date().toISOString()
    return db.transaction(() => {
      const changes = db.prepare(`UPDATE agent_tasks SET archived_at_iso = ?, enabled = 0, next_run_at_iso = NULL,
        retry_at_iso = NULL, retry_scheduled_at_iso = NULL, retry_attempt = 0
        WHERE id = ? AND lease_until_iso IS NULL AND archived_at_iso IS NULL`)
        .run(nowIso, id).changes
      if (changes) db.prepare(`UPDATE agent_task_runs SET status = 'cancelled', completed_at_iso = ?, error = ?
        WHERE task_id = ? AND status = 'queued'`).run(nowIso, 'Task archived before queued run started.', id)
      return changes
    })()
  })
  if (!changed) throw new Error('Agent task not found, already archived, or currently running')
}

export async function restoreAgentTask(id: string, now = new Date()): Promise<AgentTask> {
  const changed = await withLocalDatabase((db) => {
    ensureTables(db)
    return db.prepare(`UPDATE agent_tasks SET archived_at_iso = NULL, enabled = 0, next_run_at_iso = NULL,
      retry_at_iso = NULL, retry_scheduled_at_iso = NULL, retry_attempt = 0, updated_at_iso = ?
      WHERE id = ? AND archived_at_iso IS NOT NULL`).run(now.toISOString(), id).changes
  })
  if (!changed) throw new Error('Archived Agent task not found')
  return (await getAgentTask(id))!
}

export async function permanentlyDeleteAgentTask(id: string): Promise<void> {
  const changed = await withLocalDatabase((db) => {
    ensureTables(db)
    return db.transaction(() => {
      const archived = db.prepare('SELECT 1 FROM agent_tasks WHERE id = ? AND archived_at_iso IS NOT NULL').get(id)
      if (!archived) return 0
      db.prepare('DELETE FROM agent_task_run_events WHERE run_id IN (SELECT id FROM agent_task_runs WHERE task_id = ?)').run(id)
      db.prepare('DELETE FROM agent_task_runs WHERE task_id = ?').run(id)
      db.prepare('DELETE FROM agent_task_versions WHERE task_id = ?').run(id)
      return db.prepare('DELETE FROM agent_tasks WHERE id = ? AND archived_at_iso IS NOT NULL').run(id).changes
    })()
  })
  if (!changed) throw new Error('Archived Agent task not found')
}

export async function setAgentTaskEnabled(id: string, enabled: boolean, now = new Date()): Promise<AgentTask> {
  const task = await getAgentTask(id)
  if (!task) throw new Error('Agent task not found')
  const nextRunAtIso = enabled ? calculateNextAgentTaskRun(task.schedule, task.timezone, now.getTime() - 1) : null
  if (enabled && task.schedule.kind === 'once' && !nextRunAtIso) throw new Error('One-time schedule has already passed')
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare(`UPDATE agent_tasks SET enabled = ?, next_run_at_iso = ?, retry_at_iso = NULL,
      retry_scheduled_at_iso = NULL, retry_attempt = 0, updated_at_iso = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, nextRunAtIso, now.toISOString(), id)
  })
  return (await getAgentTask(id))!
}

export async function listDueAgentTaskIds(now = new Date()): Promise<string[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    return (db.prepare(`SELECT id FROM agent_tasks WHERE enabled = 1 AND archived_at_iso IS NULL
      AND ((retry_at_iso IS NOT NULL AND retry_at_iso <= ?) OR (next_run_at_iso IS NOT NULL AND next_run_at_iso <= ?))
      ORDER BY COALESCE(retry_at_iso, next_run_at_iso) LIMIT 20`)
      .all(now.toISOString(), now.toISOString()) as Array<{ id: string }>).map((row) => row.id)
  })
}

export async function claimAgentTask(
  id: string,
  trigger: AgentTaskRun['trigger'],
  now = new Date(),
): Promise<{ task: AgentTask; run: AgentTaskRun } | null> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const transaction = db.transaction(() => {
      const row = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow | undefined
      if (!row) throw new Error('Agent task not found')
      const task = mapTask(row)
      const nowIso = now.toISOString()
      const lease = db.prepare('SELECT lease_until_iso AS leaseUntilIso FROM agent_tasks WHERE id = ?').get(id) as { leaseUntilIso?: string | null }
      if (lease.leaseUntilIso && lease.leaseUntilIso > nowIso) {
        if (trigger === 'schedule' && task.concurrencyPolicy === 'skip' && row.nextRunAtIso) {
          const runId = randomUUID()
          const nextRunAtIso = calculateNextAgentTaskRun(task.schedule, task.timezone, now.getTime())
          db.prepare(`INSERT INTO agent_task_runs (id, task_id, status, trigger, scheduled_at_iso, completed_at_iso, task_version)
            VALUES (?, ?, 'skipped', 'schedule', ?, ?, ?)`).run(runId, id, row.nextRunAtIso, nowIso, task.version)
          db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
            .run(runId, 'skipped', 'Skipped because another run is active.', nowIso)
          db.prepare('UPDATE agent_tasks SET next_run_at_iso = ?, updated_at_iso = ? WHERE id = ?').run(nextRunAtIso, nowIso, id)
        } else if (trigger === 'schedule' && task.concurrencyPolicy === 'queue' && row.nextRunAtIso) {
          const queued = db.prepare(`SELECT COUNT(*) AS count FROM agent_task_runs WHERE task_id = ? AND status = 'queued'`).get(id) as { count: number }
          const executing = db.prepare(`SELECT 1 FROM agent_task_runs WHERE task_id = ? AND status IN ('running', 'waiting_approval') LIMIT 1`).get(id)
          const maximumQueuedRows = executing ? 1 : 2 // one claimed pre-start row plus one pending row
          if (queued.count < maximumQueuedRows) {
            const runId = randomUUID()
            db.prepare(`INSERT INTO agent_task_runs (id, task_id, status, trigger, scheduled_at_iso, task_version)
              VALUES (?, ?, 'queued', 'schedule', ?, ?)`).run(runId, id, row.nextRunAtIso, task.version)
            db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
              .run(runId, 'queued', 'Scheduled run queued behind the active run.', nowIso)
          }
          const nextRunAtIso = calculateNextAgentTaskRun(task.schedule, task.timezone, now.getTime())
          db.prepare('UPDATE agent_tasks SET next_run_at_iso = ?, updated_at_iso = ? WHERE id = ?').run(nextRunAtIso, nowIso, id)
        }
        return null
      }
      const retryDue = trigger !== 'manual' && Boolean(row.retryAtIso && row.retryAtIso <= nowIso)
      const regularDue = trigger !== 'manual' && Boolean(row.nextRunAtIso && row.nextRunAtIso <= nowIso)
      if (trigger !== 'manual' && (!task.enabled || (!retryDue && !regularDue))) return null

      const actualTrigger: AgentTaskRun['trigger'] = trigger === 'manual' ? 'manual' : retryDue ? 'retry' : 'schedule'
      const scheduledAtIso = actualTrigger === 'manual' ? nowIso : actualTrigger === 'retry'
        ? row.retryScheduledAtIso ?? row.retryAtIso ?? nowIso
        : row.nextRunAtIso ?? nowIso
      const shouldAdvance = actualTrigger === 'schedule'
      const nextRunAtIso = shouldAdvance
        ? calculateNextAgentTaskRun(task.schedule, task.timezone, now.getTime())
        : row.nextRunAtIso
      const enabled = task.schedule.kind === 'once' && shouldAdvance ? 0 : task.enabled ? 1 : 0
      const runId = randomUUID()
      const retryNumber = actualTrigger === 'retry' ? row.retryAttempt : 0
      const leaseUntilIso = new Date(now.getTime() + task.timeoutMinutes * 60_000 + 60_000).toISOString()
      const changed = db.prepare(`UPDATE agent_tasks SET lease_until_iso = ?, next_run_at_iso = ?, enabled = ?,
        retry_at_iso = NULL, retry_scheduled_at_iso = NULL, retry_attempt = 0,
        last_run_at_iso = ?, updated_at_iso = ? WHERE id = ? AND (lease_until_iso IS NULL OR lease_until_iso <= ?)`)
        .run(leaseUntilIso, nextRunAtIso, enabled, nowIso, nowIso, id, nowIso).changes
      if (!changed) return null
      db.prepare(`INSERT INTO agent_task_runs (id, task_id, status, trigger, scheduled_at_iso, retry_number, task_version)
        VALUES (?, ?, 'queued', ?, ?, ?, ?)`)
        .run(runId, id, actualTrigger, scheduledAtIso, retryNumber, task.version)
      db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
        .run(runId, 'queued', actualTrigger === 'manual' ? 'Manual run queued.' : actualTrigger === 'retry' ? 'Retry queued.' : 'Scheduled run queued.', nowIso)
      const nextTaskRow = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as AgentTaskRow
      const runRow = db.prepare(`${RUN_SELECT} WHERE id = ?`).get(runId) as AgentTaskRunRow
      return { task: mapTask(nextTaskRow), run: mapRun(runRow) }
    })
    return transaction()
  })
}

export async function enqueueManualAgentTask(id: string, now = new Date()): Promise<AgentTaskRun> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const taskRow = db.prepare(`${TASK_SELECT} WHERE id = ? AND archived_at_iso IS NULL`).get(id) as AgentTaskRow | undefined
    if (!taskRow) throw new Error('Agent task not found')
    const existing = db.prepare(`SELECT COUNT(*) AS count FROM agent_task_runs WHERE task_id = ? AND status = 'queued'`).get(id) as { count: number }
    const lease = db.prepare('SELECT lease_until_iso AS leaseUntilIso FROM agent_tasks WHERE id = ?').get(id) as { leaseUntilIso?: string | null }
    const executing = db.prepare(`SELECT 1 FROM agent_task_runs WHERE task_id = ? AND status IN ('running', 'waiting_approval') LIMIT 1`).get(id)
    const claimedQueuedRows = !executing && lease.leaseUntilIso && lease.leaseUntilIso > now.toISOString() ? 1 : 0
    if ((executing || claimedQueuedRows) && taskRow.concurrencyPolicy === 'skip') throw new Error('Agent task is already running')
    if (existing.count > claimedQueuedRows) throw new Error('Agent task already has a queued run')
    const runId = randomUUID()
    const nowIso = now.toISOString()
    db.prepare(`INSERT INTO agent_task_runs (id, task_id, status, trigger, scheduled_at_iso, task_version)
      VALUES (?, ?, 'queued', 'manual', ?, ?)`).run(runId, id, nowIso, taskRow.version)
    db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
      .run(runId, 'queued', taskRow.concurrencyPolicy === 'replace' && (executing || claimedQueuedRows)
        ? 'Replacement run queued for the scheduler owner.'
        : 'Manual run queued behind the active run.', nowIso)
    return mapRun(db.prepare(`${RUN_SELECT} WHERE id = ?`).get(runId) as AgentTaskRunRow)
  })
}

export async function claimQueuedAgentTask(taskId: string, now = new Date()): Promise<{ task: AgentTask; run: AgentTaskRun } | null> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const transaction = db.transaction(() => {
      const taskRow = db.prepare(`${TASK_SELECT} WHERE id = ? AND archived_at_iso IS NULL`).get(taskId) as AgentTaskRow | undefined
      if (!taskRow) return null
      const nowIso = now.toISOString()
      const lease = db.prepare('SELECT lease_until_iso AS leaseUntilIso FROM agent_tasks WHERE id = ?').get(taskId) as { leaseUntilIso?: string | null }
      if (lease.leaseUntilIso && lease.leaseUntilIso > nowIso) return null
      const runRow = db.prepare(`${RUN_SELECT} WHERE task_id = ? AND status = 'queued' ORDER BY scheduled_at_iso LIMIT 1`).get(taskId) as AgentTaskRunRow | undefined
      if (!runRow) return null
      const task = mapTask(taskRow)
      const leaseUntilIso = new Date(now.getTime() + task.timeoutMinutes * 60_000 + 60_000).toISOString()
      const changed = db.prepare(`UPDATE agent_tasks SET lease_until_iso = ?, last_run_at_iso = ?, updated_at_iso = ?
        WHERE id = ? AND (lease_until_iso IS NULL OR lease_until_iso <= ?)`)
        .run(leaseUntilIso, nowIso, nowIso, taskId, nowIso).changes
      return changed ? { task, run: mapRun(runRow) } : null
    })
    return transaction()
  })
}

export async function markAgentTaskRunStarted(runId: string, threadId: string, turnId: string, now = new Date()): Promise<boolean> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const changed = db.prepare(`UPDATE agent_task_runs SET status = 'running', started_at_iso = ?, thread_id = ?, turn_id = ?
      WHERE id = ? AND status IN ('queued', 'running', 'waiting_approval')`)
      .run(now.toISOString(), threadId, turnId, runId).changes > 0
    if (changed) db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
      .run(runId, 'started', 'Codex turn started.', now.toISOString())
    return changed
  })
}

export async function updateAgentTaskRunState(runId: string, status: 'running' | 'waiting_approval', summary?: string): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    let changed = 0
    if (typeof summary === 'string') changed = db.prepare(`UPDATE agent_task_runs SET status = ?, summary = ? WHERE id = ?
      AND status IN ('queued', 'running', 'waiting_approval')`).run(status, summary.slice(0, 4_000), runId).changes
    else changed = db.prepare(`UPDATE agent_task_runs SET status = ? WHERE id = ?
      AND status IN ('queued', 'running', 'waiting_approval')`).run(status, runId).changes
    if (changed && (status === 'waiting_approval' || typeof summary === 'string')) {
      db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
        .run(runId, status === 'waiting_approval' ? 'approval' : 'progress', status === 'waiting_approval' ? 'Waiting for approval.' : summary!.slice(0, 1_000), new Date().toISOString())
    }
  })
}

export async function updateAgentTaskRunUsage(runId: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    const previous = db.prepare('SELECT total_tokens AS totalTokens FROM agent_task_runs WHERE id = ?').get(runId) as { totalTokens?: number } | undefined
    const totalTokens = Math.max(0, usage.totalTokens)
    const changed = db.prepare(`UPDATE agent_task_runs SET input_tokens = ?, output_tokens = ?, total_tokens = ? WHERE id = ?
      AND status IN ('queued', 'running', 'waiting_approval')`)
      .run(Math.max(0, usage.inputTokens), Math.max(0, usage.outputTokens), totalTokens, runId).changes
    if (changed && (previous?.totalTokens === 0 || totalTokens - (previous?.totalTokens ?? 0) >= 1_000)) {
      db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
        .run(runId, 'usage', `${String(totalTokens)} tokens used.`, new Date().toISOString())
    }
  })
}

export async function completeAgentTaskRun(
  runId: string,
  result: { status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled'; error?: string; summary?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number },
  now = new Date(),
): Promise<boolean> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const transaction = db.transaction(() => {
      const run = db.prepare(`${RUN_SELECT} WHERE id = ?`).get(runId) as AgentTaskRunRow | undefined
      if (!run || ['succeeded', 'failed', 'timed_out', 'cancelled'].includes(run.status)) return false
      const taskRow = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(run.taskId) as AgentTaskRow | undefined
      if (!taskRow) return false
      const task = mapTask(taskRow)
      const success = result.status === 'succeeded'
      const failures = success ? 0 : result.status === 'cancelled' ? task.consecutiveFailures : task.consecutiveFailures + 1
      let nextRunAtIso = taskRow.nextRunAtIso
      let retryAtIso: string | null = null
      let retryScheduledAtIso: string | null = null
      let retryAttempt = 0
      let enabled = task.enabled
      if (!success && result.status !== 'cancelled' && run.retryNumber < task.maxRetries) {
        retryAttempt = run.retryNumber + 1
        retryAtIso = new Date(now.getTime() + Math.min(15 * 60_000, 30_000 * 2 ** run.retryNumber)).toISOString()
        retryScheduledAtIso = run.scheduledAtIso
        enabled = true
      } else if (!success && result.status !== 'cancelled' && task.schedule.kind === 'once') {
        enabled = false
      }
      if (!success && result.status !== 'cancelled' && failures >= task.pauseAfterFailures) {
        enabled = false
        nextRunAtIso = null
        retryAtIso = null
        retryScheduledAtIso = null
        retryAttempt = 0
      }
      db.prepare(`UPDATE agent_task_runs SET status = ?, completed_at_iso = ?, error = ?, summary = ?,
        input_tokens = ?, output_tokens = ?, total_tokens = ? WHERE id = ?`)
        .run(result.status, now.toISOString(), (result.error ?? '').slice(0, 4_000), (result.summary ?? run.summary).slice(0, 4_000),
          Math.max(0, result.inputTokens ?? run.inputTokens), Math.max(0, result.outputTokens ?? run.outputTokens), Math.max(0, result.totalTokens ?? run.totalTokens), runId)
      db.prepare(`UPDATE agent_tasks SET lease_until_iso = NULL, consecutive_failures = ?, enabled = ?,
        next_run_at_iso = ?, retry_at_iso = ?, retry_scheduled_at_iso = ?, retry_attempt = ?,
        updated_at_iso = ? WHERE id = ?`)
        .run(failures, enabled ? 1 : 0, nextRunAtIso, retryAtIso, retryScheduledAtIso, retryAttempt, now.toISOString(), task.id)
      db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
        .run(runId, result.status === 'cancelled' ? 'cancelled' : 'completed', result.error || result.summary || result.status, now.toISOString())
      return true
    })
    return transaction()
  })
}

export async function listAgentTaskRuns(taskId?: string, limit = 50): Promise<AgentTaskRun[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const boundedLimit = Math.min(200, Math.max(1, Math.round(limit)))
    const rows = taskId
      ? db.prepare(`${RUN_SELECT} WHERE task_id = ? ORDER BY scheduled_at_iso DESC LIMIT ?`).all(taskId, boundedLimit)
      : db.prepare(`${RUN_SELECT} ORDER BY scheduled_at_iso DESC LIMIT ?`).all(boundedLimit)
    return (rows as AgentTaskRunRow[]).map(mapRun)
  })
}

export async function listLatestAgentTaskRuns(): Promise<AgentTaskRun[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const rows = db.prepare(`${RUN_SELECT} WHERE id IN (
      SELECT latest.id FROM agent_task_runs AS latest
      WHERE latest.task_id = agent_task_runs.task_id
      ORDER BY latest.scheduled_at_iso DESC, latest.rowid DESC LIMIT 1
    ) ORDER BY scheduled_at_iso DESC`).all() as AgentTaskRunRow[]
    return rows.map(mapRun)
  })
}

export async function listActiveAgentTaskRuns(): Promise<AgentTaskRun[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    return (db.prepare(`${RUN_SELECT} WHERE status IN ('queued', 'running', 'waiting_approval') ORDER BY scheduled_at_iso`).all() as AgentTaskRunRow[]).map(mapRun)
  })
}

export async function recoverQueuedAgentTaskRuns(): Promise<string[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const taskIds = (db.prepare(`SELECT DISTINCT task_id AS taskId FROM agent_task_runs WHERE status = 'queued'`).all() as Array<{ taskId: string }>).map((row) => row.taskId)
    for (const taskId of taskIds) {
      const executing = db.prepare(`SELECT 1 FROM agent_task_runs WHERE task_id = ? AND status IN ('running', 'waiting_approval') LIMIT 1`).get(taskId)
      if (!executing) db.prepare('UPDATE agent_tasks SET lease_until_iso = NULL WHERE id = ?').run(taskId)
    }
    return taskIds
  })
}

export async function listQueuedAgentTaskIds(): Promise<string[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    return (db.prepare(`SELECT DISTINCT r.task_id AS taskId FROM agent_task_runs r
      INNER JOIN agent_tasks t ON t.id = r.task_id
      WHERE r.status = 'queued' AND t.archived_at_iso IS NULL ORDER BY r.scheduled_at_iso`).all() as Array<{ taskId: string }>).map((row) => row.taskId)
  })
}

export async function getActiveAgentTaskRun(taskId: string): Promise<AgentTaskRun | null> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const row = db.prepare(`${RUN_SELECT} WHERE task_id = ? AND status IN ('running', 'waiting_approval') ORDER BY scheduled_at_iso DESC LIMIT 1`).get(taskId) as AgentTaskRunRow | undefined
    return row ? mapRun(row) : null
  })
}

export async function appendAgentTaskRunEvent(runId: string, kind: AgentTaskRunEvent['kind'], message: string, now = new Date()): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
      .run(runId, kind, message.slice(0, 4_000), now.toISOString())
  })
}

export async function listAgentTaskRunEvents(runId: string): Promise<AgentTaskRunEvent[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    return (db.prepare(`SELECT id, run_id AS runId, kind, message, created_at_iso AS createdAtIso
      FROM agent_task_run_events WHERE run_id = ? ORDER BY id`).all(runId) as AgentTaskRunEvent[])
  })
}

export async function updateAgentTaskRunDelivery(runId: string, status: AgentTaskRun['deliveryStatus'], error = '', now = new Date()): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare('UPDATE agent_task_runs SET delivery_status = ?, delivery_error = ? WHERE id = ?').run(status, error.slice(0, 4_000), runId)
    db.prepare('INSERT INTO agent_task_run_events (run_id, kind, message, created_at_iso) VALUES (?, ?, ?, ?)')
      .run(runId, 'delivery', status === 'sent' ? 'Result delivered.' : error || status, now.toISOString())
  })
}

export async function listAgentTaskVersions(taskId: string): Promise<AgentTaskVersion[]> {
  return withLocalDatabase((db) => {
    ensureTables(db)
    const rows = db.prepare(`SELECT task_id AS taskId, version, definition_json AS definitionJson,
      created_at_iso AS createdAtIso FROM agent_task_versions WHERE task_id = ? ORDER BY version DESC`).all(taskId) as Array<{ taskId: string; version: number; definitionJson: string; createdAtIso: string }>
    return rows.map((row) => ({ taskId: row.taskId, version: row.version, definition: normalizeInput(JSON.parse(row.definitionJson) as AgentTaskInput), createdAtIso: row.createdAtIso }))
  })
}

export async function rollbackAgentTask(taskId: string, version: number, now = new Date()): Promise<AgentTask> {
  const item = (await listAgentTaskVersions(taskId)).find((value) => value.version === version)
  if (!item) throw new Error('Agent task version not found')
  return updateAgentTask(taskId, item.definition, now)
}

export async function setAgentTaskRunDeliveryPending(runId: string): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTables(db)
    db.prepare("UPDATE agent_task_runs SET delivery_status = 'pending' WHERE id = ?").run(runId)
  })
}
