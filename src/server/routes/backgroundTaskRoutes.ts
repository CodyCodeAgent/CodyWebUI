import type { CatalogSyncService } from '../catalogSyncService.js'
import type { TokenUsageReconciliationService } from '../tokenUsageReconciliationService.js'
import { asRecord, readJsonBody, readString, setJson, type DomainRoute } from './httpRoute.js'

export function createBackgroundTaskRoutes(dependencies: {
  catalogSync: CatalogSyncService
  tokenUsageReconciliation: TokenUsageReconciliationService | null | undefined
}): DomainRoute {
  const snapshot = () => ({
    tasks: [dependencies.catalogSync.getStatus(), dependencies.tokenUsageReconciliation?.getStatus()].filter(Boolean),
    generatedAtIso: new Date().toISOString(),
  })

  return async ({ req, res, url }) => {
    if (url.pathname !== '/codex-api/background-tasks') return false
    if (req.method === 'GET') {
      setJson(res, 200, { result: snapshot() })
      return true
    }
    if (req.method !== 'POST') return false

    const body = asRecord(await readJsonBody(req))
    const name = readString(body?.name)
    const action = readString(body?.action)
    const service = name === 'project-thread-catalog-sync'
      ? dependencies.catalogSync
      : name === 'token-usage-reconciliation'
        ? dependencies.tokenUsageReconciliation
        : null
    if (!service || !['run', 'pause', 'resume'].includes(action)) {
      setJson(res, 400, { error: 'Invalid body: expected a known task name and run, pause, or resume action' })
      return true
    }
    if (action === 'pause') service.pause()
    else if (action === 'resume') service.resume()
    else if (name === 'project-thread-catalog-sync') void dependencies.catalogSync.syncNow().catch(logFailure)
    else void dependencies.tokenUsageReconciliation?.runNow().catch(logFailure)
    setJson(res, action === 'run' ? 202 : 200, { result: snapshot() })
    return true
  }
}

function logFailure(error: unknown): void {
  console.warn(`Background task failed: ${error instanceof Error ? error.message : String(error)}`)
}
