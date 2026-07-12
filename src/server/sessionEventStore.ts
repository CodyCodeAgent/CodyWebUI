import { execFile } from 'node:child_process'
import { appendFile, mkdir, readFile, realpath, stat } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_SESSION_EVENT_METADATA_CHARS = 800

export type CodexRawNotification = {
  method: string
  params: unknown
  atIso?: string
  metadata?: Record<string, unknown>
}

export type CodexSessionEventSeverity = 'info' | 'success' | 'warning' | 'danger'

export type CodexSessionEventKind =
  | 'task_started'
  | 'approval_required'
  | 'approval_resolved'
  | 'task_completed'
  | 'task_failed'
  | 'agent_message'
  | 'plan_updated'
  | 'thread_compacted'
  | 'rate_limit'
  | 'token_usage'

export type CodexSessionEvent = {
  id: string
  cwd: string
  repoRoot: string
  createdAtIso: string
  threadId: string
  turnId: string
  method: string
  kind: CodexSessionEventKind
  severity: CodexSessionEventSeverity
  title: string
  summary: string
  metadata: Record<string, string | number | boolean>
}

export type CodexSessionEventTrail = {
  cwd: string
  repoRoot: string
  generatedAtIso: string
  events: CodexSessionEvent[]
  truncated: boolean
}

export type CodexWorkspaceSessionStatus =
  | 'running'
  | 'waiting_for_approval'
  | 'failed'
  | 'completed'
  | 'active'
  | 'unknown'

export type CodexWorkspaceSessionSummary = {
  threadId: string
  title: string
  status: CodexWorkspaceSessionStatus
  severity: CodexSessionEventSeverity
  startedAtIso: string
  updatedAtIso: string
  latestTurnId: string
  latestEventKind: CodexSessionEventKind
  latestSummary: string
  eventCount: number
  approvalCount: number
  failedCount: number
  planUpdateCount: number
  messageCount: number
  compactedCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  tokenUsageEventCount: number
  costUsd: number | null
  costEventCount: number
}

export type CodexWorkspaceSessionSummaryTrail = {
  cwd: string
  repoRoot: string
  generatedAtIso: string
  sessions: CodexWorkspaceSessionSummary[]
  truncated: boolean
}

export type CodexDailyTokenUsage = {
  cwd: string
  repoRoot: string
  generatedAtIso: string
  date: string
  timezoneOffsetMinutes: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  tokenUsageEventCount: number
  threadCount: number
  turnCount: number
  costUsd: number | null
  costEventCount: number
  source: 'reconciled-rollouts' | 'realtime-events' | 'none'
  lastReconciledAtIso: string | null
  partial?: boolean
  skippedWorkspaceCount?: number
}

type SessionWorkspace = {
  cwd: string
  repoRoot: string
  gitCommonDir: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNestedString(value: unknown, keys: string[]): string {
  let cursor: unknown = value
  for (const key of keys) {
    const record = asRecord(cursor)
    if (!record) return ''
    cursor = record[key]
  }
  return readString(cursor)
}

function readThreadId(params: unknown): string {
  return (
    readNestedString(params, ['threadId']) ||
    readNestedString(params, ['thread', 'id']) ||
    readNestedString(params, ['turn', 'threadId']) ||
    readNestedString(params, ['request', 'threadId'])
  )
}

function readTurnId(params: unknown): string {
  return (
    readNestedString(params, ['turnId']) ||
    readNestedString(params, ['turn', 'id']) ||
    readNestedString(params, ['request', 'turnId'])
  )
}

function readTurnError(params: unknown): string {
  return (
    readNestedString(params, ['error', 'message']) ||
    readNestedString(params, ['turn', 'error', 'message']) ||
    readNestedString(params, ['response', 'error', 'message']) ||
    readString(asRecord(params)?.error)
  )
}

function readServerRequestMethod(params: unknown): string {
  return (
    readNestedString(params, ['method']) ||
    readNestedString(params, ['request', 'method']) ||
    readNestedString(params, ['params', 'method'])
  )
}

function readItemType(params: unknown): string {
  return readNestedString(params, ['item', 'type']) || readNestedString(params, ['itemType'])
}

function readRateLimitUsedPercent(params: unknown): number | null {
  const rateLimits = asRecord(asRecord(params)?.rateLimits)
  const primary = asRecord(rateLimits?.primary)
  const secondary = asRecord(rateLimits?.secondary)
  return readNumber(primary?.usedPercent) ?? readNumber(secondary?.usedPercent)
}

function readNestedNumber(value: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    let cursor: unknown = value
    for (const key of path) {
      const record = asRecord(cursor)
      if (!record) {
        cursor = null
        break
      }
      cursor = record[key]
    }
    const numberValue = readNumber(cursor)
    if (numberValue !== null) return numberValue
  }
  return null
}

function readTokenUsage(params: unknown): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  hasUsage: boolean
} {
  const inputTokens = readNestedNumber(params, [
    ['usage', 'inputTokens'],
    ['usage', 'input_tokens'],
    ['tokenUsage', 'inputTokens'],
    ['tokenUsage', 'input_tokens'],
    ['turn', 'usage', 'inputTokens'],
    ['turn', 'usage', 'input_tokens'],
    ['response', 'usage', 'inputTokens'],
    ['response', 'usage', 'input_tokens'],
  ]) ?? 0
  const outputTokens = readNestedNumber(params, [
    ['usage', 'outputTokens'],
    ['usage', 'output_tokens'],
    ['tokenUsage', 'outputTokens'],
    ['tokenUsage', 'output_tokens'],
    ['turn', 'usage', 'outputTokens'],
    ['turn', 'usage', 'output_tokens'],
    ['response', 'usage', 'outputTokens'],
    ['response', 'usage', 'output_tokens'],
  ]) ?? 0
  const explicitTotal = readNestedNumber(params, [
    ['usage', 'totalTokens'],
    ['usage', 'total_tokens'],
    ['tokenUsage', 'totalTokens'],
    ['tokenUsage', 'total_tokens'],
    ['turn', 'usage', 'totalTokens'],
    ['turn', 'usage', 'total_tokens'],
    ['response', 'usage', 'totalTokens'],
    ['response', 'usage', 'total_tokens'],
  ])
  const totalTokens = explicitTotal ?? inputTokens + outputTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    hasUsage: inputTokens > 0 || outputTokens > 0 || totalTokens > 0,
  }
}

function readCostUsd(params: unknown): number | null {
  return readNestedNumber(params, [
    ['costUsd'],
    ['cost_usd'],
    ['usage', 'costUsd'],
    ['usage', 'cost_usd'],
    ['tokenUsage', 'costUsd'],
    ['tokenUsage', 'cost_usd'],
    ['turn', 'usage', 'costUsd'],
    ['turn', 'usage', 'cost_usd'],
    ['response', 'usage', 'costUsd'],
    ['response', 'usage', 'cost_usd'],
  ])
}

function sanitizeMetadataValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= MAX_SESSION_EVENT_METADATA_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_SESSION_EVENT_METADATA_CHARS)}...`
}

function compactMetadata(values: Record<string, unknown>): Record<string, string | number | boolean> {
  const metadata: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(values)) {
    const sanitized = sanitizeMetadataValue(value)
    if (sanitized !== null) metadata[key] = sanitized
  }
  return metadata
}

function isInside(parent: string, child: string): boolean {
  const diff = relative(parent, child)
  return diff === '' || (!diff.startsWith('..') && !isAbsolute(diff))
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return String(result.stdout ?? '')
}

async function runGitForCatalogWorkspace(args: string[], cwd: string, timeoutMs: number): Promise<string> {
  const result = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  })
  return String(result.stdout ?? '')
}

async function getCatalogSessionWorkspace(cwd: string, timeoutMs: number): Promise<SessionWorkspace> {
  const requestedCwd = resolve(cwd.trim())
  if (!cwd.trim()) throw new Error('cwd is required')
  const repoRoot = (await runGitForCatalogWorkspace(['rev-parse', '--show-toplevel'], requestedCwd, timeoutMs)).trim()
  const gitCommonDirRaw = (await runGitForCatalogWorkspace(['rev-parse', '--git-common-dir'], requestedCwd, timeoutMs)).trim()
  if (!repoRoot || !gitCommonDirRaw) throw new Error('cwd is not a git workspace')
  const gitCommonDir = isAbsolute(gitCommonDirRaw) ? gitCommonDirRaw : resolve(repoRoot, gitCommonDirRaw)
  return { cwd: requestedCwd, repoRoot, gitCommonDir }
}

async function getSessionWorkspace(cwd: string): Promise<SessionWorkspace> {
  const requestedCwd = cwd.trim()
  if (!requestedCwd) throw new Error('cwd is required')

  const resolvedCwd = await realpath(resolve(requestedCwd))
  const cwdStat = await stat(resolvedCwd)
  if (!cwdStat.isDirectory()) throw new Error('cwd must be a directory')

  const repoRoot = (await runGit(['rev-parse', '--show-toplevel'], resolvedCwd)).trim()
  const gitCommonDirRaw = (await runGit(['rev-parse', '--git-common-dir'], resolvedCwd)).trim()
  const gitCommonDir = isAbsolute(gitCommonDirRaw)
    ? gitCommonDirRaw
    : resolve(repoRoot, gitCommonDirRaw)

  if (!isInside(repoRoot, resolvedCwd)) {
    throw new Error('cwd is outside the git workspace root')
  }

  return {
    cwd: resolvedCwd,
    repoRoot,
    gitCommonDir,
  }
}

async function resolveExistingDirectory(cwd: string): Promise<string> {
  const requestedCwd = cwd.trim()
  if (!requestedCwd) throw new Error('cwd is required')

  const resolvedCwd = await realpath(resolve(requestedCwd))
  const cwdStat = await stat(resolvedCwd)
  if (!cwdStat.isDirectory()) throw new Error('cwd must be a directory')
  return resolvedCwd
}

function emptyDailyTokenUsage(input: {
  cwd: string
  repoRoot: string
  date: string
  timezoneOffsetMinutes: number
}): CodexDailyTokenUsage {
  return {
    cwd: input.cwd,
    repoRoot: input.repoRoot,
    generatedAtIso: new Date().toISOString(),
    date: input.date,
    timezoneOffsetMinutes: input.timezoneOffsetMinutes,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenUsageEventCount: 0,
    threadCount: 0,
    turnCount: 0,
    costUsd: null,
    costEventCount: 0,
    source: 'none',
    lastReconciledAtIso: null,
  }
}

function sessionEventRoot(workspace: SessionWorkspace): string {
  return join(workspace.gitCommonDir, 'cody-web-ui-audit')
}

function sessionEventPath(workspace: SessionWorkspace): string {
  return join(sessionEventRoot(workspace), 'session-events.jsonl')
}

function sessionEventId(method: string, threadId: string, turnId: string, createdAtIso: string): string {
  return [method, threadId, turnId, createdAtIso].filter(Boolean).join(':')
}

export function codexSessionEventFromNotification(
  workspace: { cwd: string; repoRoot: string },
  notification: CodexRawNotification,
): CodexSessionEvent | null {
  const createdAtIso = notification.atIso || new Date().toISOString()
  const params = notification.params
  const notificationMetadata = notification.metadata ?? {}
  const threadId = readThreadId(params)
  const turnId = readTurnId(params)
  const id = sessionEventId(notification.method, threadId, turnId, createdAtIso)

  if (notification.method === 'thread/tokenUsage/updated') {
    const tokenUsage = asRecord(asRecord(params)?.tokenUsage)
    const usage = readTokenUsage({ tokenUsage: tokenUsage?.last })
    if (!usage.hasUsage) return null
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'token_usage',
      severity: 'info',
      title: 'Token usage updated',
      summary: `${usage.totalTokens.toLocaleString()} tokens used.`,
      metadata: compactMetadata({ threadId, turnId, ...usage, usageSource: 'realtime' }),
    }
  }

  if (notification.method === 'turn/started') {
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'task_started',
      severity: 'info',
      title: 'Task started',
      summary: threadId ? `Started work on thread ${threadId}.` : 'Started a task.',
      metadata: compactMetadata({
        threadId,
        turnId,
        beforeCheckpointId: notificationMetadata.beforeCheckpointId,
        beforeCheckpointHasPatch: notificationMetadata.beforeCheckpointHasPatch,
        beforeCheckpointPatchBytes: notificationMetadata.beforeCheckpointPatchBytes,
      }),
    }
  }

  if (notification.method === 'server/request') {
    const requestMethod = readServerRequestMethod(params)
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'approval_required',
      severity: 'warning',
      title: 'Approval required',
      summary: requestMethod ? `${requestMethod} is waiting for approval.` : 'Codex is waiting for approval.',
      metadata: compactMetadata({ threadId, turnId, requestMethod }),
    }
  }

  if (notification.method === 'server/request/resolved') {
    const requestMethod = readServerRequestMethod(params)
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'approval_resolved',
      severity: 'success',
      title: 'Approval resolved',
      summary: requestMethod ? `${requestMethod} was resolved.` : 'A pending approval was resolved.',
      metadata: compactMetadata({ threadId, turnId, requestMethod }),
    }
  }

  if (notification.method === 'turn/completed') {
    const errorMessage = readTurnError(params)
    const tokenUsage = readTokenUsage(params)
    const costUsd = readCostUsd(params)
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: errorMessage ? 'task_failed' : 'task_completed',
      severity: errorMessage ? 'danger' : 'success',
      title: errorMessage ? 'Task failed' : 'Task completed',
      summary: errorMessage || (threadId ? `Completed thread ${threadId}.` : 'Completed a task.'),
      metadata: compactMetadata({
        threadId,
        turnId,
        errorMessage,
        inputTokens: tokenUsage.hasUsage ? tokenUsage.inputTokens : '',
        outputTokens: tokenUsage.hasUsage ? tokenUsage.outputTokens : '',
        totalTokens: tokenUsage.hasUsage ? tokenUsage.totalTokens : '',
        costUsd: costUsd ?? '',
        afterCheckpointId: notificationMetadata.afterCheckpointId,
        afterCheckpointHasPatch: notificationMetadata.afterCheckpointHasPatch,
        afterCheckpointPatchBytes: notificationMetadata.afterCheckpointPatchBytes,
      }),
    }
  }

  if (notification.method === 'item/completed') {
    const itemType = readItemType(params)
    if (itemType !== 'agentMessage' && itemType !== 'plan') return null
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: itemType === 'plan' ? 'plan_updated' : 'agent_message',
      severity: 'info',
      title: itemType === 'plan' ? 'Plan updated' : 'Agent message',
      summary: itemType === 'plan' ? 'Codex completed a plan update.' : 'Codex produced an agent message.',
      metadata: compactMetadata({ threadId, turnId, itemType }),
    }
  }

  if (notification.method === 'turn/plan/updated') {
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'plan_updated',
      severity: 'info',
      title: 'Plan updated',
      summary: 'Codex updated the current plan.',
      metadata: compactMetadata({ threadId, turnId }),
    }
  }

  if (notification.method === 'thread/compacted') {
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'thread_compacted',
      severity: 'info',
      title: 'Thread compacted',
      summary: threadId ? `Thread ${threadId} was compacted.` : 'A thread was compacted.',
      metadata: compactMetadata({ threadId, turnId }),
    }
  }

  if (notification.method === 'account/rateLimits/updated') {
    const percent = readRateLimitUsedPercent(params)
    return {
      id,
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      createdAtIso,
      threadId,
      turnId,
      method: notification.method,
      kind: 'rate_limit',
      severity: percent !== null && percent >= 90 ? 'warning' : 'info',
      title: 'Rate limit updated',
      summary: percent !== null ? `Codex usage is at ${Math.round(percent)}%.` : 'Codex rate limits changed.',
      metadata: compactMetadata({ threadId, turnId, usedPercent: percent ?? '' }),
    }
  }

  return null
}

export async function appendCodexSessionEvent(cwd: string, notification: CodexRawNotification): Promise<CodexSessionEvent | null> {
  const workspace = await getSessionWorkspace(cwd)
  const event = codexSessionEventFromNotification(workspace, notification)
  if (!event) return null

  await mkdir(sessionEventRoot(workspace), { recursive: true })
  await appendFile(sessionEventPath(workspace), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

export async function appendReconciledTokenUsageSnapshot(input: {
  cwd: string
  sessionId: string
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  eventCount: number
  reconciledAtIso: string
}): Promise<CodexSessionEvent> {
  const workspace = await getSessionWorkspace(input.cwd)
  const event: CodexSessionEvent = {
    id: sessionEventId('rollout/tokenUsage/reconciled', input.sessionId, input.date, input.reconciledAtIso),
    cwd: workspace.cwd,
    repoRoot: workspace.repoRoot,
    createdAtIso: input.reconciledAtIso,
    threadId: input.sessionId,
    turnId: input.date,
    method: 'rollout/tokenUsage/reconciled',
    kind: 'token_usage',
    severity: 'info',
    title: 'Token usage reconciled',
    summary: `${input.totalTokens.toLocaleString()} tokens reconciled from the local Codex session.`,
    metadata: compactMetadata({
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      tokenUsageEventCount: input.eventCount,
      usageDate: input.date,
      usageSource: 'rollout',
      reconciledAtIso: input.reconciledAtIso,
    }),
  }
  await mkdir(sessionEventRoot(workspace), { recursive: true })
  await appendFile(sessionEventPath(workspace), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

export async function listCodexSessionEvents(params: {
  cwd: string
  threadId?: string
  limit?: number
}): Promise<CodexSessionEventTrail> {
  const workspace = await getSessionWorkspace(params.cwd)
  const limit = Math.max(1, Math.min(params.limit ?? 80, 300))
  const threadId = params.threadId?.trim() ?? ''

  let raw = ''
  try {
    raw = await readFile(sessionEventPath(workspace), 'utf8')
  } catch {
    return {
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      generatedAtIso: new Date().toISOString(),
      events: [],
      truncated: false,
    }
  }

  const rows = raw.split(/\r?\n/u).filter(Boolean)
  const events: CodexSessionEvent[] = []
  let matchedCount = 0
  for (let index = rows.length - 1; index >= 0 && events.length < limit; index -= 1) {
    try {
      const parsed = JSON.parse(rows[index]) as CodexSessionEvent
      if (threadId && parsed.threadId !== threadId) continue
      matchedCount += 1
      events.push(parsed)
    } catch {
      // Ignore malformed rows while preserving newer valid replay evidence.
    }
  }

  return {
    cwd: workspace.cwd,
    repoRoot: workspace.repoRoot,
    generatedAtIso: new Date().toISOString(),
    events,
    truncated: matchedCount > events.length,
  }
}

function statusFromLatestSessionEvent(event: CodexSessionEvent): CodexWorkspaceSessionStatus {
  if (event.kind === 'approval_required') return 'waiting_for_approval'
  if (event.kind === 'task_failed') return 'failed'
  if (event.kind === 'task_completed') return 'completed'
  if (event.kind === 'task_started') return 'running'
  if (event.kind === 'agent_message' || event.kind === 'plan_updated') return 'active'
  return 'unknown'
}

function sessionTitleFromThreadId(threadId: string): string {
  return threadId.length > 14 ? `Thread ${threadId.slice(0, 8)}` : `Thread ${threadId}`
}

function createSessionSummary(event: CodexSessionEvent): CodexWorkspaceSessionSummary {
  return {
    threadId: event.threadId,
    title: sessionTitleFromThreadId(event.threadId),
    status: statusFromLatestSessionEvent(event),
    severity: event.severity,
    startedAtIso: event.createdAtIso,
    updatedAtIso: event.createdAtIso,
    latestTurnId: event.turnId,
    latestEventKind: event.kind,
    latestSummary: event.summary,
    eventCount: 0,
    approvalCount: 0,
    failedCount: 0,
    planUpdateCount: 0,
    messageCount: 0,
    compactedCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenUsageEventCount: 0,
    costUsd: null,
    costEventCount: 0,
  }
}

function metadataNumber(metadata: CodexSessionEvent['metadata'], key: string): number {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function todayDateString(timezoneOffsetMinutes: number, now = new Date()): string {
  return new Date(now.getTime() - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

function localDateStringFromIso(value: string, timezoneOffsetMinutes: number): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

function tokenUsageDedupKey(event: CodexSessionEvent): string {
  const threadId = event.threadId.trim()
  const turnId = event.turnId.trim()
  if (threadId || turnId) return `${threadId}:${turnId}:${event.method}`
  return event.id
}

function applySessionEventToSummary(
  summary: CodexWorkspaceSessionSummary,
  event: CodexSessionEvent,
): CodexWorkspaceSessionSummary {
  const isNewer = event.createdAtIso >= summary.updatedAtIso
  const inputTokens = metadataNumber(event.metadata, 'inputTokens')
  const outputTokens = metadataNumber(event.metadata, 'outputTokens')
  const totalTokens = metadataNumber(event.metadata, 'totalTokens')
  const costUsd = metadataNumber(event.metadata, 'costUsd')
  const hasTokenUsage = inputTokens > 0 || outputTokens > 0 || totalTokens > 0
  const hasCost = costUsd > 0
  return {
    ...summary,
    status: isNewer ? statusFromLatestSessionEvent(event) : summary.status,
    severity: isNewer ? event.severity : summary.severity,
    startedAtIso: event.createdAtIso < summary.startedAtIso ? event.createdAtIso : summary.startedAtIso,
    updatedAtIso: isNewer ? event.createdAtIso : summary.updatedAtIso,
    latestTurnId: isNewer ? event.turnId : summary.latestTurnId,
    latestEventKind: isNewer ? event.kind : summary.latestEventKind,
    latestSummary: isNewer ? event.summary : summary.latestSummary,
    eventCount: summary.eventCount + 1,
    approvalCount: summary.approvalCount + (event.kind === 'approval_required' ? 1 : 0),
    failedCount: summary.failedCount + (event.kind === 'task_failed' ? 1 : 0),
    planUpdateCount: summary.planUpdateCount + (event.kind === 'plan_updated' ? 1 : 0),
    messageCount: summary.messageCount + (event.kind === 'agent_message' ? 1 : 0),
    compactedCount: summary.compactedCount + (event.kind === 'thread_compacted' ? 1 : 0),
    inputTokens: summary.inputTokens + inputTokens,
    outputTokens: summary.outputTokens + outputTokens,
    totalTokens: summary.totalTokens + (totalTokens || inputTokens + outputTokens),
    tokenUsageEventCount: summary.tokenUsageEventCount + (hasTokenUsage ? 1 : 0),
    costUsd: hasCost ? (summary.costUsd ?? 0) + costUsd : summary.costUsd,
    costEventCount: summary.costEventCount + (hasCost ? 1 : 0),
  }
}

export async function listCodexWorkspaceSessions(params: {
  cwd: string
  limit?: number
}): Promise<CodexWorkspaceSessionSummaryTrail> {
  const workspace = await getSessionWorkspace(params.cwd)
  const limit = Math.max(1, Math.min(params.limit ?? 12, 100))

  let raw = ''
  try {
    raw = await readFile(sessionEventPath(workspace), 'utf8')
  } catch {
    return {
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      generatedAtIso: new Date().toISOString(),
      sessions: [],
      truncated: false,
    }
  }

  const summariesByThread = new Map<string, CodexWorkspaceSessionSummary>()
  for (const row of raw.split(/\r?\n/u).filter(Boolean)) {
    try {
      const event = JSON.parse(row) as CodexSessionEvent
      if (!event.threadId) continue
      const existing = summariesByThread.get(event.threadId) ?? createSessionSummary(event)
      summariesByThread.set(event.threadId, applySessionEventToSummary(existing, event))
    } catch {
      // Ignore malformed rows while preserving workspace-level session history.
    }
  }

  const sessions = Array.from(summariesByThread.values())
    .sort((first, second) => second.updatedAtIso.localeCompare(first.updatedAtIso))

  return {
    cwd: workspace.cwd,
    repoRoot: workspace.repoRoot,
    generatedAtIso: new Date().toISOString(),
    sessions: sessions.slice(0, limit),
    truncated: sessions.length > limit,
  }
}

export async function summarizeDailyTokenUsage(params: {
  cwd: string
  date?: string
  timezoneOffsetMinutes?: number
  catalogLookupTimeoutMs?: number
}): Promise<CodexDailyTokenUsage> {
  const timezoneOffsetMinutes = Number.isFinite(params.timezoneOffsetMinutes)
    ? Number(params.timezoneOffsetMinutes)
    : 0
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(params.date ?? '')
    ? params.date!
    : todayDateString(timezoneOffsetMinutes)
  const catalogLookupTimeoutMs = params.catalogLookupTimeoutMs
  const fallbackCwd = catalogLookupTimeoutMs ? resolve(params.cwd.trim()) : await resolveExistingDirectory(params.cwd)
  let workspace: SessionWorkspace
  try {
    workspace = catalogLookupTimeoutMs
      ? await getCatalogSessionWorkspace(params.cwd, catalogLookupTimeoutMs)
      : await getSessionWorkspace(params.cwd)
  } catch {
    return emptyDailyTokenUsage({
      cwd: fallbackCwd,
      repoRoot: fallbackCwd,
      date,
      timezoneOffsetMinutes,
    })
  }

  let raw = ''
  try {
    raw = await readFile(sessionEventPath(workspace), 'utf8')
  } catch {
    return emptyDailyTokenUsage({
      cwd: workspace.cwd,
      repoRoot: workspace.repoRoot,
      date,
      timezoneOffsetMinutes,
    })
  }

  const reconciledEvents = new Map<string, CodexSessionEvent>()
  const realtimeEvents = new Map<string, CodexSessionEvent>()
  for (const row of raw.split(/\r?\n/u).filter(Boolean)) {
    try {
      const event = JSON.parse(row) as CodexSessionEvent
      const isReconciled = event.method === 'rollout/tokenUsage/reconciled'
      const eventDate = isReconciled ? String(event.metadata.usageDate ?? '') : localDateStringFromIso(event.createdAtIso, timezoneOffsetMinutes)
      if (eventDate !== date) continue
      const inputTokens = metadataNumber(event.metadata, 'inputTokens')
      const outputTokens = metadataNumber(event.metadata, 'outputTokens')
      const totalTokens = metadataNumber(event.metadata, 'totalTokens')
      if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) continue

      const target = isReconciled ? reconciledEvents : realtimeEvents
      const key = tokenUsageDedupKey(event)
      const existing = target.get(key)
      if (!existing || event.createdAtIso >= existing.createdAtIso) {
        target.set(key, event)
      }
    } catch {
      // Ignore malformed rows while preserving usage from valid rows.
    }
  }

  const threads = new Set<string>()
  const turns = new Set<string>()
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let costUsd: number | null = null
  let costEventCount = 0

  // Reconciliation is incremental: during a scan only some sessions may have a
  // rollout snapshot. Replace realtime data per reconciled session instead of
  // replacing the whole workspace total, otherwise usage can temporarily drop.
  const usageEvents = new Map(realtimeEvents)
  for (const reconciledEvent of reconciledEvents.values()) {
    for (const [key, realtimeEvent] of usageEvents) {
      if (realtimeEvent.threadId === reconciledEvent.threadId) usageEvents.delete(key)
    }
    usageEvents.set(tokenUsageDedupKey(reconciledEvent), reconciledEvent)
  }
  let lastReconciledAtIso: string | null = null
  for (const event of usageEvents.values()) {
    const eventInputTokens = metadataNumber(event.metadata, 'inputTokens')
    const eventOutputTokens = metadataNumber(event.metadata, 'outputTokens')
    const eventTotalTokens = metadataNumber(event.metadata, 'totalTokens')
    const eventCostUsd = metadataNumber(event.metadata, 'costUsd')
    inputTokens += eventInputTokens
    outputTokens += eventOutputTokens
    totalTokens += eventTotalTokens || eventInputTokens + eventOutputTokens
    if (event.threadId) threads.add(event.threadId)
    if (event.turnId) turns.add(`${event.threadId}:${event.turnId}`)
    if (eventCostUsd > 0) {
      costUsd = (costUsd ?? 0) + eventCostUsd
      costEventCount += 1
    }
    if (event.method === 'rollout/tokenUsage/reconciled' && (!lastReconciledAtIso || event.createdAtIso > lastReconciledAtIso)) {
      lastReconciledAtIso = event.createdAtIso
    }
  }

  const tokenUsageEventCount = usageEvents.size
  return {
    cwd: workspace.cwd,
    repoRoot: workspace.repoRoot,
    generatedAtIso: new Date().toISOString(),
    date,
    timezoneOffsetMinutes,
    inputTokens,
    outputTokens,
    totalTokens,
    tokenUsageEventCount,
    threadCount: threads.size,
    turnCount: turns.size || tokenUsageEventCount,
    costUsd,
    costEventCount,
    source: reconciledEvents.size > 0 ? 'reconciled-rollouts' : tokenUsageEventCount > 0 ? 'realtime-events' : 'none',
    lastReconciledAtIso,
  }
}

export async function summarizeGlobalDailyTokenUsage(params: {
  cwds: string[]
  date?: string
  timezoneOffsetMinutes?: number
  workspaceTimeoutMs?: number
}): Promise<CodexDailyTokenUsage> {
  const uniqueCwds = [...new Set(params.cwds.map((cwd) => cwd.trim()).filter(Boolean))]
  const timeoutMs = Math.max(100, params.workspaceTimeoutMs ?? 2_000)
  const results = await Promise.all(uniqueCwds.map(async (cwd) => {
    try {
      return await summarizeDailyTokenUsage({
        cwd, date: params.date, timezoneOffsetMinutes: params.timezoneOffsetMinutes,
        catalogLookupTimeoutMs: timeoutMs,
      })
    } catch { return null }
  }))
  const summaries = results.filter((value): value is CodexDailyTokenUsage => value !== null)
  const skippedWorkspaceCount = results.length - summaries.length
  const latestReconciled = summaries.map((row) => row.lastReconciledAtIso).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  const hasReconciled = summaries.some((row) => row.source === 'reconciled-rollouts')
  const hasRealtime = summaries.some((row) => row.source === 'realtime-events')
  const offset = Number.isFinite(params.timezoneOffsetMinutes) ? Number(params.timezoneOffsetMinutes) : 0
  return {
    cwd: '', repoRoot: '', generatedAtIso: new Date().toISOString(),
    date: summaries[0]?.date ?? params.date ?? todayDateString(offset), timezoneOffsetMinutes: offset,
    inputTokens: summaries.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: summaries.reduce((sum, row) => sum + row.outputTokens, 0),
    totalTokens: summaries.reduce((sum, row) => sum + row.totalTokens, 0),
    tokenUsageEventCount: summaries.reduce((sum, row) => sum + row.tokenUsageEventCount, 0),
    threadCount: summaries.reduce((sum, row) => sum + row.threadCount, 0),
    turnCount: summaries.reduce((sum, row) => sum + row.turnCount, 0),
    costUsd: summaries.some((row) => row.costUsd !== null) ? summaries.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null,
    costEventCount: summaries.reduce((sum, row) => sum + row.costEventCount, 0),
    source: hasReconciled ? 'reconciled-rollouts' : hasRealtime ? 'realtime-events' : 'none',
    lastReconciledAtIso: latestReconciled,
    partial: skippedWorkspaceCount > 0,
    skippedWorkspaceCount,
  }
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export async function handleListCodexSessionEvents(url: URL, res: ServerResponse): Promise<void> {
  try {
    const cwd = url.searchParams.get('cwd') ?? ''
    const threadId = url.searchParams.get('threadId') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? '80')
    const result = await listCodexSessionEvents({ cwd, threadId, limit })
    setJson(res, 200, { result })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to list Codex session events'
    setJson(res, 400, { error: message })
  }
}

export async function handleListCodexWorkspaceSessions(url: URL, res: ServerResponse): Promise<void> {
  try {
    const cwd = url.searchParams.get('cwd') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? '12')
    const result = await listCodexWorkspaceSessions({ cwd, limit })
    setJson(res, 200, { result })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to list Codex workspace sessions'
    setJson(res, 400, { error: message })
  }
}

export async function handleDailyTokenUsage(url: URL, res: ServerResponse): Promise<void> {
  try {
    const cwd = url.searchParams.get('cwd') ?? ''
    const date = url.searchParams.get('date') ?? undefined
    const timezoneOffsetMinutes = Number(url.searchParams.get('timezoneOffsetMinutes') ?? '0')
    const result = await summarizeDailyTokenUsage({ cwd, date, timezoneOffsetMinutes })
    setJson(res, 200, { result })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to summarize daily token usage'
    setJson(res, 400, { error: message })
  }
}
