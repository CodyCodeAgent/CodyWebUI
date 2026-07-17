import { cwd as getProcessCwd } from 'node:process'
import { runControlledProcess } from '../controlledProcess.js'
import { readJsonBody, setJson, type DomainRoute } from './httpRoute.js'

export function createSmokeRoutes(dependencies: {
  enabled: () => boolean
  injectServerRequest: (payload: unknown) => unknown
}): DomainRoute {
  return async ({ req, res, url }) => {
    if (!url.pathname.startsWith('/codex-api/smoke/')) return false
    if (!dependencies.enabled()) { setJson(res, 404, { error: 'Not found' }); return true }
    if (req.method === 'POST' && url.pathname === '/codex-api/smoke/server-requests') {
      setJson(res, 200, { result: dependencies.injectServerRequest(await readJsonBody(req)) }); return true
    }
    if (req.method === 'POST' && url.pathname === '/codex-api/smoke/controlled-process-epipe') {
      setJson(res, 200, { result: await runControlledProcess({
        command: process.execPath,
        args: ['-e', 'process.stdin.destroy(); setTimeout(() => process.exit(0), 25)'],
        cwd: getProcessCwd(), input: 'x'.repeat(8 * 1024 * 1024), timeoutMs: 2_000,
      }) }); return true
    }
    return false
  }
}
