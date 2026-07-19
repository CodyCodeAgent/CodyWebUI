import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_TIMEOUT_MS = 15_000
const REQUIRED_SETUP_CHECKS = [
  'credentialsSaved',
  'accountVerified',
  'botAbilityVerified',
  'scopesVerified',
  'messageEventVerified',
  'cardCallbackVerified',
  'eventLongConnectionVerified',
  'callbackLongConnectionVerified',
  'versionPublishedVerified',
  'visibilityVerified',
  'appEnabledVerified',
  'sdkConnectionVerified',
  'botIdentityVerified',
  'liveProbeVerified',
]

export const FEISHU_MANUAL_ACCEPTANCE_GATES = [
  'Restart during setup and resume without creating another application.',
  'Private chat selects an existing Session and creates a new Session.',
  'Flat group and topic bindings enforce mention and authorization rules.',
  'Web and Feishu concurrently operate the same Session, including streaming and stop.',
  'Approvals and request-user-input reject unauthorized operators.',
  'Image, file, audio/video, quote, card, and merge-forward messages are completed.',
  'Network outage, rate limiting, retry, dead-letter, and manual requeue recover safely.',
  'Duplicate events and duplicate card clicks remain idempotent.',
  'Missing permissions, expired login, allow-list escalation, disable/delete, and adoption fail safely.',
]

function argumentValue(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1]?.trim() ?? '' : ''
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized)
}

export function normalizePreflightUrl(value, allowHttp = false) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('A valid --base-url is required, for example https://cody.example.internal')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The Feishu acceptance base URL must use HTTP or HTTPS')
  }
  if (url.username || url.password) throw new Error('Do not place credentials in the Feishu acceptance URL')
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname) && !allowHttp) {
    throw new Error('Remote HTTP is unencrypted. Use HTTPS or pass --allow-http only for an explicitly trusted network.')
  }
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

function cookieHeader(headers) {
  const rows = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie') ?? '']
  return rows
    .flatMap((row) => row.split(/,(?=\s*cody_web_ui_)/u))
    .map((row) => row.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ')
}

async function responsePayload(response, action) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`${action} did not return JSON (HTTP ${String(response.status)}). The CodyWeb login may be required.`)
  }
  const payload = await response.json()
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.error ?? payload?.message ?? `HTTP ${String(response.status)}`
    throw new Error(`${action} failed: ${String(message)}`)
  }
  return payload
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out after ${String(timeoutMs)}ms: ${url}`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function requestResult(fetchImpl, url, cookie, timeoutMs, init = {}) {
  const headers = new Headers(init.headers)
  if (cookie) headers.set('Cookie', cookie)
  const response = await fetchWithTimeout(fetchImpl, url, { ...init, headers }, timeoutMs)
  const payload = await responsePayload(response, `${init.method ?? 'GET'} ${new URL(url).pathname}`)
  if (!payload || typeof payload !== 'object' || !payload.result || typeof payload.result !== 'object') {
    throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} returned a malformed CodyWeb result`)
  }
  return payload.result
}

async function login(fetchImpl, baseUrl, password, timeoutMs) {
  if (!password) return ''
  const response = await fetchWithTimeout(fetchImpl, new URL('/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }, timeoutMs)
  await responsePayload(response, 'CodyWeb login')
  const cookie = cookieHeader(response.headers)
  if (!cookie) throw new Error('CodyWeb login succeeded without returning a session cookie')
  return cookie
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} returned malformed data`)
  return value
}

function publicBot(bot) {
  return {
    id: String(bot.id ?? ''),
    name: String(bot.name ?? ''),
    appId: String(bot.appId ?? ''),
    platform: bot.platform === 'lark' ? 'lark' : 'feishu',
    tenantId: String(bot.tenantId ?? ''),
    tenantName: String(bot.tenantName ?? ''),
    enabled: bot.enabled === true,
    status: String(bot.status ?? ''),
    lastHeartbeatAtIso: typeof bot.lastHeartbeatAtIso === 'string' ? bot.lastHeartbeatAtIso : null,
  }
}

export async function runFeishuAcceptancePreflight(options) {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.floor(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS
  const baseUrl = normalizePreflightUrl(options.baseUrl, options.allowHttp === true)
  const failures = []

  const version = await requestResult(fetchImpl, new URL('/codex-api/meta/version', baseUrl), '', timeoutMs)
  const cookie = await login(fetchImpl, baseUrl, options.password ?? '', timeoutMs)
  const access = await requestResult(fetchImpl, new URL('/codex-api/meta/access-security', baseUrl), cookie, timeoutMs)
  if (!access.auth?.enabled && !access.network?.isLoopbackRequest) failures.push('Remote CodyWeb access is not password protected.')
  if (access.network?.protocol !== 'https' && !access.network?.isLoopbackRequest && options.allowHttp !== true) {
    failures.push('Remote CodyWeb access is using unencrypted HTTP.')
  }

  const botsResult = await requestResult(fetchImpl, new URL('/codex-api/feishu/bots', baseUrl), cookie, timeoutMs)
  const bots = requireArray(botsResult.bots, 'Feishu bot list')
  const requestedBotId = options.botId?.trim() ?? ''
  const bot = requestedBotId
    ? bots.find((row) => row && typeof row === 'object' && row.id === requestedBotId)
    : bots.length === 1 ? bots[0] : null
  if (!bot || typeof bot !== 'object') {
    throw new Error(requestedBotId
      ? `Feishu bot ${requestedBotId} was not found`
      : `Expected exactly one Feishu bot, found ${String(bots.length)}. Pass --bot-id.`)
  }
  const safeBot = publicBot(bot)
  if (!safeBot.enabled) failures.push('The selected Feishu bot is disabled.')
  if (!safeBot.tenantId || !safeBot.tenantName) failures.push('The selected Feishu bot has no verified tenant identity.')

  const setupsResult = await requestResult(fetchImpl, new URL('/codex-api/feishu/qr-setup', baseUrl), cookie, timeoutMs)
  const setupJobs = requireArray(setupsResult.jobs, 'Feishu QR setup history')
  const setup = setupJobs
    .filter((row) => row && typeof row === 'object' && row.bot?.id === safeBot.id)
    .sort((left, right) => String(right.updatedAtIso ?? '').localeCompare(String(left.updatedAtIso ?? '')))[0] ?? null
  if (!setup) failures.push('No persisted QR setup evidence is linked to this bot.')
  if (setup && setup.status !== 'completed') failures.push(`The latest QR setup job is ${String(setup.status ?? 'unknown')}, not completed.`)
  const setupChecks = Object.fromEntries(REQUIRED_SETUP_CHECKS.map((key) => [key, setup?.checks?.[key] === true]))
  for (const [key, passed] of Object.entries(setupChecks)) {
    if (!passed) failures.push(`QR setup proof is missing: ${key}.`)
  }

  const diagnoseResult = await requestResult(
    fetchImpl,
    new URL(`/codex-api/feishu/bots/${encodeURIComponent(safeBot.id)}/diagnose`, baseUrl),
    cookie,
    timeoutMs,
    { method: 'POST' },
  )
  const connectivity = diagnoseResult.report
  if (!connectivity || typeof connectivity !== 'object' || !Array.isArray(connectivity.checks)) {
    throw new Error('Feishu live diagnostic returned malformed data')
  }
  if (connectivity.ok !== true) failures.push('The live Feishu connectivity diagnostic did not pass.')
  for (const check of connectivity.checks) {
    if (check?.status !== 'pass') failures.push(`Live diagnostic failed: ${String(check?.id ?? 'unknown')}.`)
  }

  const diagnosticsResult = await requestResult(
    fetchImpl,
    new URL(`/codex-api/feishu/diagnostics?botId=${encodeURIComponent(safeBot.id)}`, baseUrl),
    cookie,
    timeoutMs,
  )
  const diagnostics = diagnosticsResult.diagnostics
  if (!diagnostics || typeof diagnostics !== 'object' || !diagnostics.counts) {
    throw new Error('Feishu diagnostics summary returned malformed data')
  }

  const uniqueFailures = [...new Set(failures)]
  return {
    schemaVersion: 1,
    kind: 'cody-feishu-tenant-acceptance-preflight',
    generatedAtIso: new Date().toISOString(),
    baseUrl: baseUrl.origin,
    build: version,
    access: {
      authEnabled: access.auth?.enabled === true,
      protocol: String(access.network?.protocol ?? ''),
      isLoopbackRequest: access.network?.isLoopbackRequest === true,
      risks: Array.isArray(access.risks) ? access.risks.map((risk) => String(risk?.id ?? '')).filter(Boolean) : [],
    },
    bot: safeBot,
    setup: setup ? {
      id: String(setup.id ?? ''),
      status: String(setup.status ?? ''),
      updatedAtIso: String(setup.updatedAtIso ?? ''),
      checks: setupChecks,
    } : null,
    connectivity,
    diagnostics: {
      generatedAtIso: String(diagnostics.generatedAtIso ?? ''),
      counts: diagnostics.counts,
    },
    result: { ok: uniqueFailures.length === 0, failures: uniqueFailures },
    manualAcceptanceRequired: FEISHU_MANUAL_ACCEPTANCE_GATES,
  }
}

export async function writeFeishuAcceptanceEvidence(filePath, evidence) {
  const target = resolve(filePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(target, 0o600)
  return target
}

function printUsage() {
  console.log(`Usage:
  CODY_FEISHU_ACCEPTANCE_PASSWORD='...' npm run acceptance:feishu:preflight -- \\
    --base-url https://cody.example.internal [--bot-id <id>] [--output <evidence.json>]

Options:
  --base-url   CodyWeb browser origin (or CODY_FEISHU_ACCEPTANCE_URL)
  --bot-id     Required when more than one bot exists
  --output     Write redacted JSON evidence with mode 0600
  --allow-http Explicitly allow remote HTTP on a trusted network

The password is accepted only through CODY_FEISHU_ACCEPTANCE_PASSWORD so it is
not exposed in the process list. This preflight does not replace the manual
real-tenant chat, authorization, attachment, retry, and recovery acceptance gates.`)
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    return 0
  }
  const baseUrl = argumentValue(argv, '--base-url') || environment.CODY_FEISHU_ACCEPTANCE_URL || ''
  const evidence = await runFeishuAcceptancePreflight({
    baseUrl,
    botId: argumentValue(argv, '--bot-id'),
    password: environment.CODY_FEISHU_ACCEPTANCE_PASSWORD || '',
    allowHttp: argv.includes('--allow-http'),
  })
  const output = argumentValue(argv, '--output')
  if (output) console.log(`Evidence: ${await writeFeishuAcceptanceEvidence(output, evidence)}`)
  console.log(`Build: ${String(evidence.build?.label ?? evidence.build?.buildId ?? 'unknown')}`)
  console.log(`Bot: ${evidence.bot.name} (${evidence.bot.platform}, ${evidence.bot.tenantName || 'tenant unknown'})`)
  console.log(`Preflight: ${evidence.result.ok ? 'PASS' : 'FAIL'}`)
  for (const failure of evidence.result.failures) console.error(`- ${failure}`)
  console.log(`Manual tenant gates still required: ${String(evidence.manualAcceptanceRequired.length)}`)
  return evidence.result.ok ? 0 : 1
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  main().then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(`Feishu acceptance preflight failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
