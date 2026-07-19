import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 25_000

function readArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return ''
  return process.argv[index + 1]?.trim() ?? ''
}

function readFlag(name) {
  return process.argv.includes(name)
}

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
        server.close(() => reject(new Error('Could not allocate a TCP port')))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${pattern.toString()}. Output:\n${output}`))
    }, timeoutMs)

    function onData(chunk) {
      output += chunk.toString()
      if (!pattern.test(output)) return
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      resolve(output)
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
  })
}

async function fetchJson(url, init) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const payload = await response.json()
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

async function rpc(baseUrl, method, params) {
  const { response, payload } = await fetchJson(`${baseUrl}/codex-api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  })
  assert(response.ok, `${method} returned HTTP ${String(response.status)}: ${JSON.stringify(payload)}`)
  assert(!payload.error, `${method} returned error: ${JSON.stringify(payload.error)}`)
  return payload.result
}

async function tryArchiveThread(baseUrl, threadId) {
  try {
    await rpc(baseUrl, 'thread/archive', { threadId })
    return true
  } catch {
    // Empty app-server threads are readable before they have a rollout, but
    // archive may reject them until a user message materializes the thread.
    return false
  }
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }

    const forceKill = setTimeout(() => {
      child.kill('SIGKILL')
    }, 3_000)

    child.once('exit', () => {
      clearTimeout(forceKill)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

function readThreadId(payload) {
  const id = payload?.thread?.id
  return typeof id === 'string' ? id.trim() : ''
}

function readListedThreadIds(payload) {
  return Array.isArray(payload?.data)
    ? payload.data.map((thread) => thread?.id).filter((id) => typeof id === 'string' && id.length > 0)
    : []
}

const cwd = readArgValue('--cwd') || process.cwd()
const requireListedThread = readFlag('--require-listed') || process.env.CODY_WEB_UI_SMOKE_REQUIRE_THREAD_LIST === '1'
const port = await findFreePort()
const child = spawn(process.execPath, [
  'dist-cli/index.js',
  '--host',
  HOST,
  '--port',
  String(port),
  '--no-password',
], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let createdThreadId = ''
try {
  await waitForOutput(child, /CodyWeb is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(port)}`

  const started = await rpc(baseUrl, 'thread/start', { cwd })
  createdThreadId = readThreadId(started)
  assert(createdThreadId, 'thread/start did not return a thread id')

  const read = await rpc(baseUrl, 'thread/read', {
    threadId: createdThreadId,
    includeTurns: false,
  })
  assert(read?.thread?.id === createdThreadId, 'thread/read did not return the created thread')
  assert(read?.thread?.cwd === cwd, `created thread cwd mismatch: expected ${cwd}, got ${String(read?.thread?.cwd ?? '')}`)

  const list = await rpc(baseUrl, 'thread/list', {
    archived: false,
    limit: 50,
    sortKey: 'updated_at',
  })
  const listedThreadIds = readListedThreadIds(list)
  const isListed = listedThreadIds.includes(createdThreadId)
  if (requireListedThread) {
    assert(
      isListed,
      `thread/list did not include created thread ${createdThreadId}; saw ${listedThreadIds.slice(0, 10).join(', ')}`,
    )
  }

  const archived = await tryArchiveThread(baseUrl, createdThreadId)
  const cleanupNote = archived ? 'archived' : 'left unarchived because app-server has not materialized a rollout yet'
  const listNote = isListed
    ? 'listed'
    : 'not listed yet because app-server has not materialized a rollout'
  console.log(`Thread lifecycle smoke passed for ${createdThreadId}: start/read ok, ${listNote} (${cleanupNote})`)
} finally {
  if (createdThreadId) {
    try {
      const baseUrl = `http://${HOST}:${String(port)}`
      await tryArchiveThread(baseUrl, createdThreadId)
    } catch {
      // The main archive call may already have succeeded; avoid hiding the real smoke result.
    }
  }
  await stopChild(child)
}
