import type { AgentTaskService } from '../agentTaskService.js'
import type { AgentTaskInput } from '../agentTaskStore.js'
import { asRecord, readJsonBody, readString, setJson, type DomainRoute } from './httpRoute.js'

export function createAgentTaskRoutes(agentTasks: AgentTaskService | null | undefined): DomainRoute {
  return async ({ req, res, url }) => {
    if (!url.pathname.startsWith('/codex-api/agent-task')) return false
    if (!agentTasks) {
      setJson(res, 503, { error: 'Agent task scheduler is unavailable' })
      return true
    }
    if (url.pathname === '/codex-api/agent-tasks' && req.method === 'GET') {
      const visibility = url.searchParams.get('visibility') === 'archived' ? 'archived' : 'active'
      setJson(res, 200, { result: await agentTasks.list(visibility) }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks' && req.method === 'POST') {
      const body = asRecord(await readJsonBody(req)); const task = await agentTasks.create(asRecord(body?.task) as AgentTaskInput)
      setJson(res, 201, { result: { task } }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks/item' && req.method === 'PUT') {
      const body = asRecord(await readJsonBody(req)); const task = await agentTasks.update(readString(body?.id), asRecord(body?.task) as AgentTaskInput)
      setJson(res, 200, { result: { task } }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks/item' && req.method === 'DELETE') {
      const id = url.searchParams.get('id')?.trim() ?? ''; const permanent = url.searchParams.get('permanent') === 'true'
      if (permanent) await agentTasks.permanentlyDelete(id); else await agentTasks.remove(id)
      setJson(res, 200, { result: { deleted: true, permanent } }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks/control' && req.method === 'POST') {
      const body = asRecord(await readJsonBody(req)); const id = readString(body?.id); const action = readString(body?.action)
      if (action === 'run') setJson(res, 202, { result: { run: await agentTasks.runNow(id) } })
      else if (action === 'cancel') setJson(res, 200, { result: { run: await agentTasks.cancel(id, readString(body?.runId)) } })
      else if (action === 'duplicate') setJson(res, 201, { result: { task: await agentTasks.duplicate(id) } })
      else if (action === 'restore') setJson(res, 200, { result: { task: await agentTasks.restore(id) } })
      else if (action === 'pause' || action === 'resume') setJson(res, 200, { result: { task: await agentTasks.setEnabled(id, action === 'resume') } })
      else setJson(res, 400, { error: 'Invalid action: expected run, pause, resume, cancel, duplicate, or restore' })
      return true
    }
    if (url.pathname === '/codex-api/agent-tasks/parse' && req.method === 'POST') {
      const body = asRecord(await readJsonBody(req)); setJson(res, 200, { result: { draft: agentTasks.parse(readString(body?.instruction), readString(body?.timezone) || undefined) } }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks/export' && req.method === 'GET') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').map((v) => v.trim()).filter(Boolean); setJson(res, 200, { result: await agentTasks.exportDefinitions(ids) }); return true
    }
    if (url.pathname === '/codex-api/agent-tasks/import' && req.method === 'POST') {
      setJson(res, 201, { result: { tasks: await agentTasks.importDefinitions(await readJsonBody(req)) } }); return true
    }
    if (url.pathname === '/codex-api/agent-task-versions' && req.method === 'GET') {
      setJson(res, 200, { result: { versions: await agentTasks.versions(url.searchParams.get('taskId')?.trim() ?? '') } }); return true
    }
    if (url.pathname === '/codex-api/agent-task-versions/rollback' && req.method === 'POST') {
      const body = asRecord(await readJsonBody(req)); setJson(res, 200, { result: { task: await agentTasks.rollback(readString(body?.taskId), Number(body?.version)) } }); return true
    }
    if (url.pathname === '/codex-api/agent-task-run-events' && req.method === 'GET') {
      setJson(res, 200, { result: { events: await agentTasks.runEvents(url.searchParams.get('runId')?.trim() ?? '') } }); return true
    }
    if (url.pathname === '/codex-api/agent-task-runs' && req.method === 'GET') {
      setJson(res, 200, { result: { runs: await agentTasks.runs(url.searchParams.get('taskId')?.trim() ?? '', Number(url.searchParams.get('limit') ?? 50)) } }); return true
    }
    return false
  }
}
