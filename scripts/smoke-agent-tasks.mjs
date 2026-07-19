import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const TIMEOUT_MS = 15_000

function assert(condition, message) { if (!condition) throw new Error(message) }
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') return server.close(() => reject(new Error('Could not allocate a port')))
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}
function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for server. Output:\n${output}`)), TIMEOUT_MS)
    const onData = (chunk) => {
      output += chunk.toString()
      if (!pattern.test(output)) return
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      resolve()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
  })
}
function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 3_000)
    child.once('exit', () => { clearTimeout(forceKill); resolve() })
    child.kill('SIGTERM')
  })
}
async function json(baseUrl, path, init) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const payload = await response.json()
  assert(response.ok, `${path} returned ${String(response.status)}: ${JSON.stringify(payload)}`)
  return payload
}
function body(method, value) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }
}

const settingsDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-agent-tasks-smoke-'))
const port = await findFreePort()
const server = spawn(process.execPath, ['dist-cli/index.js', '--host', HOST, '--port', String(port), '--no-password'], {
  cwd: process.cwd(),
  env: { ...process.env, CODY_WEB_UI_SETTINGS_DB: join(settingsDir, 'settings.sqlite3') },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForOutput(server, /CodyWeb is running!/u)
  const baseUrl = `http://${HOST}:${String(port)}`
  const taskInput = {
    name: 'Smoke review', description: 'API lifecycle smoke', cwd: process.cwd(), prompt: 'Inspect this workspace without changing it.',
    schedule: { kind: 'once', runAtIso: new Date(Date.now() + 3_600_000).toISOString() },
    timezone: 'UTC', model: '', effort: null, permission: 'read-only', enabled: true, timeoutMinutes: 15, maxRetries: 1,
    concurrencyPolicy: 'skip', notificationPolicy: 'important', outputMode: 'conversation', outputPath: '', maxTokens: 0, pauseAfterFailures: 3,
  }
  const parsed = await json(baseUrl, '/codex-api/agent-tasks/parse', body('POST', { instruction: 'every weekday at 9 review CI', timezone: 'UTC' }))
  assert(parsed?.result?.draft?.schedule?.kind === 'daily' && parsed.result.draft.schedule.weekdaysOnly === true, 'natural-language schedule was not parsed')
  const created = await json(baseUrl, '/codex-api/agent-tasks', body('POST', { task: taskInput }))
  const taskId = created?.result?.task?.id
  assert(typeof taskId === 'string' && taskId, 'create did not return an Agent task id')
  assert(created.result.task.nextRunAtIso, 'created Agent task has no next run')

  await json(baseUrl, '/codex-api/agent-tasks/item', body('PUT', { id: taskId, task: { ...taskInput, name: 'Smoke review updated' } }))
  const versions = await json(baseUrl, `/codex-api/agent-task-versions?taskId=${encodeURIComponent(taskId)}`)
  assert(versions.result.versions.length === 2, 'task definition versions were not recorded')
  await json(baseUrl, '/codex-api/agent-task-versions/rollback', body('POST', { taskId, version: 1 }))
  const duplicated = await json(baseUrl, '/codex-api/agent-tasks/control', body('POST', { id: taskId, action: 'duplicate' }))
  const duplicateId = duplicated?.result?.task?.id
  assert(duplicateId && duplicated.result.task.enabled === false, 'task duplicate was not created paused')

  const exported = await json(baseUrl, `/codex-api/agent-tasks/export?ids=${encodeURIComponent(taskId)}`)
  assert(exported.result.tasks.length === 1, 'task export did not contain the selected task')

  const listed = await json(baseUrl, '/codex-api/agent-tasks')
  assert(listed?.result?.tasks?.some((task) => task.id === taskId), 'created Agent task was not listed')
  await json(baseUrl, '/codex-api/agent-tasks/control', body('POST', { id: taskId, action: 'pause' }))
  const paused = await json(baseUrl, '/codex-api/agent-tasks')
  assert(paused.result.tasks.find((task) => task.id === taskId)?.enabled === false, 'Agent task did not pause')
  await json(baseUrl, '/codex-api/agent-tasks/control', body('POST', { id: taskId, action: 'resume' }))
  await json(baseUrl, `/codex-api/agent-tasks/item?id=${encodeURIComponent(duplicateId)}`, { method: 'DELETE' })
  await json(baseUrl, `/codex-api/agent-tasks/item?id=${encodeURIComponent(taskId)}`, { method: 'DELETE' })
  const archived = await json(baseUrl, '/codex-api/agent-tasks?visibility=archived')
  assert(archived.result.tasks.some((task) => task.id === taskId), 'archived Agent task was not listed')
  await json(baseUrl, '/codex-api/agent-tasks/control', body('POST', { id: taskId, action: 'restore' }))
  const restored = await json(baseUrl, '/codex-api/agent-tasks')
  assert(restored.result.tasks.find((task) => task.id === taskId)?.enabled === false, 'restored Agent task did not return paused')
  await json(baseUrl, `/codex-api/agent-tasks/item?id=${encodeURIComponent(taskId)}`, { method: 'DELETE' })
  await json(baseUrl, `/codex-api/agent-tasks/item?id=${encodeURIComponent(taskId)}&permanent=true`, { method: 'DELETE' })
  const imported = await json(baseUrl, '/codex-api/agent-tasks/import', body('POST', exported.result))
  assert(imported.result.tasks.length === 1, 'task import did not recreate the exported task')
  await json(baseUrl, `/codex-api/agent-tasks/item?id=${encodeURIComponent(imported.result.tasks[0].id)}`, { method: 'DELETE' })
  const deleted = await json(baseUrl, '/codex-api/agent-tasks')
  assert(!deleted.result.tasks.some((task) => task.id === taskId), 'Agent task was not deleted')
  console.log('Agent task smoke passed: parse, create, version, rollback, duplicate, export/import, pause, resume, archive, restore, and permanent delete work through the built server.')
} finally {
  await stopChild(server)
  await rm(settingsDir, { recursive: true, force: true })
}
