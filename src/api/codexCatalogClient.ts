import type { UiProjectGroup, UiThread } from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexJson,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export type CatalogView = 'visible' | 'hidden'

export type CatalogSyncStatus = {
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

export type CatalogResult = {
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  projectOrder: string[]
  hasStoredProjectOrder: boolean
  sync: CatalogSyncStatus | null
}

function normalizeSyncStatus(value: unknown): CatalogSyncStatus | null {
  const row = asRecord(value)
  if (!row || typeof row.name !== 'string') return null
  return {
    name: row.name,
    running: row.running === true,
    runCount: typeof row.runCount === 'number' ? row.runCount : 0,
    successCount: typeof row.successCount === 'number' ? row.successCount : 0,
    failureCount: typeof row.failureCount === 'number' ? row.failureCount : 0,
    lastStartedAtIso: typeof row.lastStartedAtIso === 'string' ? row.lastStartedAtIso : null,
    lastSuccessAtIso: typeof row.lastSuccessAtIso === 'string' ? row.lastSuccessAtIso : null,
    lastFailureAtIso: typeof row.lastFailureAtIso === 'string' ? row.lastFailureAtIso : null,
    lastDurationMs: typeof row.lastDurationMs === 'number' ? row.lastDurationMs : null,
    lastError: typeof row.lastError === 'string' ? row.lastError : '',
    nextRunAtIso: typeof row.nextRunAtIso === 'string' ? row.nextRunAtIso : null,
  }
}

function readCatalogThread(value: unknown, projectKey: string): UiThread | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string' || typeof row.cwd !== 'string') return null
  return {
    id: row.id,
    title: typeof row.title === 'string' && row.title.trim() ? row.title : 'Untitled thread',
    projectName: projectKey,
    cwd: row.cwd,
    createdAtIso: typeof row.createdAtIso === 'string' ? row.createdAtIso : '',
    updatedAtIso: typeof row.updatedAtIso === 'string' ? row.updatedAtIso : '',
    preview: typeof row.preview === 'string' ? row.preview : '',
    unread: false,
    inProgress: false,
  }
}

function normalizeCatalogResult(result: Record<string, unknown>, status: number): CatalogResult {
  const catalog = asRecord(result.catalog)
  const projectRows = Array.isArray(catalog?.projects) ? catalog.projects : []
  const groups: UiProjectGroup[] = []
  const projectDisplayNameById: Record<string, string> = {}
  const projectOrder: string[] = []
  let hasStoredProjectOrder = false

  for (const value of projectRows) {
    const row = asRecord(value)
    if (!row) continue
    const projectKey = typeof row.projectKey === 'string' ? row.projectKey.trim() : ''
    const cwd = typeof row.cwd === 'string' ? row.cwd.trim() : ''
    if (!projectKey || !cwd) continue
    const threads = (Array.isArray(row.threads) ? row.threads : [])
      .map((thread) => readCatalogThread(thread, projectKey))
      .filter((thread): thread is UiThread => thread !== null)
    if (threads.length === 0) continue
    groups.push({ projectName: projectKey, cwd, threads })
    projectOrder.push(projectKey)
    if (typeof row.displayName === 'string' && row.displayName.trim()) {
      projectDisplayNameById[projectKey] = row.displayName.trim()
    }
    if (typeof row.sortOrder === 'number' && Number.isInteger(row.sortOrder)) {
      hasStoredProjectOrder = true
    }
  }

  const sync = normalizeSyncStatus(result.sync)
  if (!catalog) {
    throw new CodexApiError('Catalog returned malformed response', {
      code: 'invalid_response',
      method: 'catalog/list',
      status,
    })
  }

  return { groups, projectDisplayNameById, projectOrder, hasStoredProjectOrder, sync }
}

export async function fetchCatalog(view: CatalogView): Promise<CatalogResult> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/catalog', {
    visibility: view,
  }), {
    method: 'catalog/list',
    networkErrorMessage: 'Catalog request failed before it was sent',
    httpErrorMessage: 'Catalog request failed',
    malformedMessage: 'Catalog returned malformed response',
  })
  return normalizeCatalogResult(result, status)
}

async function postCatalog(path: string, method: string, body: unknown): Promise<void> {
  await fetchCodexJson(path, {
    init: jsonPostInit(body),
    method,
    networkErrorMessage: `${method} failed before it was sent`,
    httpErrorMessage: `${method} failed`,
  })
}

export async function fetchCatalogStatus(): Promise<CatalogSyncStatus | null> {
  const { result } = await fetchCodexResultRecord('/codex-api/catalog/status', {
    method: 'catalog/status',
    networkErrorMessage: 'Catalog status request failed before it was sent',
    httpErrorMessage: 'Catalog status request failed',
    malformedMessage: 'Catalog status returned malformed response',
  })
  return normalizeSyncStatus(result.sync)
}

export async function syncCatalogNow(): Promise<CatalogSyncStatus | null> {
  const { result } = await fetchCodexResultRecord('/codex-api/catalog/sync', {
    init: jsonPostInit({}),
    method: 'catalog/sync',
    networkErrorMessage: 'Catalog sync failed before it was sent',
    httpErrorMessage: 'Catalog sync failed',
    malformedMessage: 'Catalog sync returned malformed response',
  })
  return normalizeSyncStatus(result.sync)
}

export async function setProjectHidden(projectKey: string, hidden: boolean): Promise<void> {
  await postCatalog('/codex-api/catalog/projects/visibility', 'catalog/project-visibility', { projectKey, hidden })
}

export async function setThreadHidden(threadId: string, hidden: boolean): Promise<void> {
  await postCatalog('/codex-api/catalog/threads/visibility', 'catalog/thread-visibility', { threadId, hidden })
}

export async function saveCatalogProjectDisplayName(projectKey: string, displayName: string): Promise<void> {
  await postCatalog('/codex-api/catalog/projects/presentation', 'catalog/project-presentation', {
    projectKey,
    displayName,
  })
}

export async function saveCatalogProjectOrder(projectKeys: string[]): Promise<void> {
  await postCatalog('/codex-api/catalog/projects/order', 'catalog/project-order', { projectKeys })
}
