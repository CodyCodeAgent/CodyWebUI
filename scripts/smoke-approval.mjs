import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { WebSocket } from 'ws'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000
const BROWSER_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 10_000

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function postJson(url, body) {
  const { response, payload } = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert(response.ok, `${url} returned HTTP ${String(response.status)}: ${JSON.stringify(payload)}`)
  return payload
}

async function rpc(baseUrl, method, params) {
  const payload = await postJson(`${baseUrl}/codex-api/rpc`, { method, params })
  assert(!payload.error, `${method} returned error: ${JSON.stringify(payload.error)}`)
  return payload.result
}

async function findChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next known browser path.
    }
  }
  return ''
}

async function waitForJson(url, timeoutMs, init = undefined) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, init)
      if (response.ok) return await response.json()
      lastError = new Error(`${url} returned HTTP ${String(response.status)}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }
    await delay(150)
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}

class CdpPage {
  constructor(webSocket) {
    this.webSocket = webSocket
    this.nextId = 1
    this.pending = new Map()
    this.events = []
    webSocket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      if (typeof message.id !== 'number') {
        if (
          message.method === 'Runtime.exceptionThrown' ||
          message.method === 'Runtime.consoleAPICalled' ||
          message.method === 'Log.entryAdded'
        ) {
          this.events.push(message)
        }
        return
      }
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)))
        return
      }
      pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId
    this.nextId += 1
    this.webSocket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails))
    }
    return result.result?.value
  }

  diagnostics() {
    return this.events.slice(-8).map((event) => ({
      method: event.method,
      params: event.params,
    }))
  }

  close() {
    this.webSocket.close()
  }
}

async function openChromePage(url) {
  const chromePath = await findChromeExecutable()
  assert(chromePath, 'Chrome, Chromium, or Edge was not found for browser smoke testing.')

  const debugPort = await findFreePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-approval-chrome-'))
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${String(debugPort)}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'ignore'],
  })

  try {
    await waitForJson(`http://${HOST}:${String(debugPort)}/json/version`, BROWSER_TIMEOUT_MS)
    const target = await waitForJson(
      `http://${HOST}:${String(debugPort)}/json/new?${encodeURIComponent(url)}`,
      BROWSER_TIMEOUT_MS,
      { method: 'PUT' },
    )
    const webSocket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      webSocket.once('open', resolve)
      webSocket.once('error', reject)
    })
    const page = new CdpPage(webSocket)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1360,
      height: 920,
      deviceScaleFactor: 1,
      mobile: false,
    })
    return {
      page,
      async close() {
        page.close()
        await stopChild(chrome)
        await rm(userDataDir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await stopChild(chrome)
    await rm(userDataDir, { recursive: true, force: true })
    throw error
  }
}

async function waitForPageValue(page, expression, predicate, timeoutMs) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await page.evaluate(expression)
    if (predicate(lastValue)) return lastValue
    await delay(250)
  }
  throw new Error(`Timed out waiting for page condition. Last value: ${JSON.stringify(lastValue)} Diagnostics: ${JSON.stringify(page.diagnostics())}`)
}

async function waitForPendingRequestToClear(baseUrl, requestId, timeoutMs) {
  const startedAt = Date.now()
  let lastPayload = null
  while (Date.now() - startedAt < timeoutMs) {
    lastPayload = await waitForJson(`${baseUrl}/codex-api/server-requests/pending`, timeoutMs)
    const rows = Array.isArray(lastPayload.data) ? lastPayload.data : []
    if (!rows.some((request) => request?.id === requestId)) return rows
    await delay(250)
  }
  throw new Error(`pending request ${String(requestId)} was not resolved: ${JSON.stringify(lastPayload)}`)
}

const serverPort = await findFreePort()
const server = spawn(process.execPath, [
  'dist-cli/index.js',
  '--host',
  HOST,
  '--port',
  String(serverPort),
  '--no-password',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CODY_WEB_UI_ENABLE_SMOKE_HOOKS: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let browser = null
try {
  await waitForOutput(server, /CodyWeb is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(serverPort)}`
  const started = await rpc(baseUrl, 'thread/start', { cwd: process.cwd() })
  const threadId = typeof started?.thread?.id === 'string' ? started.thread.id.trim() : ''
  assert(threadId, `thread/start did not return a thread id: ${JSON.stringify(started)}`)

  browser = await openChromePage(`${baseUrl}/thread/${encodeURIComponent(threadId)}`)
  await waitForPageValue(
    browser.page,
    `Boolean(document.querySelector('[data-testid="thread-work-log-trigger"]'))`,
    (value) => value === true,
    BROWSER_TIMEOUT_MS,
  )

  const injected = await postJson(`${baseUrl}/codex-api/smoke/server-requests`, {
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'bytedcli log trace-tree --log-id smoke-approval --output-file /tmp/cody_web_ui_smoke_trace.json',
      cwd: process.cwd(),
      reason: 'Approval browser smoke test',
      threadId: '',
      turnId: 'smoke-turn',
      itemId: 'smoke-command',
    },
    commandPolicy: {
      status: 'not_configured',
      cwd: process.cwd(),
      repoRoot: process.cwd(),
      command: 'bytedcli log trace-tree --log-id smoke-approval --output-file /tmp/cody_web_ui_smoke_trace.json',
      checkedValues: ['bytedcli log trace-tree'],
      allowPatterns: [],
      denyPatterns: [],
      reason: 'Smoke approval requires explicit user confirmation.',
      matchedPattern: '',
    },
  })
  const requestId = injected?.result?.id
  assert(Number.isInteger(requestId), `smoke injection did not return an integer id: ${JSON.stringify(injected)}`)

  const cardState = await waitForPageValue(
    browser.page,
    `(() => {
      const center = document.querySelector('.thread-action-required-float');
      const card = document.querySelector('.activity-request-card');
      const risk = card?.querySelector('.approval-risk-badge');
      const session = Array.from(document.querySelectorAll('[data-testid="thread-approval-scope"]'))
        .find((button) => button.getAttribute('data-scope') === 'session');
      return center && card ? {
        href: window.location.href,
        risk: risk?.getAttribute('data-level') || '',
        hasSessionAction: Boolean(session),
        text: center.textContent.replace(/\\s+/g, ' ').trim().slice(0, 1200),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      } : null;
    })()`,
    (value) => value?.hasSessionAction === true,
    BROWSER_TIMEOUT_MS,
  )
  assert(cardState.risk === 'high', `approval card should render as high risk: ${JSON.stringify(cardState)}`)
  assert(cardState.text.includes('Command approval'), `approval card title missing: ${JSON.stringify(cardState)}`)
  assert(cardState.text.includes('bytedcli log trace-tree'), `approval command missing: ${JSON.stringify(cardState)}`)
  assert(cardState.scrollWidth <= cardState.viewportWidth + 1, `approval page has horizontal overflow: ${JSON.stringify(cardState)}`)

  await browser.page.evaluate(`(() => {
    const session = Array.from(document.querySelectorAll('[data-testid="thread-approval-scope"]'))
      .find((button) => button.getAttribute('data-scope') === 'session');
    session.click();
  })()`)

  await waitForPageValue(
    browser.page,
    `(() => ({
      cardCount: document.querySelectorAll('.thread-action-required-float .activity-request-card').length,
      body: document.body.textContent.replace(/\\s+/g, ' ').trim().slice(0, 800)
    }))()`,
    (value) => value?.cardCount === 0,
    BROWSER_TIMEOUT_MS,
  )

  await waitForPendingRequestToClear(baseUrl, requestId, BROWSER_TIMEOUT_MS)
  console.log(`Approval browser smoke passed for request ${String(requestId)}: card rendered and Session resolved it.`)
} finally {
  if (browser) await browser.close()
  await stopChild(server)
}
