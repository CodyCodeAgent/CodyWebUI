import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { WebSocket } from 'ws'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000
const BROWSER_TIMEOUT_MS = 30_000

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
  const userDataDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-composer-chrome-'))
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
  stdio: ['ignore', 'pipe', 'pipe'],
})

let browser = null
try {
  await waitForOutput(server, /CodyWebUI is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(serverPort)}`
  browser = await openChromePage(baseUrl)

  const readyState = await waitForPageValue(
    browser.page,
    `(() => {
      const input = document.querySelector('[data-testid="thread-composer-input"]');
      const submit = document.querySelector('[data-testid="thread-composer-submit"]');
      return input && submit ? {
        href: window.location.href,
        inputDisabled: input.disabled,
        submitDisabled: submit.disabled,
        placeholder: input.getAttribute('placeholder') || '',
        body: document.body.textContent.replace(/\\s+/g, ' ').trim().slice(0, 800)
      } : null;
    })()`,
    (value) => value && value.inputDisabled === false,
    BROWSER_TIMEOUT_MS,
  )
  assert(readyState.submitDisabled === true, 'composer submit should start disabled before text entry')

  const typedState = await browser.page.evaluate(`(() => {
    const input = document.querySelector('[data-testid="thread-composer-input"]');
    const submit = document.querySelector('[data-testid="thread-composer-submit"]');
    input.value = 'browser composer smoke';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      value: input.value,
      submitDisabled: submit.disabled
    };
  })()`)
  assert(typedState.value === 'browser composer smoke', 'composer text was not entered')

  await waitForPageValue(
    browser.page,
    `(() => {
      const submit = document.querySelector('[data-testid="thread-composer-submit"]');
      return submit ? { submitDisabled: submit.disabled } : null;
    })()`,
    (value) => value?.submitDisabled === false,
    BROWSER_TIMEOUT_MS,
  )

  console.log('Composer browser smoke passed: input enabled and send button activates after typing.')
} finally {
  if (browser) await browser.close()
  await stopChild(server)
}
