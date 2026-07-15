import { BackgroundTaskRunner, type BackgroundTaskStatus } from './backgroundTaskRunner.js'
import { readBackgroundTaskStatus, writeBackgroundTaskStatus } from './backgroundTaskStore.js'
import { syncCatalogThreads, type CatalogSourceThread } from './catalogStore.js'
import { dataAuthorityPolicy } from '../composables/dataAuthorityPolicy.js'

const CATALOG_SYNC_INTERVAL_MS = 30_000
const CATALOG_SYNC_EVENT_DELAY_MS = 750
const CATALOG_SYNC_NOTIFICATION_METHODS = new Set([
  'thread/started',
  'thread/name/updated',
  'thread/archived',
  'thread/unarchived',
  'turn/completed',
])

type Rpc = (method: string, params: unknown) => Promise<unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toIso(seconds: number | null): string {
  return new Date(Math.max(0, seconds ?? 0) * 1000).toISOString()
}

function normalizeThread(value: unknown, sourceArchived: boolean): CatalogSourceThread | null {
  const row = asRecord(value)
  if (!row) return null
  const id = readString(row.id)
  const cwd = readString(row.cwd)
  if (!id || !cwd) return null
  const preview = readString(row.preview)
  const title = readString(row.name) || readString(row.title) || preview || 'Untitled thread'
  return {
    id,
    cwd,
    title,
    preview,
    createdAtIso: toIso(readNumber(row.createdAt)),
    updatedAtIso: toIso(readNumber(row.updatedAt)),
    sourceArchived,
  }
}

async function listAllThreads(rpc: Rpc, sourceArchived: boolean): Promise<CatalogSourceThread[]> {
  const threads: CatalogSourceThread[] = []
  let cursor: string | null = null

  do {
    const result = asRecord(await rpc('thread/list', {
      archived: sourceArchived,
      limit: 100,
      sortKey: 'updated_at',
      ...(cursor ? { cursor } : {}),
    }))
    const rows = Array.isArray(result?.data) ? result.data : []
    for (const row of rows) {
      const thread = normalizeThread(row, sourceArchived)
      if (thread) threads.push(thread)
    }
    cursor = readString(result?.nextCursor) || null
  } while (cursor)

  return threads
}

export class CatalogSyncService {
  private readonly runner: BackgroundTaskRunner

  constructor(rpc: Rpc) {
    this.runner = new BackgroundTaskRunner({
      name: 'project-thread-catalog-sync',
      intervalMs: CATALOG_SYNC_INTERVAL_MS,
      timeoutMs: 20_000,
      onStatus: (status) => { void writeBackgroundTaskStatus(status).catch(() => undefined) },
      task: async ({ signal, reportProgress }) => {
        reportProgress({ completed: 0, total: 3, message: 'Reading active threads' })
        const [activeThreads, archivedThreads] = await Promise.all([
          listAllThreads(rpc, false),
          listAllThreads(rpc, true),
        ])
        signal.throwIfAborted()
        reportProgress({ completed: 2, total: 3, message: 'Writing catalog snapshot' })
        await syncCatalogThreads([...activeThreads, ...archivedThreads])
        reportProgress({ completed: 3, total: 3, message: 'Catalog synchronized' })
      },
    })
  }

  start(): void {
    void readBackgroundTaskStatus('project-thread-catalog-sync')
      .then((status) => this.runner.hydrateStatus(status))
      .catch(() => undefined)
      .finally(() => this.runner.start({ immediate: true }))
  }

  stop(): void {
    this.runner.stop()
  }

  pause(): void { this.runner.pause() }
  resume(): void { this.runner.resume({ immediate: true }) }

  async syncNow(): Promise<void> {
    await this.runner.runNow()
    const status = this.runner.getStatus()
    if (
      status.lastError &&
      (!status.lastSuccessAtIso || (status.lastFailureAtIso ?? '') >= status.lastSuccessAtIso)
    ) {
      throw new Error(status.lastError)
    }
  }

  async refreshForRead(): Promise<void> {
    const status = this.runner.getStatus()
    const nextRunAtMs = status.nextRunAtIso ? Date.parse(status.nextRunAtIso) : Number.POSITIVE_INFINITY
    if (status.running || status.successCount === 0 || nextRunAtMs <= Date.now() + 2_000) {
      await this.syncNow()
    }
  }

  onNotification(method: string): void {
    if (CATALOG_SYNC_NOTIFICATION_METHODS.has(method)) {
      const policy = dataAuthorityPolicy(method)
      if (policy && (policy.resource !== 'catalog' || policy.realtimeMode !== 'invalidate')) return
      this.runner.scheduleSoon(CATALOG_SYNC_EVENT_DELAY_MS)
    }
  }

  getStatus(): BackgroundTaskStatus {
    return this.runner.getStatus()
  }
}
