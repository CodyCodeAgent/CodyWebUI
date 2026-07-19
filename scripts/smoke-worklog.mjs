import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { WebSocket } from 'ws'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 25_000
const BROWSER_TIMEOUT_MS = 30_000
const MAX_THREAD_READS = 25
const MAX_BROWSER_CANDIDATES = 5

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

function filePathFromChange(change) {
  if (!change || typeof change !== 'object') return ''
  const path = typeof change.path === 'string' ? change.path : ''
  const kind = change.kind && typeof change.kind === 'object' ? change.kind : null
  const movePath = typeof kind?.move_path === 'string' ? kind.move_path : ''
  return movePath || path
}

function diffTextFromChange(change) {
  return change && typeof change === 'object' && typeof change.diff === 'string' ? change.diff : ''
}

function searchTokenFromPath(path) {
  const parts = path.split('/').filter(Boolean)
  return parts.at(-1) || path
}

function readThreadDiffSummary(threadReadResult) {
  const paths = new Set()
  const hunkPaths = new Set()
  const turns = Array.isArray(threadReadResult?.thread?.turns) ? threadReadResult.thread.turns : []
  for (const turn of turns) {
    const items = Array.isArray(turn?.items) ? turn.items : []
    for (const item of items) {
      if (item?.type !== 'fileChange') continue
      const changes = Array.isArray(item.changes) ? item.changes : []
      for (const change of changes) {
        const diffText = diffTextFromChange(change)
        if (!diffText.trim()) continue
        const path = filePathFromChange(change)
        if (path) paths.add(path)
        if (path && /^@@\s/mu.test(diffText)) hunkPaths.add(path)
      }
    }
  }
  return {
    fileCount: paths.size,
    paths: Array.from(paths),
    hunkPaths: Array.from(hunkPaths),
  }
}

async function findThreadsWithDiff(baseUrl) {
  const explicitThreadId = readArgValue('--thread-id') || process.env.CODY_WEB_UI_SMOKE_THREAD_ID?.trim()
  if (explicitThreadId) {
    const result = await rpc(baseUrl, 'thread/read', { threadId: explicitThreadId, includeTurns: true })
    const summary = readThreadDiffSummary(result)
    assert(summary.fileCount > 0, `CODY_WEB_UI_SMOKE_THREAD_ID=${explicitThreadId} has no fileChange diff items`)
    return [{ threadId: explicitThreadId, ...summary }]
  }

  const list = await rpc(baseUrl, 'thread/list', {
    archived: false,
    limit: 100,
    sortKey: 'updated_at',
  })
  const threadIds = Array.isArray(list?.data)
    ? list.data.map((thread) => thread?.id).filter((id) => typeof id === 'string' && id.length > 0)
    : []

  const candidates = []
  for (const threadId of threadIds.slice(0, MAX_THREAD_READS)) {
    try {
      const result = await rpc(baseUrl, 'thread/read', { threadId, includeTurns: true })
      const summary = readThreadDiffSummary(result)
      if (summary.fileCount > 0) {
        candidates.push({ threadId, ...summary })
        if (candidates.length >= MAX_BROWSER_CANDIDATES) break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping ${threadId}: ${message}`)
    }
  }

  return candidates
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

  async screenshot() {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    return typeof result.data === 'string' ? result.data : ''
  }

  close() {
    this.webSocket.close()
  }

  diagnostics() {
    return this.events.slice(-8).map((event) => ({
      method: event.method,
      params: event.params,
    }))
  }
}

async function openChromePage(url) {
  const chromePath = await findChromeExecutable()
  assert(chromePath, 'Chrome, Chromium, or Edge was not found for browser smoke testing.')

  const debugPort = await findFreePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-worklog-chrome-'))
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
      width: 1440,
      height: 1000,
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

function readPngSize(base64Data) {
  const bytes = Buffer.from(base64Data, 'base64')
  if (bytes.length < 24) return { width: 0, height: 0, bytes: bytes.length }
  const pngSignature = '89504e470d0a1a0a'
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    return { width: 0, height: 0, bytes: bytes.length }
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
  }
}

async function assertWorkLogPanelVisualHealth(page, expectedBadge, expectedFileCount) {
  const visual = await page.evaluate(`(() => {
    const root = document.documentElement;
    function rect(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        left: Math.round(box.left),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        visible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0,
      };
    }
    const trigger = rect('[data-testid="thread-work-log-trigger"]');
    const badge = rect('[data-testid="thread-work-log-badge"]');
    const panel = rect('[data-testid="thread-work-log-panel"]');
    const search = rect('[data-testid="thread-work-log-file-search"]');
    const files = Array.from(document.querySelectorAll('[data-testid="thread-work-log-file"]'));
    const firstFile = rect('[data-testid="thread-work-log-file"]');
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: root.scrollWidth,
      bodyTextLength: document.body.textContent.length,
      trigger,
      badge,
      badgeText: document.querySelector('[data-testid="thread-work-log-badge"]')?.textContent?.trim() || '',
      panel,
      search,
      fileCount: files.length,
      firstFile,
      panelText: document.querySelector('[data-testid="thread-work-log-panel"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 300) || '',
    };
  })()`)

  assert(visual.scrollWidth <= visual.viewportWidth + 1, `Thread page has horizontal overflow with Work log open: ${JSON.stringify(visual)}`)
  assert(visual.bodyTextLength > 200, `Thread page rendered too little text: ${JSON.stringify(visual)}`)
  assert(visual.trigger?.visible === true, `Work log trigger is not visible: ${JSON.stringify(visual)}`)
  assert(visual.trigger.right <= visual.viewportWidth && visual.trigger.left >= 0, `Work log trigger is outside the viewport: ${JSON.stringify(visual)}`)
  assert(visual.badge?.visible === true && visual.badgeText === expectedBadge, `Work log badge is not visible or has the wrong count: ${JSON.stringify(visual)}`)
  assert(visual.panel?.visible === true && visual.panel.width >= 420 && visual.panel.height >= 220, `Work log panel is not visibly laid out: ${JSON.stringify(visual)}`)
  assert(visual.panel.right <= visual.viewportWidth + 1 && visual.panel.left >= 0, `Work log panel escapes the viewport: ${JSON.stringify(visual)}`)
  assert(visual.search?.visible === true, `Work log file search is not visible: ${JSON.stringify(visual)}`)
  assert(visual.fileCount === expectedFileCount, `Work log panel file count mismatch: ${JSON.stringify(visual)}`)
  assert(visual.firstFile?.visible === true && visual.firstFile.width >= 360, `Work log first file row is not visibly laid out: ${JSON.stringify(visual)}`)
  assert(visual.panelText.includes('Work log'), `Work log panel text is missing its title: ${JSON.stringify(visual)}`)

  const screenshot = readPngSize(await page.screenshot())
  assert(
    screenshot.width === 1440 && screenshot.height === 1000 && screenshot.bytes > 20_000,
    `Work log panel screenshot was not captured as a populated desktop PNG: ${JSON.stringify(screenshot)}`,
  )
  return { visual, screenshot }
}

async function assertWorkLogFullscreenVisualHealth(page) {
  const visual = await page.evaluate(`(() => {
    function rect(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        left: Math.round(box.left),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        visible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0,
      };
    }
    const dialog = rect('[data-testid="thread-work-log-fullscreen-dialog"]');
    const panel = rect('.work-log-fullscreen-panel');
    const header = rect('.work-log-fullscreen-header');
    const diff = rect('.work-log-diff-fullscreen, .work-log-output-fullscreen, .work-log-fullscreen-empty');
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dialog,
      panel,
      header,
      diff,
      unifiedRows: document.querySelectorAll('.work-log-diff-row').length,
      splitRows: document.querySelectorAll('.work-log-split-row').length,
      text: document.querySelector('[data-testid="thread-work-log-fullscreen-dialog"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 500) || '',
    };
  })()`)

  assert(visual.dialog?.visible === true, `Fullscreen diff dialog is not visible: ${JSON.stringify(visual)}`)
  assert(visual.panel?.visible === true, `Fullscreen diff panel is not visible: ${JSON.stringify(visual)}`)
  assert(visual.panel.width >= Math.floor(visual.viewportWidth * 0.7), `Fullscreen diff panel is too narrow: ${JSON.stringify(visual)}`)
  assert(visual.panel.height >= Math.floor(visual.viewportHeight * 0.65), `Fullscreen diff panel is too short: ${JSON.stringify(visual)}`)
  assert(visual.panel.left >= 0 && visual.panel.right <= visual.viewportWidth + 1, `Fullscreen diff panel escapes the viewport horizontally: ${JSON.stringify(visual)}`)
  assert(visual.header?.visible === true, `Fullscreen diff header is not visible: ${JSON.stringify(visual)}`)
  assert(visual.diff?.visible === true, `Fullscreen diff content or empty state is not visible: ${JSON.stringify(visual)}`)
  assert(visual.unifiedRows > 0 || visual.splitRows > 0 || visual.text.length > 100, `Fullscreen diff content appears empty: ${JSON.stringify(visual)}`)

  const screenshot = readPngSize(await page.screenshot())
  assert(
    screenshot.width === 1440 && screenshot.height === 1000 && screenshot.bytes > 20_000,
    `Fullscreen diff screenshot was not captured as a populated desktop PNG: ${JSON.stringify(screenshot)}`,
  )
  return { visual, screenshot }
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

const requireWorkLogDiff = readFlag('--require-diff') || process.env.CODY_WEB_UI_SMOKE_REQUIRE_WORKLOG === '1'

try {
  await waitForOutput(server, /CodyWeb is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(serverPort)}`
  const candidates = await findThreadsWithDiff(baseUrl)
  const isExplicitThread = Boolean(readArgValue('--thread-id') || process.env.CODY_WEB_UI_SMOKE_THREAD_ID?.trim())
  if (candidates.length === 0) {
    if (requireWorkLogDiff) {
      throw new Error('Work log browser smoke required a real thread with fileChange diffs, but none was found. Pass --thread-id <id> or set CODY_WEB_UI_SMOKE_THREAD_ID to a known thread with file changes.')
    }
    console.log('Work log browser smoke skipped: no recent thread with fileChange diffs was found.')
    process.exitCode = 0
  } else {
    let passed = false
    let lastError = null
    for (const candidate of candidates) {
      let browser = null
      try {
        browser = await openChromePage(`${baseUrl}/thread/${candidate.threadId}`)
        const expectedBadge = candidate.fileCount > 99 ? '99+' : String(candidate.fileCount)
        const triggerState = await waitForPageValue(
          browser.page,
          `(() => {
            const trigger = document.querySelector('[data-testid="thread-work-log-trigger"]');
            const badge = document.querySelector('[data-testid="thread-work-log-badge"]');
            return trigger ? {
              href: window.location.href,
              title: document.querySelector('h1, .content-title')?.textContent?.trim() || '',
              expanded: trigger.getAttribute('aria-expanded'),
              label: trigger.getAttribute('aria-label'),
              badge: badge ? badge.textContent.trim() : '',
              conversationItems: document.querySelectorAll('.conversation-item').length,
              fileChangeTools: document.querySelectorAll('[data-message-type="tool.fileChange"], [data-kind="fileChange"]').length,
              loadError: document.querySelector('.conversation-load-error')?.textContent?.trim() || '',
              body: document.body.textContent.replace(/\\s+/g, ' ').trim().slice(0, 1200)
            } : null;
          })()`,
          (value) => value?.badge === expectedBadge,
          BROWSER_TIMEOUT_MS,
        )
        assert(triggerState.expanded === 'false', 'work log trigger should start collapsed')

        await browser.page.evaluate(`document.querySelector('[data-testid="thread-work-log-trigger"]').click()`)
        const panelState = await waitForPageValue(
          browser.page,
          `(() => {
            const panel = document.querySelector('[data-testid="thread-work-log-panel"]');
            const files = Array.from(document.querySelectorAll('[data-testid="thread-work-log-file"]'));
            return panel ? {
              text: panel.textContent,
              fileCount: files.length
            } : null;
          })()`,
          (value) => value?.fileCount === candidate.fileCount,
          BROWSER_TIMEOUT_MS,
        )
        assert(panelState.text.includes('Work log'), 'work log panel did not render its title')
        assert(panelState.fileCount === candidate.fileCount, `expected ${String(candidate.fileCount)} work log files, saw ${String(panelState.fileCount)}`)
        const panelVisual = await assertWorkLogPanelVisualHealth(browser.page, expectedBadge, candidate.fileCount)

        const searchPath = candidate.hunkPaths[0] || candidate.paths[0] || ''
        const searchToken = searchTokenFromPath(searchPath)
        assert(searchToken, 'work log candidate did not include a searchable path')
        await browser.page.evaluate(`(() => {
          const input = document.querySelector('[data-testid="thread-work-log-file-search"]');
          input.value = ${JSON.stringify(searchToken)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`)
        const searchState = await waitForPageValue(
          browser.page,
          `(() => {
            const files = Array.from(document.querySelectorAll('[data-testid="thread-work-log-file"]'));
            return {
              fileCount: files.length,
              text: files.map((file) => file.textContent.replace(/\\s+/g, ' ').trim()).join('\\n')
            };
          })()`,
          (value) => value?.fileCount >= 1 && value.text.includes(searchToken),
          BROWSER_TIMEOUT_MS,
        )
        assert(searchState.fileCount <= candidate.fileCount, 'work log search should not increase visible file count')

        await browser.page.evaluate(`document.querySelector('[data-testid="thread-work-log-fullscreen"]').click()`)
        const fullscreenState = await waitForPageValue(
          browser.page,
          `(() => {
            const dialog = document.querySelector('[data-testid="thread-work-log-fullscreen-dialog"]');
            if (!dialog) return null;
            return {
              text: dialog.textContent.replace(/\\s+/g, ' ').trim(),
              unifiedRows: dialog.querySelectorAll('.work-log-diff-row').length,
              splitRows: dialog.querySelectorAll('.work-log-split-row').length,
              outputText: dialog.querySelector('.work-log-output')?.textContent || '',
            };
          })()`,
          (value) => Boolean(
            value &&
            value.text.includes(searchToken) &&
            (
              value.unifiedRows > 0 ||
              value.outputText.trim().length > 0 ||
              value.text.includes('No diff content captured')
            ),
          ),
          BROWSER_TIMEOUT_MS,
        )
        assert(fullscreenState.text.includes(searchToken), 'fullscreen diff should include the selected file path or filename')
        const fullscreenVisual = await assertWorkLogFullscreenVisualHealth(browser.page)

        if (candidate.hunkPaths.length > 0) {
          await browser.page.evaluate(`document.querySelector('[data-testid="thread-work-log-fullscreen-view-split"]').click()`)
          const splitState = await waitForPageValue(
            browser.page,
            `(() => {
              const dialog = document.querySelector('[data-testid="thread-work-log-fullscreen-dialog"]');
              return dialog ? {
                splitActive: document.querySelector('[data-testid="thread-work-log-fullscreen-view-split"]')?.getAttribute('data-active') || '',
                splitRows: dialog.querySelectorAll('.work-log-split-row').length,
              } : null;
            })()`,
            (value) => value?.splitActive === 'true' && value.splitRows > 0,
            BROWSER_TIMEOUT_MS,
          )
          assert(splitState.splitRows > 0, 'split diff should render split rows for hunk diffs')

          await browser.page.evaluate(`document.querySelector('[data-testid="thread-work-log-fullscreen-view-unified"]').click()`)
          const unifiedState = await waitForPageValue(
            browser.page,
            `(() => {
              const dialog = document.querySelector('[data-testid="thread-work-log-fullscreen-dialog"]');
              return dialog ? {
                unifiedActive: document.querySelector('[data-testid="thread-work-log-fullscreen-view-unified"]')?.getAttribute('data-active') || '',
                unifiedRows: dialog.querySelectorAll('.work-log-diff-row').length,
              } : null;
            })()`,
            (value) => value?.unifiedActive === 'true' && value.unifiedRows > 0,
            BROWSER_TIMEOUT_MS,
          )
          assert(unifiedState.unifiedRows > 0, 'unified diff should render rows after switching back')
        }

        console.log(`Work log browser smoke passed for ${candidate.threadId}: ${expectedBadge} changed file(s), panel screenshot ${panelVisual.screenshot.width}x${panelVisual.screenshot.height}, fullscreen screenshot ${fullscreenVisual.screenshot.width}x${fullscreenVisual.screenshot.height}.`)
        passed = true
        break
      } catch (error) {
        lastError = error
        if (isExplicitThread) throw error
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Browser check failed for ${candidate.threadId}; trying next candidate. ${message}`)
      } finally {
        if (browser) await browser.close()
      }
    }
    if (!passed) {
      throw lastError ?? new Error('Work log browser smoke found candidates but none passed browser verification.')
    }
  }
} finally {
  await stopChild(server)
}
