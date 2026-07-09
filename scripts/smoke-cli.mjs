import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 12_000
const REQUEST_TIMEOUT_MS = 5_000

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

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const payload = await response.json()
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchText(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const text = await response.text()
    return { response, text }
  } finally {
    clearTimeout(timeout)
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
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
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForOutput(child, /CodyWebUI is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(port)}`

  const meta = await fetchJson(`${baseUrl}/codex-api/meta/access-security`)
  assert(meta.response.ok, `meta API returned HTTP ${String(meta.response.status)}`)
  assert(meta.payload?.result?.auth?.enabled === false, 'expected auth to be disabled for --no-password')
  assert(meta.payload?.result?.network?.listenExposure === 'loopback', 'expected loopback listen exposure')

  const shell = await fetchText(`${baseUrl}/thread/smoke-cli`)
  assert(shell.response.ok, `SPA shell returned HTTP ${String(shell.response.status)}`)
  assert(shell.text.includes('<div id="app"></div>'), 'SPA shell did not include the Vue app mount point')

  console.log(`CLI smoke passed at ${baseUrl}`)
} finally {
  await stopChild(child)
}
