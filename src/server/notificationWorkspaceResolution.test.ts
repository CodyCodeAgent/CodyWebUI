import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveNotificationWorkspaceCwd } from './codexAppServerBridge'
import { syncCatalogThreads } from './catalogStore'

let tempDir = ''

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('notification workspace resolution', () => {
  it('prefers cwd carried by the notification', async () => {
    await expect(resolveNotificationWorkspaceCwd({ thread: { id: 'thread-a', cwd: '/repo/direct' } }, '/fallback'))
      .resolves.toBe('/repo/direct')
  })

  it('resolves a thread to its catalog workspace instead of the server process cwd', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cody-notification-workspace-'))
    process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
    await syncCatalogThreads([{
      id: 'thread-a', cwd: '/repo/life-csr', title: 'TBA Agent', preview: '',
      createdAtIso: '2026-07-12T00:00:00.000Z', updatedAtIso: '2026-07-12T00:00:00.000Z', sourceArchived: false,
    }])

    await expect(resolveNotificationWorkspaceCwd({ turn: { id: 'turn-a', threadId: 'thread-a' } }, '/repo/cody-web-ui'))
      .resolves.toBe('/repo/life-csr')
  })

  it('uses the process workspace only when notification and catalog have no mapping', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cody-notification-workspace-'))
    process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
    await expect(resolveNotificationWorkspaceCwd({ threadId: 'unknown' }, '/repo/fallback')).resolves.toBe('/repo/fallback')
  })
})
