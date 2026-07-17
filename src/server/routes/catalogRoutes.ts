import {
  listCatalog,
  setCatalogProjectDisplayName,
  setCatalogProjectHidden,
  setCatalogProjectOrder,
  setCatalogThreadHidden,
  type CatalogVisibility,
} from '../catalogStore.js'
import type { CatalogSyncService } from '../catalogSyncService.js'
import { asRecord, readJsonBody, readString, setJson, type DomainRoute } from './httpRoute.js'

export function createCatalogRoutes(catalogSync: CatalogSyncService): DomainRoute {
  return async ({ req, res, url }) => {
    if (!url.pathname.startsWith('/codex-api/catalog')) return false
    if (req.method === 'GET' && url.pathname === '/codex-api/catalog') {
      const visibility: CatalogVisibility = url.searchParams.get('visibility') === 'hidden' ? 'hidden' : 'visible'
      await catalogSync.refreshForRead()
      setJson(res, 200, { result: { catalog: await listCatalog(visibility), sync: catalogSync.getStatus() } })
      return true
    }
    if (req.method === 'GET' && url.pathname === '/codex-api/catalog/status') {
      setJson(res, 200, { result: { sync: catalogSync.getStatus() } })
      return true
    }
    if (req.method === 'POST' && url.pathname === '/codex-api/catalog/sync') {
      await catalogSync.syncNow()
      setJson(res, 200, { result: { catalog: await listCatalog('visible'), sync: catalogSync.getStatus() } })
      return true
    }

    const body = asRecord(await readJsonBody(req))
    if (req.method === 'POST' && url.pathname === '/codex-api/catalog/projects/visibility') {
      const projectKey = readString(body?.projectKey)
      if (!projectKey || typeof body?.hidden !== 'boolean') return invalid(res, '{ projectKey, hidden }')
      await setCatalogProjectHidden(projectKey, body.hidden)
    } else if (req.method === 'POST' && url.pathname === '/codex-api/catalog/threads/visibility') {
      const threadId = readString(body?.threadId)
      if (!threadId || typeof body?.hidden !== 'boolean') return invalid(res, '{ threadId, hidden }')
      await setCatalogThreadHidden(threadId, body.hidden)
    } else if (req.method === 'POST' && url.pathname === '/codex-api/catalog/projects/presentation') {
      const projectKey = readString(body?.projectKey)
      if (!projectKey || typeof body?.displayName !== 'string') return invalid(res, '{ projectKey, displayName }')
      await setCatalogProjectDisplayName(projectKey, body.displayName)
    } else if (req.method === 'POST' && url.pathname === '/codex-api/catalog/projects/order') {
      const projectKeys = Array.isArray(body?.projectKeys) ? body.projectKeys.filter((v): v is string => typeof v === 'string') : []
      if (projectKeys.length === 0) return invalid(res, '{ projectKeys: string[] }')
      await setCatalogProjectOrder(projectKeys)
    } else {
      return false
    }
    setJson(res, 200, { result: { ok: true } })
    return true
  }
}

function invalid(res: Parameters<typeof setJson>[0], expected: string): true {
  setJson(res, 400, { error: `Invalid body: expected ${expected}` })
  return true
}
