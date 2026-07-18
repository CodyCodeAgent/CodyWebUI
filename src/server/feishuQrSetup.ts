import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import {
  adoptFeishuOpenPlatformApp,
  automateOpenPlatformSetup,
  registerOfficialFeishuOpenPlatformApp,
  type FeishuWebSessionIdentity,
  type OfficialFeishuSetupResult,
  type OpenPlatformOnlineVisibility,
  type OpenPlatformAutomationResult,
} from './feishuOpenPlatform.js'
import type {
  FeishuBotDto,
  FeishuBotWriteInput,
  FeishuGroupMentionModeDto,
} from './routes/feishuRoutes.js'
import {
  emptyFeishuSetupChecks,
  type FeishuSetupChecks,
  type StoredFeishuQrSetupJob,
} from './feishuQrSetupStore.js'

export type FeishuQrSetupStatus =
  | 'starting'
  | 'awaiting_scan'
  | 'authorizing'
  | 'confirming_identity'
  | 'creating_app'
  | 'configuring'
  | 'connecting'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled'

export type FeishuQrSetupJobDto = {
  id: string
  name: string
  status: FeishuQrSetupStatus
  statusMessage: string
  qrDataUrl: string | null
  qrExpiresAtIso: string | null
  account: {
    userName: string
    email: string | null
    tenantName: string
  } | null
  bot: FeishuBotDto | null
  warnings: string[]
  error: string | null
  canRetry: boolean
  canCancel: boolean
  canConfirmIdentity: boolean
  checks: FeishuSetupChecks
  createdAtIso: string
  updatedAtIso: string
}

export type FeishuQrSetupInput = {
  name: string
  allowAllUsers?: boolean
  allowedOpenIds: string[]
  groupMentionMode: FeishuGroupMentionModeDto
  availability?: {
    mode: 'creator' | 'members' | 'groups' | 'all'
    memberIds: string[]
    groupIds: string[]
  }
}

type MutableJob = Omit<FeishuQrSetupJobDto, 'checks'> & {
  checks: FeishuSetupChecks
  appId: string | null
  botId: string | null
  ownerPlatformUserId: string | null
  registrationMethod: 'official_device_flow' | 'web_console' | null
  controller: AbortController
  input: FeishuQrSetupInput & { allowAllUsers: boolean }
}

type CreateBotInput = Required<Pick<FeishuBotWriteInput, 'name' | 'appId' | 'platform' | 'enabled' | 'allowAllUsers' | 'allowedOpenIds' | 'groupMentionMode'>> & Pick<FeishuBotWriteInput, 'allowedChatIds'> & {
  appSecret: string
  tenantId?: string
  tenantName?: string
}

export type FeishuQrSetupDependencies = {
  createBot: (input: CreateBotInput) => Promise<FeishuBotDto>
  updateBot: (botId: string, input: FeishuBotWriteInput) => Promise<FeishuBotDto>
  findBot?: (botId: string) => Promise<FeishuBotDto | null>
  findBotByAppId?: (appId: string) => Promise<FeishuBotDto | null>
  verifyBotConnection?: (botId: string, signal: AbortSignal) => Promise<FeishuBotDto>
  refreshOfficialIdentity?: (input: {
    botId: string
    ownerOpenId: string
  }) => Promise<FeishuWebSessionIdentity>
  configureOfficialApp?: (input: {
    botId: string
    signal: AbortSignal
    visibility: { isVisibleToAll: boolean; userOpenIds: string[] }
  }) => Promise<OfficialFeishuSetupResult>
  ensureOwnerAccess?: (botId: string, email: string | null) => Promise<FeishuBotDto>
  loadPersistedJobs?: () => Promise<StoredFeishuQrSetupJob[]>
  savePersistedJob?: (job: StoredFeishuQrSetupJob) => Promise<void>
  deleteExpiredPersistedJobs?: (beforeIso: string) => Promise<number>
  createApp?: typeof registerOfficialFeishuOpenPlatformApp
  adoptApp?: typeof adoptFeishuOpenPlatformApp
  automateSetup?: typeof automateOpenPlatformSetup
  qrDataUrl?: (payload: string) => Promise<string>
  now?: () => Date
}

const ACTIVE_STATUSES = new Set<FeishuQrSetupStatus>([
  'starting',
  'awaiting_scan',
  'authorizing',
  'confirming_identity',
  'creating_app',
  'configuring',
  'connecting',
])

const REQUIRED_SETUP_CHECKS = Object.keys(emptyFeishuSetupChecks()) as Array<keyof FeishuSetupChecks>

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[A-Za-z0-9_=-]{24,}/g, '***')
}

function publicJob(job: MutableJob): FeishuQrSetupJobDto {
  const {
    appId: _appId,
    botId: _botId,
    ownerPlatformUserId: _owner,
    registrationMethod: _registrationMethod,
    controller: _controller,
    input: _input,
    ...dto
  } = job
  return structuredClone(dto)
}

export class FeishuQrSetupManager {
  private readonly jobs = new Map<string, MutableJob>()
  private restorePromise: Promise<void> | null = null
  private readonly createApp: typeof registerOfficialFeishuOpenPlatformApp
  private readonly adoptApp: typeof adoptFeishuOpenPlatformApp
  private readonly automateSetup: typeof automateOpenPlatformSetup
  private readonly makeQrDataUrl: (payload: string) => Promise<string>
  private readonly now: () => Date
  private readonly identityConfirmations = new Map<string, () => void>()

  constructor(private readonly deps: FeishuQrSetupDependencies) {
    this.createApp = deps.createApp ?? registerOfficialFeishuOpenPlatformApp
    this.adoptApp = deps.adoptApp ?? adoptFeishuOpenPlatformApp
    this.automateSetup = deps.automateSetup ?? automateOpenPlatformSetup
    this.makeQrDataUrl = deps.qrDataUrl ?? ((payload) => QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#0f172aff', light: '#ffffffff' },
    }))
    this.now = deps.now ?? (() => new Date())
  }

  restore(): Promise<void> {
    this.restorePromise ??= this.restoreFromStore()
    return this.restorePromise
  }

  private async restoreFromStore(): Promise<void> {
    const storedJobs = await this.deps.loadPersistedJobs?.() ?? []
    for (const stored of storedJobs) {
      const bot = stored.botId && this.deps.findBot ? await this.deps.findBot(stored.botId) : null
      const job: MutableJob = {
        id: stored.id,
        name: stored.name,
        status: stored.status,
        statusMessage: stored.statusMessage,
        qrDataUrl: null,
        qrExpiresAtIso: null,
        account: stored.account,
        bot,
        warnings: stored.warnings,
        error: stored.error,
        canRetry: stored.canRetry && Boolean(stored.appId && bot),
        canCancel: false,
        canConfirmIdentity: false,
        createdAtIso: stored.createdAtIso,
        updatedAtIso: stored.updatedAtIso,
        appId: stored.appId,
        botId: stored.botId,
        ownerPlatformUserId: stored.ownerPlatformUserId ?? null,
        registrationMethod: stored.registrationMethod ?? null,
        checks: {
          ...emptyFeishuSetupChecks(),
          ...stored.checks,
          credentialsSaved: stored.checks.credentialsSaved || Boolean(bot?.secretConfigured),
        },
        controller: new AbortController(),
        input: stored.input,
      }
      this.jobs.set(job.id, job)

      if (!ACTIVE_STATUSES.has(stored.status)) continue
      if (stored.appId && bot && (stored.status === 'configuring' || stored.status === 'connecting')) {
        await this.patchAndPersist(job, {
          status: 'configuring',
          statusMessage: '服务已恢复，正在继续配置飞书应用',
          error: null,
          canRetry: false,
          canCancel: false,
        })
        void this.configure(job)
        continue
      }
      await this.patchAndPersist(job, {
        status: 'failed',
        statusMessage: stored.appId ? '服务在应用创建阶段重启，需要接管已有应用' : '服务在扫码阶段重启，请重新扫码',
        error: stored.appId
          ? `飞书应用 ${stored.appId} 可能已经创建；为避免重复应用，系统不会自动重新创建。`
          : '二维码登录不能跨服务重启恢复，请重新发起扫码。',
        canRetry: Boolean(stored.appId && bot),
        canCancel: false,
      })
    }
    const retentionBefore = new Date(this.now().getTime() - 7 * 24 * 60 * 60_000).toISOString()
    await this.deps.deleteExpiredPersistedJobs?.(retentionBefore)
    this.prune()
  }

  async start(input: FeishuQrSetupInput): Promise<FeishuQrSetupJobDto> {
    await this.restore()
    this.prune()
    const active = [...this.jobs.values()].find((job) => ACTIVE_STATUSES.has(job.status))
    if (active) throw new Error('已有飞书扫码创建任务正在进行，请先完成或取消')
    const name = input.name.trim()
    if (!name) throw new Error('机器人名称不能为空')
    const nowIso = this.now().toISOString()
    const job: MutableJob = {
      id: randomUUID(),
      name,
      status: 'starting',
      statusMessage: '正在准备飞书登录二维码',
      qrDataUrl: null,
      qrExpiresAtIso: null,
      account: null,
      bot: null,
      warnings: [],
      error: null,
      canRetry: false,
      canCancel: true,
      canConfirmIdentity: false,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      appId: null,
      botId: null,
      ownerPlatformUserId: null,
      registrationMethod: null,
      checks: emptyFeishuSetupChecks(),
      controller: new AbortController(),
      input: {
        name,
        allowAllUsers: input.allowAllUsers === true,
        allowedOpenIds: [...new Set(input.allowedOpenIds.map((value) => value.trim()).filter(Boolean))],
        groupMentionMode: input.groupMentionMode,
        availability: this.normalizeAvailability(input.availability),
      },
    }
    this.jobs.set(job.id, job)
    await this.persist(job)
    void this.run(job)
    return publicJob(job)
  }

  async adoptOfficial(appId: string, input: FeishuQrSetupInput): Promise<FeishuQrSetupJobDto> {
    await this.restore()
    this.prune()
    const active = [...this.jobs.values()].find((job) => ACTIVE_STATUSES.has(job.status))
    if (active) throw new Error('已有飞书创建或接管任务正在进行，请先完成')
    const normalizedAppId = appId.trim()
    const name = input.name.trim()
    if (!normalizedAppId.startsWith('cli_')) throw new Error('请输入有效的飞书/Lark 企业自建应用 App ID')
    if (!name) throw new Error('机器人名称不能为空')
    const nowIso = this.now().toISOString()
    const job: MutableJob = {
      id: randomUUID(), name, status: 'starting', statusMessage: '正在准备飞书官方接管二维码',
      qrDataUrl: null, qrExpiresAtIso: null, account: null, bot: null,
      warnings: [], error: null, canRetry: false, canCancel: true, canConfirmIdentity: false,
      createdAtIso: nowIso, updatedAtIso: nowIso, appId: normalizedAppId, botId: null,
      ownerPlatformUserId: null, registrationMethod: 'official_device_flow',
      checks: emptyFeishuSetupChecks(),
      controller: new AbortController(),
      input: {
        name,
        allowAllUsers: input.allowAllUsers === true,
        allowedOpenIds: [...new Set(input.allowedOpenIds.map((value) => value.trim()).filter(Boolean))],
        groupMentionMode: input.groupMentionMode,
        availability: this.normalizeAvailability(input.availability),
      },
    }
    this.jobs.set(job.id, job)
    await this.persist(job)
    void this.run(job, normalizedAppId)
    return publicJob(job)
  }

  async adopt(appId: string, input: FeishuQrSetupInput): Promise<FeishuQrSetupJobDto> {
    await this.restore()
    this.prune()
    const active = [...this.jobs.values()].find((job) => ACTIVE_STATUSES.has(job.status))
    if (active) throw new Error('已有飞书创建或接管任务正在进行，请先完成')
    const normalizedAppId = appId.trim()
    const name = input.name.trim()
    if (!normalizedAppId.startsWith('cli_')) throw new Error('请选择有效的飞书企业自建应用')
    if (!name) throw new Error('机器人名称不能为空')
    const nowIso = this.now().toISOString()
    const job: MutableJob = {
      id: randomUUID(), name, status: 'configuring', statusMessage: '正在读取已有应用凭据并准备接管',
      qrDataUrl: null, qrExpiresAtIso: null, account: null, bot: null,
      warnings: [], error: null, canRetry: false, canCancel: false, canConfirmIdentity: false,
      createdAtIso: nowIso, updatedAtIso: nowIso, appId: normalizedAppId, botId: null,
      ownerPlatformUserId: null,
      registrationMethod: 'web_console',
      checks: emptyFeishuSetupChecks(),
      controller: new AbortController(),
      input: {
        name,
        allowAllUsers: input.allowAllUsers === true,
        allowedOpenIds: [...new Set(input.allowedOpenIds.map((value) => value.trim()).filter(Boolean))],
        groupMentionMode: input.groupMentionMode,
        availability: this.normalizeAvailability(input.availability),
      },
    }
    this.jobs.set(job.id, job)
    await this.persist(job)
    void this.runAdoption(job)
    return publicJob(job)
  }

  get(jobId: string): FeishuQrSetupJobDto | null {
    this.prune()
    const job = this.jobs.get(jobId)
    return job ? publicJob(job) : null
  }

  list(): FeishuQrSetupJobDto[] {
    this.prune()
    return [...this.jobs.values()]
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
      .map(publicJob)
  }

  async cancel(jobId: string): Promise<FeishuQrSetupJobDto | null> {
    const job = this.jobs.get(jobId)
    if (!job) return null
    if (!job.canCancel) return publicJob(job)
    job.controller.abort()
    await this.patchAndPersist(job, {
      status: 'cancelled',
      statusMessage: '已取消扫码创建',
      qrDataUrl: null,
      qrExpiresAtIso: null,
      canCancel: false,
      canConfirmIdentity: false,
    })
    return publicJob(job)
  }

  async confirmIdentity(jobId: string): Promise<FeishuQrSetupJobDto | null> {
    const job = this.jobs.get(jobId)
    const resume = this.identityConfirmations.get(jobId)
    if (!job || !job.canConfirmIdentity || !resume) return job ? publicJob(job) : null
    const previous = {
      status: job.status,
      statusMessage: job.statusMessage,
      canConfirmIdentity: job.canConfirmIdentity,
      canCancel: job.canCancel,
    }
    try {
      await this.patchAndPersist(job, {
        status: 'creating_app',
        statusMessage: '账号与企业已确认，正在创建飞书应用',
        canConfirmIdentity: false,
        canCancel: false,
      })
    } catch (error) {
      this.patch(job, previous)
      throw error
    }
    resume()
    return publicJob(job)
  }

  async retry(jobId: string): Promise<FeishuQrSetupJobDto | null> {
    const job = this.jobs.get(jobId)
    if (!job) return null
    if (!job.canRetry || !job.appId || !job.bot) return publicJob(job)
    job.controller = new AbortController()
    await this.patchAndPersist(job, {
      status: 'configuring',
      statusMessage: '正在重新配置权限、事件与发布版本',
      error: null,
      canRetry: false,
      canCancel: false,
      canConfirmIdentity: false,
    })
    void this.configure(job)
    return publicJob(job)
  }

  async stop(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (!ACTIVE_STATUSES.has(job.status)) continue
      job.controller.abort()
      const recoverable = Boolean(job.appId && job.bot)
      await this.patchAndPersist(job, {
        status: recoverable ? 'configuring' : 'cancelled',
        statusMessage: recoverable ? '服务停止，重启后将继续配置' : '服务停止，扫码创建已取消',
        qrDataUrl: null,
        qrExpiresAtIso: null,
        canRetry: recoverable,
        canCancel: false,
        canConfirmIdentity: false,
      })
    }
  }

  private async run(job: MutableJob, appIdToAdopt?: string): Promise<void> {
    try {
      const created = await this.createApp({
        name: job.name,
        description: 'CodyWebUI 飞书 AI 编程助手',
        signal: job.controller.signal,
        forceQrLogin: true,
        disableBytedcliFallback: true,
        pollIntervalMs: 1_500,
        maxWaitMs: 180_000,
        ...(appIdToAdopt ? { appIdToAdopt } : {}),
        onQrCode: async ({ qrPayload, expireIn }) => {
          if (job.controller.signal.aborted) return
          await this.patchAndPersist(job, {
            status: 'awaiting_scan',
            statusMessage: '请用飞书扫描二维码并在手机上确认',
            qrDataUrl: await this.makeQrDataUrl(qrPayload),
            qrExpiresAtIso: new Date(this.now().getTime() + Math.max(1, expireIn ?? 180) * 1_000).toISOString(),
          })
        },
        onStatus: async (message) => {
          if (job.controller.signal.aborted) return
          await this.patchAndPersist(job, {
            status: message.includes('已经扫码') ? 'authorizing' : job.status,
            statusMessage: message,
          })
        },
        onSessionReady: async ({ identity, source, externallyConfirmed }) => {
          if (job.controller.signal.aborted || job.status === 'cancelled') throw new Error('用户取消扫码')
          job.ownerPlatformUserId = identity.openId ?? identity.userId
          job.registrationMethod = source === 'official_device_flow' ? 'official_device_flow' : 'web_console'
          if (externallyConfirmed) {
            job.checks.accountVerified = true
            await this.patchAndPersist(job, {
              status: job.bot ? 'configuring' : 'creating_app',
              statusMessage: job.bot
                ? `飞书官方页面已确认 ${identity.userName} · ${identity.tenantName}，正在回读应用配置`
                : `飞书官方页面已确认 ${identity.userName} · ${identity.tenantName}，正在安全保存应用`,
              account: this.accountDto(identity),
              qrDataUrl: null,
              qrExpiresAtIso: null,
              canCancel: false,
              canConfirmIdentity: false,
            })
            return
          }
          const confirmation = this.waitForIdentityConfirmation(job)
          try {
            await this.patchAndPersist(job, {
              status: 'confirming_identity',
              statusMessage: `请确认将以 ${identity.userName} · ${identity.tenantName} 创建应用`,
              account: this.accountDto(identity),
              qrDataUrl: null,
              qrExpiresAtIso: null,
              canCancel: true,
              canConfirmIdentity: true,
            })
          } catch (error) {
            job.controller.abort()
            await confirmation.catch(() => undefined)
            throw error
          }
          await confirmation
          job.checks.accountVerified = true
          await this.persist(job)
        },
        onCredentials: async ({ appId, appSecret, identity, brand }) => {
          job.appId = appId
          if (brand) job.registrationMethod = 'official_device_flow'
          const ownerOpenId = identity.openId?.trim()
            || (job.registrationMethod === 'official_device_flow' ? identity.userId.trim() : '')
          if (ownerOpenId) job.ownerPlatformUserId = ownerOpenId
          const allowedOpenIds = [...new Set([
            ...job.input.allowedOpenIds,
            ...(ownerOpenId ? [ownerOpenId] : []),
          ])]
          await this.patchAndPersist(job, {
            status: 'configuring',
            statusMessage: '应用已创建，正在保存凭据并配置权限、事件与发布版本',
          })
          const botInput = {
            name: job.name,
            appSecret,
            platform: brand ?? identity.brand ?? 'feishu',
            tenantId: identity.tenantId,
            tenantName: identity.tenantName,
            enabled: false,
            allowAllUsers: job.input.allowAllUsers,
            allowedOpenIds,
            allowedChatIds: job.input.availability?.mode === 'groups' ? job.input.availability.groupIds : [],
            groupMentionMode: job.input.groupMentionMode,
          }
          const existing = await this.deps.findBotByAppId?.(appId)
          job.bot = existing
            ? await this.deps.updateBot(existing.id, botInput)
            : await this.deps.createBot({ ...botInput, appId })
          job.botId = job.bot.id
          job.checks.credentialsSaved = true
          job.checks.accountVerified = true
          await this.persist(job)
        },
      })
      if (job.status === 'cancelled') return
      if (!created.ok) {
        if (created.appId && !job.appId) job.appId = created.appId
        const status: FeishuQrSetupStatus = created.reason === 'qr_expired' ? 'expired'
          : created.reason === 'aborted' ? 'cancelled' : 'failed'
        await this.patchAndPersist(job, {
          status,
          statusMessage: status === 'expired' ? '二维码已过期，请重新发起' : '扫码创建失败',
          error: created.message,
          qrDataUrl: null,
          qrExpiresAtIso: null,
          canCancel: false,
          canConfirmIdentity: false,
          canRetry: Boolean(job.appId && job.bot),
        })
        return
      }
      if (!job.bot || job.appId !== created.appId) throw new Error('应用凭据未能持久化到 CodyWebUI')
      job.registrationMethod = created.registrationMethod
        ?? (created.sessionSource === 'official_device_flow' ? 'official_device_flow' : 'web_console')
      job.account = this.accountDto(created.sessionIdentity)
      job.ownerPlatformUserId = created.sessionIdentity.openId ?? created.sessionIdentity.userId
      await this.configure(job)
    } catch (error) {
      if (job.status === 'cancelled') return
      await this.patchAndPersist(job, {
        status: 'failed',
        statusMessage: '扫码创建失败',
        error: safeErrorMessage(error),
        qrDataUrl: null,
        qrExpiresAtIso: null,
        canRetry: Boolean(job.appId && job.bot),
        canCancel: false,
        canConfirmIdentity: false,
      })
    }
  }

  private async runAdoption(job: MutableJob): Promise<void> {
    if (!job.appId) return
    try {
      const adopted = await this.adoptApp({ appId: job.appId, signal: job.controller.signal })
      if (!adopted.ok) throw new Error(adopted.message)
      job.account = this.accountDto(adopted.identity)
      job.ownerPlatformUserId = adopted.identity.userId
      const existing = await this.deps.findBotByAppId?.(adopted.appId)
      job.bot = existing
        ? await this.deps.updateBot(existing.id, {
            name: job.name,
            appSecret: adopted.appSecret,
            platform: 'feishu',
            tenantId: adopted.identity.tenantId,
            tenantName: adopted.identity.tenantName,
            enabled: false,
            allowAllUsers: job.input.allowAllUsers,
            allowedOpenIds: job.input.allowedOpenIds,
            allowedChatIds: job.input.availability?.mode === 'groups' ? job.input.availability.groupIds : [],
            groupMentionMode: job.input.groupMentionMode,
          })
        : await this.deps.createBot({
            name: job.name,
            appId: adopted.appId,
            appSecret: adopted.appSecret,
            platform: 'feishu',
            tenantId: adopted.identity.tenantId,
            tenantName: adopted.identity.tenantName,
            enabled: false,
            allowAllUsers: job.input.allowAllUsers,
            allowedOpenIds: job.input.allowedOpenIds,
            allowedChatIds: job.input.availability?.mode === 'groups' ? job.input.availability.groupIds : [],
            groupMentionMode: job.input.groupMentionMode,
          })
      job.botId = job.bot.id
      job.checks.credentialsSaved = true
      job.checks.accountVerified = true
      await this.patchAndPersist(job, {
        status: 'configuring',
        statusMessage: '已有应用凭据已保存，正在校验权限、事件与发布版本',
        account: job.account,
        bot: job.bot,
      })
      await this.configure(job)
    } catch (error) {
      await this.patchAndPersist(job, {
        status: 'failed',
        statusMessage: '接管已有飞书应用失败',
        error: safeErrorMessage(error),
        canRetry: Boolean(job.bot && job.appId),
        canCancel: false,
        canConfirmIdentity: false,
      })
    }
  }

  private async configure(job: MutableJob): Promise<void> {
    if (!job.appId || !job.bot) return
    try {
      Object.assign(job.checks, {
        accountVerified: false,
        botAbilityVerified: false,
        scopesVerified: false,
        messageEventVerified: false,
        cardCallbackVerified: false,
        eventLongConnectionVerified: false,
        callbackLongConnectionVerified: false,
        versionPublishedVerified: false,
        visibilityVerified: false,
        appEnabledVerified: false,
        sdkConnectionVerified: false,
        botIdentityVerified: false,
        liveProbeVerified: false,
      } satisfies Partial<FeishuSetupChecks>)
      await this.persist(job)
      if (job.registrationMethod === 'official_device_flow') {
        if (!this.deps.configureOfficialApp) throw new Error('官方扫码应用缺少公开 OpenAPI 配置器')
        if (!this.deps.refreshOfficialIdentity) throw new Error('官方扫码应用缺少企业身份回读器')
        const ownerOpenId = job.ownerPlatformUserId?.trim() ?? ''
        if (!ownerOpenId) throw new Error('缺少扫码创建者 Open ID，不能重新验证企业身份')
        // The tenant identity API itself requires tenant:tenant:readonly. New
        // official registrations declare it up front, but persisted jobs from
        // an older build may not have it. Run the idempotent configuration pass
        // first so retry repairs the existing app instead of asking for another
        // scan or creating a duplicate application.
        const configured = await this.deps.configureOfficialApp({
          botId: job.bot.id,
          signal: job.controller.signal,
          visibility: this.officialVisibility(job),
        })
        if (!configured.ok) throw new Error(configured.message)
        Object.assign(job.checks, {
          botAbilityVerified: configured.botAbilityReady,
          scopesVerified: configured.scopeReady,
          messageEventVerified: configured.eventSubscriptionReady,
          cardCallbackVerified: configured.callbackSubscriptionReady,
          eventLongConnectionVerified: configured.eventModeReady,
          callbackLongConnectionVerified: configured.callbackModeReady,
          versionPublishedVerified: configured.onlineVersionReady,
          visibilityVerified: configured.visibilityReady,
          appEnabledVerified: configured.appEnabledReady,
          botIdentityVerified: Boolean(configured.botOpenId),
        } satisfies Partial<FeishuSetupChecks>)
        await this.persist(job)
        const identity = await this.deps.refreshOfficialIdentity({ botId: job.bot.id, ownerOpenId })
        if (job.account?.tenantName && job.account.tenantName !== '企业信息待重新验证'
          && job.bot.tenantId && job.bot.tenantId !== identity.tenantId) {
          throw new Error(`企业身份回读发生变化（${job.account.tenantName} → ${identity.tenantName}），机器人保持禁用`)
        }
        job.account = this.accountDto(identity)
        job.ownerPlatformUserId = identity.openId ?? identity.userId
        job.checks.accountVerified = true
        await this.persist(job)
      } else {
        const visibilityOverride = this.visibilityOverride(job)
        const configured = await this.automateSetup({
          appId: job.appId,
          brand: 'feishu',
          signal: job.controller.signal,
          disableQrLogin: true,
          disableBytedcliFallback: true,
          ...(visibilityOverride ? { visibilityOverride } : {}),
        })
        if (!configured.ok) throw new Error(configured.message)
        this.captureWarnings(job, configured)
        Object.assign(job.checks, {
          accountVerified: true,
          botAbilityVerified: true,
          scopesVerified: true,
          messageEventVerified: true,
          cardCallbackVerified: true,
          eventLongConnectionVerified: configured.eventModeReady,
          callbackLongConnectionVerified: true,
          versionPublishedVerified: Boolean(configured.versionId),
          visibilityVerified: true,
          appEnabledVerified: true,
        } satisfies Partial<FeishuSetupChecks>)
        if (this.deps.ensureOwnerAccess) {
          job.bot = await this.deps.ensureOwnerAccess(job.bot.id, job.account?.email ?? null)
        }
      }
      await this.patchAndPersist(job, { status: 'connecting', statusMessage: '开放平台配置完成，正在连接机器人' })
      job.bot = await this.deps.updateBot(job.bot.id, { enabled: true })
      if (!this.deps.verifyBotConnection) throw new Error('缺少机器人实时连接诊断器，不能证明创建完成')
      job.bot = await this.deps.verifyBotConnection(job.bot.id, job.controller.signal)
      job.checks.sdkConnectionVerified = true
      job.checks.botIdentityVerified = true
      job.checks.liveProbeVerified = true
      const missingChecks = REQUIRED_SETUP_CHECKS.filter((check) => !job.checks[check])
      if (missingChecks.length > 0) throw new Error(`创建证据不完整，机器人保持未完成: ${missingChecks.join(', ')}`)
      job.botId = job.bot.id
      await this.patchAndPersist(job, {
        status: 'completed',
        statusMessage: '机器人长连接与身份已验证，可以去飞书发消息了',
        bot: job.bot,
        error: null,
        canRetry: false,
        canCancel: false,
        canConfirmIdentity: false,
      })
    } catch (error) {
      if (job.controller.signal.aborted && ACTIVE_STATUSES.has(job.status)) return
      let rollbackError = ''
      if (job.bot?.enabled) {
        try {
          job.bot = await this.deps.updateBot(job.bot.id, { enabled: false })
          job.botId = job.bot.id
        } catch (disableError) {
          rollbackError = `；同时未能回滚本地启用状态: ${safeErrorMessage(disableError)}`
        }
      }
      await this.patchAndPersist(job, {
        status: 'failed',
        statusMessage: '应用已保存在 CodyWebUI，但自动配置未完成',
        error: `${safeErrorMessage(error)}${rollbackError}`,
        bot: job.bot,
        canRetry: true,
        canCancel: false,
        canConfirmIdentity: false,
      })
    }
  }

  private captureWarnings(job: MutableJob, result: Extract<OpenPlatformAutomationResult, { ok: true }>): void {
    const warnings = [result.scopeWarning, result.eventWarning].filter((value): value is string => Boolean(value))
    if (result.skippedScopeCount > 0) warnings.push(`${result.skippedScopeCount} 项权限在当前租户目录中不可用`)
    job.warnings = [...new Set(warnings)]
  }

  private accountDto(identity: FeishuWebSessionIdentity): FeishuQrSetupJobDto['account'] {
    return { userName: identity.userName, email: identity.email ?? null, tenantName: identity.tenantName }
  }

  private waitForIdentityConfirmation(job: MutableJob): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        job.controller.signal.removeEventListener('abort', onAbort)
        this.identityConfirmations.delete(job.id)
      }
      const onAbort = () => {
        cleanup()
        reject(new Error('用户取消扫码'))
      }
      this.identityConfirmations.set(job.id, () => {
        cleanup()
        resolve()
      })
      job.controller.signal.addEventListener('abort', onAbort, { once: true })
      if (job.controller.signal.aborted) onAbort()
    })
  }

  private normalizeAvailability(value: FeishuQrSetupInput['availability']): NonNullable<FeishuQrSetupInput['availability']> {
    const mode = value?.mode === 'members' || value?.mode === 'groups' || value?.mode === 'all' ? value.mode : 'creator'
    const clean = (items: string[] | undefined) => [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))]
    return { mode, memberIds: clean(value?.memberIds), groupIds: clean(value?.groupIds) }
  }

  private visibilityOverride(job: MutableJob): OpenPlatformOnlineVisibility | null {
    const availability = job.input.availability
    if (!availability) return null
    const owner = job.ownerPlatformUserId?.trim() ?? ''
    if (availability.mode !== 'all' && !owner) throw new Error('缺少扫码账号的平台成员 ID，无法安全设置应用可见范围')
    const visibleSuggest = availability.mode === 'all'
      ? { departments: [], members: [], groups: [], isAll: 1 }
      : {
          departments: [],
          members: [...new Set([owner, ...(availability.mode === 'members' ? availability.memberIds : [])])],
          groups: availability.mode === 'groups' ? availability.groupIds : [],
          isAll: 0,
        }
    return {
      visibleSuggest,
      blackVisibleSuggest: { departments: [], members: [], groups: [], isAll: 0 },
    }
  }

  private officialVisibility(job: MutableJob): { isVisibleToAll: boolean; userOpenIds: string[] } {
    const availability = job.input.availability
    const owner = job.ownerPlatformUserId?.trim() ?? ''
    if (availability?.mode === 'all') return { isVisibleToAll: true, userOpenIds: [] }
    if (!owner) throw new Error('缺少扫码创建者 Open ID，不能安全设置应用可见范围')
    // `groups` means Feishu conversation allowlist in CodyWebUI. Feishu app
    // availability accepts members/departments/user-groups, not chat IDs, so
    // the application itself remains creator-only and chat IDs are enforced by
    // the runtime authorization layer.
    const members = availability?.mode === 'members' ? availability.memberIds : []
    return { isVisibleToAll: false, userOpenIds: [...new Set([owner, ...members])] }
  }

  private patch(job: MutableJob, value: Partial<FeishuQrSetupJobDto>): void {
    Object.assign(job, value, { updatedAtIso: this.now().toISOString() })
  }

  private async patchAndPersist(job: MutableJob, value: Partial<FeishuQrSetupJobDto>): Promise<void> {
    this.patch(job, value)
    await this.persist(job)
  }

  private async persist(job: MutableJob): Promise<void> {
    await this.deps.savePersistedJob?.({
      id: job.id,
      name: job.name,
      status: job.status,
      statusMessage: job.statusMessage,
      account: job.account,
      warnings: job.warnings,
      error: job.error,
      canRetry: job.canRetry,
      canCancel: job.canCancel,
      canConfirmIdentity: job.canConfirmIdentity,
      input: job.input,
      appId: job.appId,
      botId: job.botId ?? job.bot?.id ?? null,
      ownerPlatformUserId: job.ownerPlatformUserId,
      registrationMethod: job.registrationMethod,
      checks: job.checks,
      createdAtIso: job.createdAtIso,
      updatedAtIso: job.updatedAtIso,
    })
  }

  private prune(): void {
    const cutoff = this.now().getTime() - 30 * 60_000
    for (const [id, job] of this.jobs) {
      if (ACTIVE_STATUSES.has(job.status)) continue
      if (Date.parse(job.updatedAtIso) < cutoff) this.jobs.delete(id)
    }
  }
}
