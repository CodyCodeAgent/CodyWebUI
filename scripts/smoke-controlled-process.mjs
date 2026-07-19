import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 12_000
const REQUEST_TIMEOUT_MS = 5_000

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
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern.toString()}. Output:\n${output}`)), timeoutMs)
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
  env: { ...process.env, CODY_WEB_UI_ENABLE_SMOKE_HOOKS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForOutput(child, /CodyWeb is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(port)}`
  const epipe = await fetchJson(`${baseUrl}/codex-api/smoke/controlled-process-epipe`, { method: 'POST' })
  assert(epipe.response.ok, `EPIPE smoke returned HTTP ${String(epipe.response.status)}: ${JSON.stringify(epipe.payload)}`)
  assert(epipe.payload?.result?.exitCode === 0, `EPIPE smoke child did not exit cleanly: ${JSON.stringify(epipe.payload)}`)
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert(child.exitCode === null && child.signalCode === null, 'Built CodyWeb process exited after the controlled-process EPIPE probe')

  const health = await fetchJson(`${baseUrl}/codex-api/meta/access-security`)
  assert(health.response.ok, `post-EPIPE health request returned HTTP ${String(health.response.status)}`)
  const checkpointHealth = await fetchJson(`${baseUrl}/codex-api/tooling/checkpoint-health?cwd=${encodeURIComponent(process.cwd())}`)
  assert(checkpointHealth.response.ok, `checkpoint health returned HTTP ${String(checkpointHealth.response.status)}: ${JSON.stringify(checkpointHealth.payload)}`)
  assert(typeof checkpointHealth.payload?.result?.status === 'string', 'checkpoint health did not return a status')
  assert(Array.isArray(checkpointHealth.payload?.result?.unknownSizeCheckpointIds), 'checkpoint health did not return unknown-size evidence')
  console.log(`Controlled-process EPIPE smoke passed: built server survived at ${baseUrl}`)
} finally {
  await stopChild(child)
}
