import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const TIMEOUT_MS = 45_000

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a port')))
        return
      }
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for server. Output:\n${output}`)), timeoutMs)
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
    child.once('exit', () => {
      clearTimeout(forceKill)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function json(url, init) {
  const response = await fetch(url, init)
  const payload = await response.json()
  assert(response.ok, `${url} returned ${String(response.status)}: ${JSON.stringify(payload)}`)
  return payload
}

async function post(baseUrl, path, body) {
  return json(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function catalogProjects(payload) {
  const rows = payload?.result?.catalog?.projects
  return Array.isArray(rows) ? rows : []
}

function catalogThreadIds(payload) {
  return catalogProjects(payload).flatMap((project) => (
    Array.isArray(project?.threads) ? project.threads.map((thread) => thread?.id).filter(Boolean) : []
  ))
}

const settingsDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-catalog-smoke-'))
const settingsDbPath = join(settingsDir, 'settings.sqlite3')
const port = await findFreePort()
const server = spawn(process.execPath, [
  'dist-cli/index.js',
  '--host', HOST,
  '--port', String(port),
  '--no-password',
], {
  cwd: process.cwd(),
  env: { ...process.env, CODY_WEB_UI_SETTINGS_DB: settingsDbPath },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForOutput(server, /CodyWeb is running!/u, TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(port)}`
  const visible = await json(`${baseUrl}/codex-api/catalog?visibility=visible`)
  const sync = visible?.result?.sync
  assert(sync?.successCount >= 1, `catalog did not complete initial sync: ${JSON.stringify(sync)}`)

  const projects = catalogProjects(visible)
  const firstProject = projects[0]
  const firstThread = firstProject?.threads?.[0]
  if (!firstProject || !firstThread) {
    console.log('Catalog smoke passed: initial sync completed; no active Codex threads were available for visibility mutation checks.')
  } else {
    await post(baseUrl, '/codex-api/catalog/threads/visibility', { threadId: firstThread.id, hidden: true })
    const afterThreadHide = await json(`${baseUrl}/codex-api/catalog?visibility=visible`)
    assert(!catalogThreadIds(afterThreadHide).includes(firstThread.id), 'hidden thread remained in the visible catalog')
    const hiddenThreads = await json(`${baseUrl}/codex-api/catalog?visibility=hidden`)
    assert(catalogThreadIds(hiddenThreads).includes(firstThread.id), 'hidden thread did not appear in the hidden catalog')
    await post(baseUrl, '/codex-api/catalog/threads/visibility', { threadId: firstThread.id, hidden: false })

    await post(baseUrl, '/codex-api/catalog/projects/visibility', { projectKey: firstProject.projectKey, hidden: true })
    const afterProjectHide = await json(`${baseUrl}/codex-api/catalog?visibility=visible`)
    assert(!catalogProjects(afterProjectHide).some((project) => project.projectKey === firstProject.projectKey), 'hidden project remained visible')
    await post(baseUrl, '/codex-api/catalog/projects/visibility', { projectKey: firstProject.projectKey, hidden: false })

    const restored = await json(`${baseUrl}/codex-api/catalog?visibility=visible`)
    assert(catalogThreadIds(restored).includes(firstThread.id), 'restored thread did not return to the visible catalog')
    console.log(`Catalog smoke passed: synced ${String(sync.successCount)} time(s), hid and restored ${firstProject.projectKey} / ${firstThread.id}.`)
  }
} finally {
  await stopChild(server)
  await rm(settingsDir, { recursive: true, force: true })
}
