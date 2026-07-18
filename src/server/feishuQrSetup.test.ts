import { describe, expect, it, vi } from 'vitest'
import { FeishuQrSetupManager } from './feishuQrSetup'
import type { FeishuBotDto } from './routes/feishuRoutes'
import { emptyFeishuSetupChecks, type StoredFeishuQrSetupJob } from './feishuQrSetupStore'

function bot(enabled: boolean): FeishuBotDto {
  return {
    id: 'bot-1',
    name: 'Cody Bot',
    appId: 'cli_created',
    platform: 'feishu',
    tenantId: 't_1',
    tenantName: 'Example',
    secretConfigured: true,
    enabled,
    allowAllUsers: false,
    allowedOpenIds: [],
    groupMentionMode: 'always',
    status: enabled ? 'connecting' : 'disconnected',
    lastConnectedAtIso: null,
    lastHeartbeatAtIso: null,
    lastError: null,
    createdAtIso: '2026-07-18T00:00:00.000Z',
    updatedAtIso: '2026-07-18T00:00:00.000Z',
  }
}

function successfulCreateApp() {
  return vi.fn(async (options: any) => {
    await options.onQrCode?.({ qrText: '', qrPayload: '{"qrlogin":{"token":"safe-token"}}' })
    await options.onStatus?.('已经扫码，等待手机确认')
    const identity = { userId: 'u_1', userName: 'Alice', email: 'alice@example.com', tenantId: 't_1', tenantName: 'Example' }
    await options.onSessionReady?.({ source: 'qr_login', identity })
    await options.onCredentials?.({ appId: 'cli_created', appSecret: 'super-secret', identity })
    return {
      ok: true as const,
      appId: 'cli_created',
      appSecret: 'super-secret',
      brand: 'feishu' as const,
      sessionFile: '/tmp/session.json',
      sessionSource: 'qr_login' as const,
      sessionIdentity: identity,
    }
  })
}

function successfulOfficialCreateApp() {
  return vi.fn(async (options: any) => {
    await options.onQrCode?.({ qrText: 'https://official.example/qr', qrPayload: 'https://official.example/qr', expireIn: 600 })
    const identity = {
      userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice', email: 'alice@example.com',
      tenantId: 't_1', tenantName: 'Example', brand: 'feishu' as const,
    }
    await options.onCredentials?.({
      appId: 'cli_created', appSecret: 'super-secret', brand: 'feishu',
      identity: {
        userId: 'ou_owner', openId: 'ou_owner', userName: '扫码创建者',
        tenantId: '', tenantName: '企业信息待重新验证', brand: 'feishu' as const,
      },
    })
    await options.onSessionReady?.({ source: 'official_device_flow', identity, externallyConfirmed: true })
    return {
      ok: true as const,
      appId: 'cli_created', appSecret: 'super-secret', brand: 'feishu' as const,
      registrationMethod: 'official_device_flow' as const,
      sessionSource: 'official_device_flow' as const,
      sessionIdentity: identity,
    }
  })
}

function successfulAutomation() {
  return {
    ok: true as const,
    sessionFile: '/tmp/session.json',
    sessionSource: 'cody_cache' as const,
    cookieCount: 2,
    scopeCount: 8,
    skippedScopeCount: 0,
    subscribedEventCount: 2,
    missingVcEvents: [],
    eventModeReady: true,
    versionId: 'v1',
  }
}

function successfulOfficialConfiguration() {
  return {
    ok: true as const, scopeCount: 1, subscribedEventCount: 1, subscribedCallbackCount: 1,
    eventModeReady: true as const, callbackModeReady: true as const,
    eventSubscriptionReady: true as const, callbackSubscriptionReady: true as const,
    scopeReady: true as const, onlineVersionReady: true as const, appEnabledReady: true as const,
    botAbilityReady: true as const, visibilityReady: true as const,
    versionId: 'v1', botOpenId: 'ou_bot', botName: 'Cody Bot',
  }
}

const verifyConnectedBot = async () => ({ ...bot(true), status: 'connected' as const })

async function confirmScannedIdentity(manager: FeishuQrSetupManager, jobId: string): Promise<void> {
  await vi.waitFor(() => expect(manager.get(jobId)).toMatchObject({
    status: 'confirming_identity',
    canConfirmIdentity: true,
  }))
  await manager.confirmIdentity(jobId)
}

describe('FeishuQrSetupManager', () => {
  it('uses the official confirmation page without a second local gate and makes the scanner the default owner', async () => {
    const createBot = vi.fn(async (input: any) => ({
      ...bot(false), allowedOpenIds: input.allowedOpenIds, allowedChatIds: input.allowedChatIds,
    }))
    const updateBot = vi.fn(async () => ({ ...bot(true), allowedOpenIds: ['ou_owner'] }))
    const configureOfficialApp = vi.fn(async () => successfulOfficialConfiguration())
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot,
      createApp: successfulOfficialCreateApp() as any,
      refreshOfficialIdentity: vi.fn(async () => ({
        userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice', email: 'alice@example.com',
        tenantId: 't_1', tenantName: 'Example', brand: 'feishu' as const,
      })),
      configureOfficialApp,
      verifyBotConnection: vi.fn(async () => ({ ...await verifyConnectedBot(), allowedOpenIds: ['ou_owner'] })),
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })

    const started = await manager.start({
      name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always',
      availability: { mode: 'groups', memberIds: [], groupIds: ['oc_allowed'] },
    })
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))

    expect(manager.get(started.id)?.canConfirmIdentity).toBe(false)
    expect(createBot).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'feishu', allowedOpenIds: ['ou_owner'], allowedChatIds: ['oc_allowed'], enabled: false,
    }))
    expect(configureOfficialApp).toHaveBeenCalledWith(expect.objectContaining({
      visibility: { isVisibleToAll: false, userOpenIds: ['ou_owner'] },
    }))
    expect(manager.get(started.id)?.checks).toEqual(Object.fromEntries(
      Object.keys(emptyFeishuSetupChecks()).map((key) => [key, true]),
    ))
  })

  it('repairs official scopes before revalidating a persisted app after an identity lookup failure', async () => {
    const createApp = vi.fn(async (options: any) => {
      const fallbackIdentity = {
        userId: 'ou_owner', openId: 'ou_owner', userName: '扫码创建者',
        tenantId: '', tenantName: '企业信息待重新验证', brand: 'feishu' as const,
      }
      await options.onCredentials?.({
        appId: 'cli_created', appSecret: 'super-secret', identity: fallbackIdentity, brand: 'feishu',
      })
      return { ok: false as const, reason: 'identity_unavailable' as const, message: 'tenant query failed', appId: 'cli_created' }
    })
    const createBot = vi.fn(async (input: any) => ({
      ...bot(false), tenantId: input.tenantId, tenantName: input.tenantName,
      allowedOpenIds: input.allowedOpenIds, allowedChatIds: input.allowedChatIds,
    }))
    const refreshOfficialIdentity = vi.fn(async () => ({
      userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
      tenantId: 't_recovered', tenantName: 'Recovered Enterprise', brand: 'feishu' as const,
    }))
    const configureOfficialApp = vi.fn(async () => successfulOfficialConfiguration())
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot: vi.fn(async () => ({ ...bot(true), tenantId: 't_recovered', tenantName: 'Recovered Enterprise' })),
      createApp: createApp as any,
      refreshOfficialIdentity,
      configureOfficialApp,
      verifyBotConnection: verifyConnectedBot,
    })

    const started = await manager.start({ name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(started.id)).toMatchObject({ status: 'failed', canRetry: true }))
    await manager.retry(started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))

    expect(createApp).toHaveBeenCalledTimes(1)
    expect(configureOfficialApp).toHaveBeenCalledTimes(1)
    expect(refreshOfficialIdentity).toHaveBeenCalledWith({ botId: 'bot-1', ownerOpenId: 'ou_owner' })
    expect(configureOfficialApp.mock.invocationCallOrder[0]).toBeLessThan(refreshOfficialIdentity.mock.invocationCallOrder[0])
    expect(manager.get(started.id)?.account).toMatchObject({ tenantName: 'Recovered Enterprise', userName: 'Alice' })
  })

  it('does not start another QR flow for the obsolete application patch permission', async () => {
    const identity = {
      userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
      tenantId: 't_1', tenantName: 'Example', brand: 'feishu' as const,
    }
    const createApp = vi.fn(async (options: any) => {
      await options.onCredentials?.({
        appId: 'cli_created', appSecret: 'super-secret', identity, brand: 'feishu',
      })
      await options.onSessionReady?.({ source: 'official_device_flow', identity, externallyConfirmed: true })
      return {
        ok: true as const, appId: 'cli_created', appSecret: 'super-secret', brand: 'feishu' as const,
        registrationMethod: 'official_device_flow' as const,
        sessionSource: 'official_device_flow' as const,
        sessionIdentity: identity,
      }
    })
    const configureOfficialApp = vi.fn()
      .mockResolvedValueOnce({
        ok: false as const, reason: 'api_error' as const,
        message: '飞书错误 99991672: [application:application:patch]',
      })
      .mockResolvedValueOnce(successfulOfficialConfiguration())
    const createBot = vi.fn(async () => bot(false))
    const updateBot = vi.fn(async (_botId: string, input: any) => ({ ...bot(input.enabled === true), ...input }))
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot,
      findBotByAppId: vi.fn(async () => createApp.mock.calls.length > 1 ? bot(false) : null),
      createApp: createApp as any,
      refreshOfficialIdentity: vi.fn(async () => identity),
      configureOfficialApp,
      verifyBotConnection: verifyConnectedBot,
    })

    const started = await manager.start({ name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(started.id)).toMatchObject({ status: 'failed', canRetry: true }))
    await manager.retry(started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))

    expect(createApp).toHaveBeenCalledTimes(1)
    expect(createBot).toHaveBeenCalledTimes(1)
    expect(configureOfficialApp).toHaveBeenCalledTimes(2)
  })

  it('takes over an exact existing app through the official device flow without creating a second local bot', async () => {
    const createApp = vi.fn(async (options: any) => {
      expect(options.appIdToAdopt).toBe('cli_existing')
      const identity = {
        userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
        tenantId: 't_1', tenantName: 'Example', brand: 'feishu' as const,
      }
      await options.onCredentials?.({
        appId: 'cli_existing', appSecret: 'refreshed-secret', brand: 'feishu',
        identity: { ...identity, userName: '扫码创建者', tenantId: '', tenantName: '企业信息待重新验证' },
      })
      await options.onSessionReady?.({ source: 'official_device_flow', identity, externallyConfirmed: true })
      return {
        ok: true as const, appId: 'cli_existing', appSecret: 'refreshed-secret', brand: 'feishu' as const,
        registrationMethod: 'official_device_flow' as const, sessionSource: 'official_device_flow' as const,
        sessionIdentity: identity,
      }
    })
    const createBot = vi.fn(async () => bot(false))
    const updateBot = vi.fn(async (_botId: string, input: any) => ({ ...bot(input.enabled === true), appId: 'cli_existing' }))
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot,
      findBotByAppId: vi.fn(async () => ({ ...bot(false), appId: 'cli_existing' })),
      createApp: createApp as any,
      refreshOfficialIdentity: vi.fn(async () => ({
        userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
        tenantId: 't_1', tenantName: 'Example', brand: 'feishu' as const,
      })),
      configureOfficialApp: vi.fn(async () => successfulOfficialConfiguration()),
      verifyBotConnection: verifyConnectedBot,
    })

    const started = await manager.adoptOfficial('cli_existing', {
      name: 'Recovered', allowedOpenIds: [], groupMentionMode: 'always',
    })
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))
    expect(createBot).not.toHaveBeenCalled()
    expect(updateBot).toHaveBeenCalledWith('bot-1', expect.objectContaining({
      appSecret: 'refreshed-secret', enabled: false, allowedOpenIds: ['ou_owner'],
    }))
    expect(createApp).toHaveBeenCalledTimes(1)
  })

  it('runs one-scan creation through local credential storage, automatic configuration, and connection', async () => {
    const createBot = vi.fn(async () => bot(false))
    const updateBot = vi.fn(async () => bot(true))
    const ensureOwnerAccess = vi.fn(async () => ({ ...bot(false), allowedOpenIds: ['ou_owner'] }))
    const verifyBotConnection = vi.fn(async () => ({ ...bot(true), allowedOpenIds: ['ou_owner'], status: 'connected' as const }))
    const automateSetup = vi.fn(async () => successfulAutomation())
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot,
      ensureOwnerAccess,
      verifyBotConnection,
      createApp: successfulCreateApp() as any,
      automateSetup: automateSetup as any,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })

    const started = await manager.start({ name: ' Cody Bot ', allowedOpenIds: [], groupMentionMode: 'always' })
    expect(started.status).toBe('starting')
    await vi.waitFor(() => expect(manager.get(started.id)).toMatchObject({
      status: 'confirming_identity',
      canConfirmIdentity: true,
      account: { userName: 'Alice', tenantName: 'Example' },
    }))
    expect(createBot).not.toHaveBeenCalled()
    await manager.confirmIdentity(started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))

    expect(createBot).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'cli_created', appSecret: 'super-secret', platform: 'feishu',
      tenantId: 't_1', tenantName: 'Example', enabled: false,
    }))
    expect(updateBot).toHaveBeenCalledWith('bot-1', { enabled: true })
    expect(ensureOwnerAccess).toHaveBeenCalledWith('bot-1', 'alice@example.com')
    expect(ensureOwnerAccess.mock.invocationCallOrder[0]).toBeLessThan(updateBot.mock.invocationCallOrder[0] ?? Infinity)
    expect(verifyBotConnection).toHaveBeenCalledWith('bot-1', expect.any(AbortSignal))
    expect(automateSetup).toHaveBeenCalledWith(expect.objectContaining({
      visibilityOverride: {
        visibleSuggest: { departments: [], members: ['u_1'], groups: [], isAll: 0 },
        blackVisibleSuggest: { departments: [], members: [], groups: [], isAll: 0 },
      },
    }))
    const completed = manager.get(started.id)
    expect(completed?.bot).toMatchObject({ id: 'bot-1', enabled: true })
    expect(completed?.statusMessage).toContain('长连接与身份已验证')
    expect(JSON.stringify(completed)).not.toContain('super-secret')
    expect(completed?.account).toEqual({ userName: 'Alice', email: 'alice@example.com', tenantName: 'Example' })
  })

  it('publishes an explicit organization-wide availability only when selected', async () => {
    const automateSetup = vi.fn(async () => successfulAutomation())
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)), updateBot: vi.fn(async () => bot(true)),
      createApp: successfulCreateApp() as any, automateSetup: automateSetup as any,
      verifyBotConnection: verifyConnectedBot,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })
    const started = await manager.start({
      name: 'All hands', allowedOpenIds: ['ou_owner'], groupMentionMode: 'always',
      availability: { mode: 'all', memberIds: [], groupIds: [] },
    })
    await confirmScannedIdentity(manager, started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))
    expect(automateSetup).toHaveBeenCalledWith(expect.objectContaining({
      visibilityOverride: expect.objectContaining({
        visibleSuggest: { departments: [], members: [], groups: [], isAll: 1 },
      }),
    }))
  })

  it('keeps a created app as a disabled local bot when configuration fails and retries without another scan', async () => {
    const automateSetup = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'api_error', message: 'event callback failed' })
      .mockResolvedValueOnce(successfulAutomation())
    const createApp = successfulCreateApp()
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)),
      updateBot: vi.fn(async (_botId, input) => bot(input.enabled === true)),
      createApp: createApp as any,
      automateSetup: automateSetup as any,
      verifyBotConnection: verifyConnectedBot,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })

    const started = await manager.start({ name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await confirmScannedIdentity(manager, started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('failed'))
    expect(manager.get(started.id)).toMatchObject({ canRetry: true, bot: { enabled: false } })

    await manager.retry(started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))
    expect(createApp).toHaveBeenCalledTimes(1)
    expect(automateSetup).toHaveBeenCalledTimes(2)
  })

  it('fails closed when no live connection diagnostic can prove completion', async () => {
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)),
      updateBot: vi.fn(async (_botId, input) => bot(input.enabled === true)),
      createApp: successfulCreateApp() as any,
      automateSetup: vi.fn(async () => successfulAutomation()) as any,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })

    const started = await manager.start({ name: 'Unverified bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await confirmScannedIdentity(manager, started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('failed'))

    expect(manager.get(started.id)).toMatchObject({
      canRetry: true,
      error: expect.stringContaining('实时连接诊断器'),
      bot: { enabled: false },
      checks: { credentialsSaved: true, sdkConnectionVerified: false, liveProbeVerified: false },
    })
  })

  it('cancels a waiting QR job without creating a bot', async () => {
    const createBot = vi.fn(async () => bot(false))
    const createApp = vi.fn(async (options: any) => {
      await options.onQrCode?.({ qrText: '', qrPayload: 'payload' })
      await new Promise<void>((resolve) => {
        if (options.signal.aborted) resolve()
        else options.signal.addEventListener('abort', resolve, { once: true })
      })
      return { ok: false as const, reason: 'aborted' as const, message: '用户取消扫码' }
    })
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot: vi.fn(async () => bot(true)),
      createApp: createApp as any,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })

    const started = await manager.start({ name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('awaiting_scan'))
    expect((await manager.cancel(started.id))?.status).toBe('cancelled')
    await vi.waitFor(() => expect(createApp).toHaveResolved())
    expect(createBot).not.toHaveBeenCalled()
  })

  it('cancels at the account confirmation gate without creating an application bot', async () => {
    const createBot = vi.fn(async () => bot(false))
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot: vi.fn(async () => bot(true)),
      createApp: successfulCreateApp() as any,
      qrDataUrl: vi.fn(async () => 'data:image/png;base64,qr'),
    })
    const started = await manager.start({ name: 'Cody Bot', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('confirming_identity'))
    await manager.cancel(started.id)
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('cancelled'))
    expect(createBot).not.toHaveBeenCalled()
  })

  it('allows only one active QR creation job', async () => {
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)),
      updateBot: vi.fn(async () => bot(true)),
      createApp: vi.fn(async () => await new Promise(() => {})) as any,
    })
    await manager.start({ name: 'One', allowedOpenIds: [], groupMentionMode: 'always' })
    await expect(manager.start({ name: 'Two', allowedOpenIds: [], groupMentionMode: 'always' })).rejects.toThrow('已有飞书扫码创建任务正在进行')
    await manager.stop()
  })

  it('marks a timed-out official QR as expired and releases the active setup slot', async () => {
    const createApp = vi.fn(async () => ({
      ok: false as const,
      reason: 'qr_expired' as const,
      message: '飞书扫码确认超时，请重新发起',
    }))
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)),
      updateBot: vi.fn(async () => bot(true)),
      createApp: createApp as any,
    })

    const first = await manager.start({ name: 'Expired One', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(first.id)).toMatchObject({
      status: 'expired',
      statusMessage: '二维码已过期，请重新发起',
      error: '飞书扫码确认超时，请重新发起',
      canCancel: false,
    }))

    const second = await manager.start({ name: 'Expired Two', allowedOpenIds: [], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(second.id)?.status).toBe('expired'))
    expect(createApp).toHaveBeenCalledTimes(2)
  })

  it('resumes a persisted post-credential setup without creating another app', async () => {
    const persisted: StoredFeishuQrSetupJob = {
      id: 'job-restart', name: 'Cody Bot', status: 'configuring', statusMessage: 'configuring',
      account: { userName: 'Alice', email: null, tenantName: 'Example' }, warnings: [], error: null,
      canRetry: false, canCancel: false, canConfirmIdentity: false,
      input: { name: 'Cody Bot', allowAllUsers: false, allowedOpenIds: ['ou_a'], groupMentionMode: 'always' },
      appId: 'cli_created', botId: 'bot-1',
      checks: { ...emptyFeishuSetupChecks(), credentialsSaved: true },
      createdAtIso: '2026-07-18T00:00:00.000Z', updatedAtIso: '2026-07-18T00:01:00.000Z',
    }
    const saves: StoredFeishuQrSetupJob[] = []
    const createApp = vi.fn()
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)),
      updateBot: vi.fn(async () => bot(true)),
      findBot: vi.fn(async () => bot(false)),
      loadPersistedJobs: vi.fn(async () => [persisted]),
      savePersistedJob: vi.fn(async (value) => { saves.push(structuredClone(value)) }),
      automateSetup: vi.fn(async () => successfulAutomation()) as any,
      verifyBotConnection: verifyConnectedBot,
      createApp: createApp as any,
    })

    await manager.restore()
    await vi.waitFor(() => expect(manager.get('job-restart')?.status).toBe('completed'))
    expect(createApp).not.toHaveBeenCalled()
    expect(saves.at(-1)).toMatchObject({ status: 'completed', appId: 'cli_created', botId: 'bot-1' })
  })

  it('fails closed after a restart in an outcome-unknown app creation phase', async () => {
    const persisted: StoredFeishuQrSetupJob = {
      id: 'job-unknown', name: 'Cody Bot', status: 'creating_app', statusMessage: 'creating',
      account: { userName: 'Alice', email: null, tenantName: 'Example' }, warnings: [], error: null,
      canRetry: false, canCancel: false, canConfirmIdentity: false,
      input: { name: 'Cody Bot', allowAllUsers: false, allowedOpenIds: [], groupMentionMode: 'always' },
      appId: 'cli_maybe_created', botId: null,
      checks: emptyFeishuSetupChecks(),
      createdAtIso: '2026-07-18T00:00:00.000Z', updatedAtIso: '2026-07-18T00:01:00.000Z',
    }
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)), updateBot: vi.fn(async () => bot(true)),
      loadPersistedJobs: vi.fn(async () => [persisted]), savePersistedJob: vi.fn(async () => undefined),
      createApp: vi.fn() as any,
    })

    await manager.restore()
    expect(manager.get('job-unknown')).toMatchObject({
      status: 'failed', canRetry: false, error: expect.stringContaining('不会自动重新创建'),
    })
  })

  it('requires a fresh scan after restart while account confirmation was pending', async () => {
    const persisted: StoredFeishuQrSetupJob = {
      id: 'job-confirming', name: 'Cody Bot', status: 'confirming_identity', statusMessage: 'confirm',
      account: { userName: 'Alice', email: null, tenantName: 'Example' }, warnings: [], error: null,
      canRetry: false, canCancel: true, canConfirmIdentity: true,
      input: { name: 'Cody Bot', allowAllUsers: false, allowedOpenIds: [], groupMentionMode: 'always' },
      appId: null, botId: null,
      checks: emptyFeishuSetupChecks(),
      createdAtIso: '2026-07-18T00:00:00.000Z', updatedAtIso: '2026-07-18T00:01:00.000Z',
    }
    const createApp = vi.fn()
    const manager = new FeishuQrSetupManager({
      createBot: vi.fn(async () => bot(false)), updateBot: vi.fn(async () => bot(true)),
      loadPersistedJobs: vi.fn(async () => [persisted]), savePersistedJob: vi.fn(async () => undefined),
      createApp: createApp as any,
    })
    await manager.restore()
    expect(manager.get('job-confirming')).toMatchObject({
      status: 'failed', canConfirmIdentity: false, error: expect.stringContaining('重新发起扫码'),
    })
    expect(createApp).not.toHaveBeenCalled()
  })

  it('adopts a visible existing app without creating a duplicate', async () => {
    const createBot = vi.fn(async () => bot(false))
    const createApp = vi.fn()
    const manager = new FeishuQrSetupManager({
      createBot,
      updateBot: vi.fn(async () => bot(true)),
      findBotByAppId: vi.fn(async () => null),
      createApp: createApp as any,
      adoptApp: vi.fn(async () => ({
        ok: true as const, appId: 'cli_existing', appSecret: 'existing-secret',
        identity: { userId: 'u_1', userName: 'Alice', email: 'alice@example.com', tenantId: 't_1', tenantName: 'Example' },
      })) as any,
      automateSetup: vi.fn(async () => successfulAutomation()) as any,
      verifyBotConnection: verifyConnectedBot,
    })

    const started = await manager.adopt('cli_existing', { name: 'Recovered', allowedOpenIds: ['ou_owner'], groupMentionMode: 'always' })
    await vi.waitFor(() => expect(manager.get(started.id)?.status).toBe('completed'))
    expect(createApp).not.toHaveBeenCalled()
    expect(createBot).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'cli_existing', appSecret: 'existing-secret', platform: 'feishu',
      tenantId: 't_1', tenantName: 'Example', enabled: false,
    }))
    expect(JSON.stringify(manager.get(started.id))).not.toContain('existing-secret')
  })
})
