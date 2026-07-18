import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteExpiredFeishuQrSetupJobs,
  listFeishuQrSetupJobs,
  upsertFeishuQrSetupJob,
  emptyFeishuSetupChecks,
  type StoredFeishuQrSetupJob,
} from './feishuQrSetupStore'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cody-feishu-setup-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(directory, 'settings.sqlite3')
})

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await rm(directory, { recursive: true, force: true })
})

function job(status: StoredFeishuQrSetupJob['status'] = 'configuring'): StoredFeishuQrSetupJob {
  return {
    id: 'job-1', name: 'Cody', status, statusMessage: 'working',
    account: { userName: 'Alice', email: 'alice@example.com', tenantName: 'Example' },
    warnings: [], error: null, canRetry: false, canCancel: false, canConfirmIdentity: false,
    input: {
      name: 'Cody', allowAllUsers: false, allowedOpenIds: ['ou_a'], groupMentionMode: 'always',
      availability: { mode: 'creator', memberIds: [], groupIds: [] },
    },
    appId: 'cli_created', botId: 'bot-1',
    ownerPlatformUserId: null,
    checks: { ...emptyFeishuSetupChecks(), credentialsSaved: true, accountVerified: true },
    createdAtIso: '2026-07-18T00:00:00.000Z', updatedAtIso: '2026-07-18T00:01:00.000Z',
  }
}

describe('feishu QR setup persistence', () => {
  it('persists recovery state without QR payloads or application secrets', async () => {
    await upsertFeishuQrSetupJob(job())
    expect(await listFeishuQrSetupJobs()).toEqual([job()])

    const failed = { ...job('failed'), error: 'scope failed', canRetry: true, updatedAtIso: '2026-07-18T00:02:00.000Z' }
    await upsertFeishuQrSetupJob(failed)
    expect(await listFeishuQrSetupJobs()).toEqual([failed])
    expect(JSON.stringify(await listFeishuQrSetupJobs())).not.toContain('appSecret')
    expect(JSON.stringify(await listFeishuQrSetupJobs())).not.toContain('qrDataUrl')
  })

  it('persists an explicit pending identity confirmation gate', async () => {
    const confirming = { ...job('confirming_identity'), canCancel: true, canConfirmIdentity: true }
    await upsertFeishuQrSetupJob(confirming)
    await expect(listFeishuQrSetupJobs()).resolves.toEqual([confirming])
  })

  it('persists the official registration method so restart recovery never falls back to private console APIs', async () => {
    const official = { ...job(), registrationMethod: 'official_device_flow' as const, ownerPlatformUserId: 'ou_owner' }
    await upsertFeishuQrSetupJob(official)
    await expect(listFeishuQrSetupJobs()).resolves.toEqual([official])
  })

  it('removes only terminal jobs past retention', async () => {
    await upsertFeishuQrSetupJob({ ...job('completed'), id: 'old', updatedAtIso: '2026-07-01T00:00:00.000Z' })
    await upsertFeishuQrSetupJob({ ...job('configuring'), id: 'active', updatedAtIso: '2026-07-01T00:00:00.000Z' })
    await expect(deleteExpiredFeishuQrSetupJobs('2026-07-10T00:00:00.000Z')).resolves.toBe(1)
    expect((await listFeishuQrSetupJobs()).map((value) => value.id)).toEqual(['active'])
  })
})
