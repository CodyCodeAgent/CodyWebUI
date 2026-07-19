import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FEISHU_MANUAL_ACCEPTANCE_GATES,
  normalizePreflightUrl,
  runFeishuAcceptancePreflight,
  writeFeishuAcceptanceEvidence,
} from './feishu-acceptance-preflight.mjs'

const setupChecks = {
  credentialsSaved: true,
  accountVerified: true,
  botAbilityVerified: true,
  scopesVerified: true,
  messageEventVerified: true,
  cardCallbackVerified: true,
  eventLongConnectionVerified: true,
  callbackLongConnectionVerified: true,
  versionPublishedVerified: true,
  visibilityVerified: true,
  appEnabledVerified: true,
  sdkConnectionVerified: true,
  botIdentityVerified: true,
  liveProbeVerified: true,
}

const liveChecks = ['configuration', 'enabled', 'runtime', 'long_connection', 'credential_api', 'bot_identity']
  .map((id) => ({ id, status: 'pass', message: `${id} passed` }))

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function fetchFixture(options = {}) {
  const calls = []
  const fetchImpl = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ path: `${url.pathname}${url.search}`, method: init.method ?? 'GET', headers: new Headers(init.headers) })
    if (url.pathname === '/codex-api/meta/version') {
      return json({ result: { buildId: 'abc123-clean.001', gitDirty: false, label: 'v0.1.0 · abc123-clean.001' } })
    }
    if (url.pathname === '/auth/login') {
      const body = JSON.parse(String(init.body ?? '{}'))
      if (body.password !== 'correct-password') return json({ error: 'Invalid password' }, { status: 401 })
      return json({ ok: true }, {
        headers: {
          'Set-Cookie': 'cody_web_ui_token=token-secret; Path=/; HttpOnly, cody_web_ui_device=device-id; Path=/; HttpOnly',
        },
      })
    }
    if (!new Headers(init.headers).get('cookie')?.includes('cody_web_ui_token=token-secret')) {
      return new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } })
    }
    if (url.pathname === '/codex-api/meta/access-security') {
      return json({ result: {
        auth: { enabled: true },
        network: { protocol: options.accessProtocol ?? 'https', isLoopbackRequest: false },
        risks: [{ id: options.accessProtocol === 'http' ? 'remote-http' : 'remote-request-host' }],
      } })
    }
    if (url.pathname === '/codex-api/feishu/bots' && (init.method ?? 'GET') === 'GET') {
      return json({ result: { bots: [{
        id: 'bot-1', name: 'Team bot', appId: 'cli_team', platform: 'lark',
        tenantId: 'tenant-1', tenantName: 'Example', enabled: true, status: 'connected',
        lastHeartbeatAtIso: '2026-07-18T01:00:00.000Z', appSecret: 'must-not-leak',
      }] } })
    }
    if (url.pathname === '/codex-api/feishu/qr-setup') {
      return json({ result: { jobs: [{
        id: 'setup-1', status: 'completed', updatedAtIso: '2026-07-18T01:00:00.000Z',
        bot: { id: 'bot-1' }, checks: { ...setupChecks, ...(options.setupChecks ?? {}) },
        account: { email: 'private@example.com' },
      }] } })
    }
    if (url.pathname === '/codex-api/feishu/bots/bot-1/diagnose') {
      const checks = options.liveCheckFailure
        ? liveChecks.map((row) => row.id === options.liveCheckFailure ? { ...row, status: 'fail' } : row)
        : liveChecks
      return json({ result: { report: {
        botId: 'bot-1', ok: !options.liveCheckFailure, generatedAtIso: '2026-07-18T01:01:00.000Z', latencyMs: 10, checks,
      } } })
    }
    if (url.pathname === '/codex-api/feishu/diagnostics') {
      return json({ result: { diagnostics: {
        generatedAtIso: '2026-07-18T01:01:00.000Z',
        counts: {
          outbox: { pending: 0, sending: 0, sent: 1, failed: 0, deadLettered: 0 },
          turns: { queued: 0, running: 0, completed: 1, failed: 0, cancelled: 0 },
          cards: { creating: 0, streaming: 0, completed: 1, failed: 0, cancelled: 0 },
          audit: { success: 2, failed: 0 },
        },
        recentAuditLogs: [{ error: 'sensitive detail must not be copied' }],
      } } })
    }
    return json({ error: `Unhandled ${url.pathname}` }, { status: 404 })
  })
  return { fetchImpl, calls }
}

describe('Feishu tenant acceptance preflight', () => {
  it('rejects remote HTTP unless the operator opts in explicitly', () => {
    expect(() => normalizePreflightUrl('http://10.37.222.12:3000')).toThrow('Remote HTTP is unencrypted')
    expect(normalizePreflightUrl('http://10.37.222.12:3000', true).origin).toBe('http://10.37.222.12:3000')
    expect(normalizePreflightUrl('http://127.0.0.1:3000').origin).toBe('http://127.0.0.1:3000')
    expect(() => normalizePreflightUrl('https://user:secret@example.test')).toThrow('Do not place credentials')
  })

  it('collects a redacted passing build, setup, and live-diagnostic record', async () => {
    const fixture = fetchFixture()
    const evidence = await runFeishuAcceptancePreflight({
      baseUrl: 'https://cody.example.test/path?ignored=1',
      botId: 'bot-1',
      password: 'correct-password',
      fetchImpl: fixture.fetchImpl,
    })
    expect(evidence).toMatchObject({
      baseUrl: 'https://cody.example.test',
      build: { buildId: 'abc123-clean.001' },
      bot: { id: 'bot-1', platform: 'lark', tenantName: 'Example' },
      setup: { status: 'completed', checks: { liveProbeVerified: true } },
      connectivity: { ok: true },
      result: { ok: true, failures: [] },
    })
    expect(evidence.manualAcceptanceRequired).toEqual(FEISHU_MANUAL_ACCEPTANCE_GATES)
    expect(JSON.stringify(evidence)).not.toContain('correct-password')
    expect(JSON.stringify(evidence)).not.toContain('must-not-leak')
    expect(JSON.stringify(evidence)).not.toContain('private@example.com')
    expect(JSON.stringify(evidence)).not.toContain('sensitive detail')
    expect(fixture.calls.find((row) => row.path === '/codex-api/feishu/bots/bot-1/diagnose')).toMatchObject({ method: 'POST' })
  })

  it('keeps an explicitly allowed trusted-network HTTP protocol visible without forcing failure', async () => {
    const fixture = fetchFixture({ accessProtocol: 'http' })
    const evidence = await runFeishuAcceptancePreflight({
      baseUrl: 'http://10.37.222.12:3000',
      password: 'correct-password',
      allowHttp: true,
      fetchImpl: fixture.fetchImpl,
    })
    expect(evidence.result.ok).toBe(true)
    expect(evidence.access).toMatchObject({ protocol: 'http', risks: ['remote-http'] })
  })

  it('fails closed when a setup proof or live diagnostic is not green', async () => {
    const fixture = fetchFixture({ setupChecks: { cardCallbackVerified: false }, liveCheckFailure: 'long_connection' })
    const evidence = await runFeishuAcceptancePreflight({
      baseUrl: 'https://cody.example.test',
      password: 'correct-password',
      fetchImpl: fixture.fetchImpl,
    })
    expect(evidence.result.ok).toBe(false)
    expect(evidence.result.failures).toEqual(expect.arrayContaining([
      'QR setup proof is missing: cardCallbackVerified.',
      'The live Feishu connectivity diagnostic did not pass.',
      'Live diagnostic failed: long_connection.',
    ]))
  })

  it('does not silently continue when CodyWeb authentication fails', async () => {
    const fixture = fetchFixture()
    await expect(runFeishuAcceptancePreflight({
      baseUrl: 'https://cody.example.test',
      password: 'wrong-password',
      fetchImpl: fixture.fetchImpl,
    })).rejects.toThrow('CodyWeb login failed: Invalid password')
  })

  it('writes private evidence files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cody-feishu-preflight-'))
    try {
      const target = await writeFeishuAcceptanceEvidence(join(root, 'nested', 'evidence.json'), { result: { ok: true } })
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ result: { ok: true } })
      expect((await stat(target)).mode & 0o777).toBe(0o600)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
