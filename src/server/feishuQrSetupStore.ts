import { withLocalDatabase } from './localDatabase.js'

export type StoredFeishuQrSetupStatus =
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

export type FeishuSetupChecks = {
  credentialsSaved: boolean
  accountVerified: boolean
  botAbilityVerified: boolean
  scopesVerified: boolean
  messageEventVerified: boolean
  cardCallbackVerified: boolean
  eventLongConnectionVerified: boolean
  callbackLongConnectionVerified: boolean
  versionPublishedVerified: boolean
  visibilityVerified: boolean
  appEnabledVerified: boolean
  sdkConnectionVerified: boolean
  botIdentityVerified: boolean
  liveProbeVerified: boolean
}

export function emptyFeishuSetupChecks(): FeishuSetupChecks {
  return {
    credentialsSaved: false, accountVerified: false, botAbilityVerified: false, scopesVerified: false,
    messageEventVerified: false, cardCallbackVerified: false, eventLongConnectionVerified: false,
    callbackLongConnectionVerified: false, versionPublishedVerified: false, visibilityVerified: false,
    appEnabledVerified: false, sdkConnectionVerified: false, botIdentityVerified: false, liveProbeVerified: false,
  }
}

export type StoredFeishuQrSetupJob = {
  id: string
  name: string
  status: StoredFeishuQrSetupStatus
  statusMessage: string
  account: { userName: string; email: string | null; tenantName: string } | null
  warnings: string[]
  error: string | null
  canRetry: boolean
  canCancel: boolean
  canConfirmIdentity: boolean
  input: {
    name: string
    allowAllUsers: boolean
    allowedOpenIds: string[]
    groupMentionMode: 'always' | 'topic' | 'bound'
    p2pMode?: 'topic' | 'chat'
    availability?: {
      mode: 'creator' | 'members' | 'groups' | 'all'
      memberIds: string[]
      groupIds: string[]
    }
  }
  appId: string | null
  botId: string | null
  ownerPlatformUserId?: string | null
  registrationMethod?: 'official_device_flow' | 'web_console' | null
  checks: FeishuSetupChecks
  createdAtIso: string
  updatedAtIso: string
}

const STATUSES = new Set<StoredFeishuQrSetupStatus>([
  'starting', 'awaiting_scan', 'authorizing', 'confirming_identity', 'creating_app', 'configuring',
  'connecting', 'completed', 'failed', 'expired', 'cancelled',
])

function ensureTable(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feishu_qr_setup_jobs (
      job_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      status_message TEXT NOT NULL DEFAULT '',
      account_json TEXT NOT NULL DEFAULT 'null',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      can_retry INTEGER NOT NULL DEFAULT 0 CHECK (can_retry IN (0, 1)),
      can_cancel INTEGER NOT NULL DEFAULT 0 CHECK (can_cancel IN (0, 1)),
      can_confirm_identity INTEGER NOT NULL DEFAULT 0 CHECK (can_confirm_identity IN (0, 1)),
      input_json TEXT NOT NULL,
      app_id TEXT,
      bot_id TEXT,
      owner_platform_user_id TEXT,
      registration_method TEXT CHECK (registration_method IN ('official_device_flow', 'web_console')),
      checks_json TEXT NOT NULL DEFAULT '{}',
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feishu_qr_setup_jobs_updated_idx
      ON feishu_qr_setup_jobs(updated_at_iso DESC);
  `)
  const columns = db.prepare('PRAGMA table_info(feishu_qr_setup_jobs)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'owner_platform_user_id')) {
    db.exec('ALTER TABLE feishu_qr_setup_jobs ADD COLUMN owner_platform_user_id TEXT')
  }
  if (!columns.some((column) => column.name === 'can_confirm_identity')) {
    db.exec('ALTER TABLE feishu_qr_setup_jobs ADD COLUMN can_confirm_identity INTEGER NOT NULL DEFAULT 0 CHECK (can_confirm_identity IN (0, 1))')
  }
  if (!columns.some((column) => column.name === 'registration_method')) {
    db.exec("ALTER TABLE feishu_qr_setup_jobs ADD COLUMN registration_method TEXT CHECK (registration_method IN ('official_device_flow', 'web_console'))")
  }
  if (!columns.some((column) => column.name === 'checks_json')) {
    db.exec("ALTER TABLE feishu_qr_setup_jobs ADD COLUMN checks_json TEXT NOT NULL DEFAULT '{}'")
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null
  try { return JSON.parse(value) as unknown } catch { return null }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : []
}

function account(value: unknown): StoredFeishuQrSetupJob['account'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.userName !== 'string' || typeof row.tenantName !== 'string') return null
  return {
    userName: row.userName,
    email: typeof row.email === 'string' && row.email ? row.email : null,
    tenantName: row.tenantName,
  }
}

function checks(value: unknown): FeishuSetupChecks {
  const defaults = emptyFeishuSetupChecks()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const row = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, row[key] === true])) as FeishuSetupChecks
}

function normalize(row: Record<string, unknown>): StoredFeishuQrSetupJob | null {
  const status = row.status
  const parsedInput = parseJson(row.inputJson)
  if (typeof row.id !== 'string' || typeof row.name !== 'string'
    || typeof status !== 'string' || !STATUSES.has(status as StoredFeishuQrSetupStatus)
    || !parsedInput || typeof parsedInput !== 'object' || Array.isArray(parsedInput)) return null
  const input = parsedInput as Record<string, unknown>
  const groupMentionMode = input.groupMentionMode === 'topic' || input.groupMentionMode === 'bound'
    ? input.groupMentionMode
    : 'always'
  const p2pMode = input.p2pMode === 'chat' ? 'chat' : 'topic'
  const rawAvailability = input.availability && typeof input.availability === 'object' && !Array.isArray(input.availability)
    ? input.availability as Record<string, unknown>
    : null
  const availabilityMode = rawAvailability?.mode === 'members' || rawAvailability?.mode === 'groups' || rawAvailability?.mode === 'all'
    ? rawAvailability.mode
    : 'creator'
  return {
    id: row.id,
    name: row.name,
    status: status as StoredFeishuQrSetupStatus,
    statusMessage: typeof row.statusMessage === 'string' ? row.statusMessage : '',
    account: account(parseJson(row.accountJson)),
    warnings: strings(parseJson(row.warningsJson)),
    error: typeof row.error === 'string' && row.error ? row.error : null,
    canRetry: row.canRetry === 1,
    canCancel: row.canCancel === 1,
    canConfirmIdentity: row.canConfirmIdentity === 1,
    input: {
      name: typeof input.name === 'string' ? input.name : row.name,
      allowAllUsers: input.allowAllUsers === true,
      allowedOpenIds: strings(input.allowedOpenIds),
      groupMentionMode,
      p2pMode,
      availability: {
        mode: availabilityMode,
        memberIds: strings(rawAvailability?.memberIds),
        groupIds: strings(rawAvailability?.groupIds),
      },
    },
    appId: typeof row.appId === 'string' && row.appId ? row.appId : null,
    botId: typeof row.botId === 'string' && row.botId ? row.botId : null,
    ownerPlatformUserId: typeof row.ownerPlatformUserId === 'string' && row.ownerPlatformUserId ? row.ownerPlatformUserId : null,
    ...(row.registrationMethod === 'official_device_flow' || row.registrationMethod === 'web_console'
      ? { registrationMethod: row.registrationMethod }
      : {}),
    checks: checks(parseJson(row.checksJson)),
    createdAtIso: typeof row.createdAtIso === 'string' ? row.createdAtIso : '',
    updatedAtIso: typeof row.updatedAtIso === 'string' ? row.updatedAtIso : '',
  }
}

const SELECT = `
  SELECT job_id AS id, name, status, status_message AS statusMessage,
    account_json AS accountJson, warnings_json AS warningsJson, error,
    can_retry AS canRetry, can_cancel AS canCancel, can_confirm_identity AS canConfirmIdentity, input_json AS inputJson,
    app_id AS appId, bot_id AS botId, owner_platform_user_id AS ownerPlatformUserId,
    registration_method AS registrationMethod, checks_json AS checksJson,
    created_at_iso AS createdAtIso,
    updated_at_iso AS updatedAtIso
  FROM feishu_qr_setup_jobs
`

export async function upsertFeishuQrSetupJob(job: StoredFeishuQrSetupJob): Promise<void> {
  await withLocalDatabase((db) => {
    ensureTable(db)
    db.prepare(`
      INSERT INTO feishu_qr_setup_jobs
        (job_id, name, status, status_message, account_json, warnings_json, error,
         can_retry, can_cancel, can_confirm_identity, input_json, app_id, bot_id, owner_platform_user_id, registration_method, checks_json, created_at_iso, updated_at_iso)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        name = excluded.name, status = excluded.status,
        status_message = excluded.status_message, account_json = excluded.account_json,
        warnings_json = excluded.warnings_json, error = excluded.error,
        can_retry = excluded.can_retry, can_cancel = excluded.can_cancel,
        can_confirm_identity = excluded.can_confirm_identity,
        input_json = excluded.input_json, app_id = excluded.app_id,
        bot_id = excluded.bot_id, owner_platform_user_id = excluded.owner_platform_user_id,
        registration_method = excluded.registration_method,
        checks_json = excluded.checks_json,
        updated_at_iso = excluded.updated_at_iso
    `).run(
      job.id, job.name, job.status, job.statusMessage, JSON.stringify(job.account),
      JSON.stringify(job.warnings), job.error, job.canRetry ? 1 : 0,
      job.canCancel ? 1 : 0, job.canConfirmIdentity ? 1 : 0, JSON.stringify(job.input), job.appId, job.botId, job.ownerPlatformUserId,
      job.registrationMethod ?? null,
      JSON.stringify(job.checks),
      job.createdAtIso, job.updatedAtIso,
    )
  })
}

export async function listFeishuQrSetupJobs(limit = 20): Promise<StoredFeishuQrSetupJob[]> {
  return withLocalDatabase((db) => {
    ensureTable(db)
    const rows = db.prepare(`${SELECT} ORDER BY updated_at_iso DESC LIMIT ?`).all(Math.max(1, Math.min(limit, 100))) as Record<string, unknown>[]
    return rows.map(normalize).filter((job): job is StoredFeishuQrSetupJob => job !== null)
  })
}

export async function deleteExpiredFeishuQrSetupJobs(beforeIso: string): Promise<number> {
  return withLocalDatabase((db) => {
    ensureTable(db)
    return db.prepare(`
      DELETE FROM feishu_qr_setup_jobs
      WHERE updated_at_iso < ? AND status IN ('completed', 'failed', 'expired', 'cancelled')
    `).run(beforeIso).changes
  })
}
