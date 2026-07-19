import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { WebSocket } from 'ws'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_TURN_TIMEOUT_MS = 180_000
const DEFAULT_MESSAGE = 'CodyWeb smoke test: reply with exactly "cody-web-ui smoke ok".'
const LIVE_DELTA_METHODS = new Set([
  'item/agentMessage/delta',
  'item/plan/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta',
  'item/reasoning/summaryPartAdded',
  'turn/plan/updated',
])

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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function readProtocolId(record, camelKey, snakeKey) {
  return readString(record?.[camelKey]) || readString(record?.[snakeKey])
}

function extractNotificationThreadId(notification) {
  const params = asRecord(notification?.params)
  if (!params) return ''
  const directThreadId = readProtocolId(params, 'threadId', 'thread_id')
  if (directThreadId) return directThreadId
  const conversationId = readProtocolId(params, 'conversationId', 'conversation_id')
  if (conversationId) return conversationId
  const thread = asRecord(params.thread)
  const nestedThreadId = readString(thread?.id)
  if (nestedThreadId) return nestedThreadId
  const turn = asRecord(params.turn)
  return readProtocolId(turn, 'threadId', 'thread_id')
}

function extractNotificationTurnId(notification) {
  const params = asRecord(notification?.params)
  if (!params) return ''
  const directTurnId = readProtocolId(params, 'turnId', 'turn_id')
  if (directTurnId) return directTurnId
  const turn = asRecord(params.turn)
  const nestedTurnId = readString(turn?.id)
  if (nestedTurnId) return nestedTurnId
  const item = asRecord(params.item)
  return readProtocolId(item, 'turnId', 'turn_id')
}

function readNotificationDelta(notification) {
  const params = asRecord(notification?.params)
  if (!params) return ''
  return (
    readString(params.delta) ||
    readString(params.textDelta) ||
    readString(params.text_delta) ||
    readString(params.content) ||
    readString(params.text)
  )
}

function websocketUrl(baseUrl) {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/codex-api/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function createRealtimeRecorder(baseUrl) {
  const frames = []
  let ready = false
  const socket = new WebSocket(websocketUrl(baseUrl))
  const readyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for realtime websocket ready frame.'))
    }, STARTUP_TIMEOUT_MS)
    socket.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    socket.on('message', (data) => {
      let parsed
      try {
        parsed = JSON.parse(data.toString())
      } catch {
        return
      }
      if (parsed?.type === 'ready') {
        ready = true
        clearTimeout(timeout)
        resolve()
        return
      }
      if (parsed?.type === 'rpc' && parsed.notification) {
        frames.push({
          type: 'rpc',
          notification: parsed.notification,
          atIso: readString(parsed.atIso),
        })
        return
      }
      if (parsed?.type === 'product' && parsed.notification) {
        frames.push({
          type: 'product',
          notification: parsed.notification,
          atIso: readString(parsed.atIso),
        })
      }
    })
  })

  return {
    async waitUntilReady() {
      await readyPromise
    },
    summarize(threadId, turnId) {
      const rpcFrames = frames
        .filter((frame) => frame.type === 'rpc')
        .filter((frame) => {
          const notification = frame.notification
          const frameThreadId = extractNotificationThreadId(notification)
          const frameTurnId = extractNotificationTurnId(notification)
          if (frameThreadId && frameThreadId !== threadId) return false
          if (turnId && frameTurnId && frameTurnId !== turnId) return false
          return frameThreadId === threadId || frameTurnId === turnId
        })
      const methods = rpcFrames.map((frame) => readString(frame.notification?.method)).filter(Boolean)
      const deltaFrames = rpcFrames.filter((frame) => LIVE_DELTA_METHODS.has(readString(frame.notification?.method)))
      const deltaChars = deltaFrames.reduce((sum, frame) => sum + readNotificationDelta(frame.notification).length, 0)
      return {
        ready,
        frameCount: rpcFrames.length,
        methods,
        hasTurnStarted: methods.includes('turn/started'),
        hasTurnCompleted: methods.includes('turn/completed'),
        hasLiveDelta: deltaFrames.length > 0,
        deltaFrameCount: deltaFrames.length,
        deltaChars,
      }
    },
    close() {
      socket.close()
    },
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

function readThreadId(payload) {
  const id = payload?.thread?.id
  return typeof id === 'string' ? id.trim() : ''
}

function readTurnId(payload) {
  const id = payload?.turn?.id
  return typeof id === 'string' ? id.trim() : ''
}

function itemText(item) {
  if (!item || typeof item !== 'object') return ''
  if (typeof item.text === 'string') return item.text
  if (!Array.isArray(item.content)) return ''
  return item.content
    .map((part) => part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
}

function readTurnStatus(threadReadResult, turnId) {
  const turns = Array.isArray(threadReadResult?.thread?.turns) ? threadReadResult.thread.turns : []
  const turn = turns.find((candidate) => candidate?.id === turnId)
  return typeof turn?.status === 'string' ? turn.status : ''
}

function readCompletedConversation(threadReadResult, turnId, sentMessage) {
  const turns = Array.isArray(threadReadResult?.thread?.turns) ? threadReadResult.thread.turns : []
  const turn = turns.find((candidate) => candidate?.id === turnId)
  const items = Array.isArray(turn?.items) ? turn.items : []
  const userText = items
    .filter((item) => item?.type === 'userMessage')
    .map(itemText)
    .find((text) => text.includes(sentMessage.trim())) || ''
  const assistantText = items
    .filter((item) => item?.type === 'agentMessage' || item?.type === 'plan')
    .map(itemText)
    .find((text) => text.trim().length > 0) || ''
  return {
    status: typeof turn?.status === 'string' ? turn.status : '',
    hasUserMessage: userText.length > 0,
    assistantText,
  }
}

function isTransientThreadReadError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /thread\/read returned HTTP 502/u.test(message) &&
    (
      /rollout .* is empty/u.test(message) ||
      /failed to read thread/u.test(message)
    )
  )
}

async function waitForTurnCompletion(baseUrl, threadId, turnId, message, timeoutMs) {
  const startedAt = Date.now()
  let lastState = null
  let lastTransientReadError = ''
  while (Date.now() - startedAt < timeoutMs) {
    let read
    try {
      read = await rpc(baseUrl, 'thread/read', {
        threadId,
        includeTurns: true,
      })
      lastTransientReadError = ''
    } catch (error) {
      if (isTransientThreadReadError(error)) {
        lastTransientReadError = error instanceof Error ? error.message : String(error)
        await delay(1_000)
        continue
      }
      throw error
    }
    lastState = readCompletedConversation(read, turnId, message)
    if (lastState.hasUserMessage && lastState.assistantText.trim().length > 0) {
      return lastState
    }
    if (/failed|cancelled|canceled|error/u.test(lastState.status)) {
      throw new Error(`Turn ${turnId} ended with status ${lastState.status}`)
    }
    await delay(2_000)
  }
  throw new Error(`Timed out waiting for turn ${turnId}. Last state: ${JSON.stringify(lastState)} Last transient read error: ${lastTransientReadError}`)
}

async function tryArchiveThread(baseUrl, threadId) {
  try {
    await rpc(baseUrl, 'thread/archive', { threadId })
  } catch {
    // Cleanup is best-effort; the smoke result should report the turn outcome.
  }
}

const allowTurn = readFlag('--allow-turn') || process.env.CODY_WEB_UI_SMOKE_ALLOW_TURN === '1'
if (!allowTurn) {
  console.log('Turn smoke skipped: set CODY_WEB_UI_SMOKE_ALLOW_TURN=1 or pass --allow-turn to start a real Codex turn. This can consume model tokens.')
  process.exit(0)
}

const cwd = readArgValue('--cwd') || process.cwd()
const message = readArgValue('--message') || DEFAULT_MESSAGE
const model = readArgValue('--model')
const effort = readArgValue('--effort')
const timeoutMs = Number.parseInt(readArgValue('--timeout-ms') || '', 10) || DEFAULT_TURN_TIMEOUT_MS
const requireLiveDelta = readFlag('--require-live-delta')
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
let realtime = null
try {
  await waitForOutput(child, /CodyWeb is running!/u, STARTUP_TIMEOUT_MS)
  const baseUrl = `http://${HOST}:${String(port)}`
  realtime = createRealtimeRecorder(baseUrl)
  await realtime.waitUntilReady()

  const startParams = { cwd }
  if (model) startParams.model = model
  const started = await rpc(baseUrl, 'thread/start', startParams)
  createdThreadId = readThreadId(started)
  assert(createdThreadId, 'thread/start did not return a thread id')

  const turnParams = {
    threadId: createdThreadId,
    input: [{ type: 'text', text: message, text_elements: [] }],
  }
  if (model) turnParams.model = model
  if (effort) turnParams.effort = effort

  const turnStarted = await rpc(baseUrl, 'turn/start', turnParams)
  const turnId = readTurnId(turnStarted)
  assert(turnId, 'turn/start did not return a turn id')

  const finalState = await waitForTurnCompletion(baseUrl, createdThreadId, turnId, message, timeoutMs)
  assert(finalState.assistantText.trim().length > 0, 'turn completed without assistant text')
  await delay(500)
  const realtimeSummary = realtime.summarize(createdThreadId, turnId)
  assert(
    realtimeSummary.ready && realtimeSummary.frameCount > 0,
    `turn completed, but no realtime websocket frames were observed for ${createdThreadId}/${turnId}: ${JSON.stringify(realtimeSummary)}`,
  )
  assert(
    realtimeSummary.hasTurnStarted || realtimeSummary.hasTurnCompleted,
    `turn completed, but lifecycle websocket frames were not observed for ${createdThreadId}/${turnId}: ${JSON.stringify(realtimeSummary)}`,
  )
  if (requireLiveDelta) {
    assert(
      realtimeSummary.hasLiveDelta,
      `turn completed, but no live assistant/plan/reasoning delta frames were observed for ${createdThreadId}/${turnId}: ${JSON.stringify(realtimeSummary)}`,
    )
  }
  await tryArchiveThread(baseUrl, createdThreadId)
  console.log(`Turn smoke passed for ${createdThreadId}/${turnId}: ${finalState.assistantText.trim().slice(0, 120)}; realtime frames ${String(realtimeSummary.frameCount)}, live deltas ${String(realtimeSummary.deltaFrameCount)}, delta chars ${String(realtimeSummary.deltaChars)}`)
} finally {
  realtime?.close()
  if (createdThreadId) {
    try {
      const baseUrl = `http://${HOST}:${String(port)}`
      await tryArchiveThread(baseUrl, createdThreadId)
    } catch {
      // Ignore cleanup failures.
    }
  }
  await stopChild(child)
}
