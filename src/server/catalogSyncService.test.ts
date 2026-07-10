import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCatalog } from './catalogStore'
import { CatalogSyncService } from './catalogSyncService'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-catalog-sync-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
})

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await rm(tempDir, { recursive: true, force: true })
})

describe('CatalogSyncService', () => {
  it('paginates active and archived Codex threads into the local catalog', async () => {
    const rpc = vi.fn(async (_method: string, params: unknown) => {
      const row = params as { archived?: boolean; cursor?: string }
      if (row.archived) {
        return {
          data: [{
            id: 'archived-1',
            cwd: '/repo',
            preview: 'Archived',
            createdAt: 10,
            updatedAt: 20,
          }],
          nextCursor: null,
        }
      }
      if (!row.cursor) {
        return {
          data: [{
            id: 'active-1',
            cwd: '/repo',
            preview: 'Active one',
            createdAt: 10,
            updatedAt: 30,
          }],
          nextCursor: 'page-2',
        }
      }
      return {
        data: [{
          id: 'active-2',
          cwd: '/repo/two',
          preview: 'Active two',
          createdAt: 15,
          updatedAt: 35,
        }],
        nextCursor: null,
      }
    })
    const service = new CatalogSyncService(rpc)

    await service.syncNow()

    expect(rpc).toHaveBeenCalledTimes(3)
    expect((await listCatalog('visible')).threadCount).toBe(2)
    expect((await listCatalog('hidden')).projects[0]?.threads[0]?.id).toBe('archived-1')
    expect(service.getStatus()).toMatchObject({ successCount: 1, failureCount: 0 })
    service.stop()
  })

  it('surfaces manual sync failures while retaining diagnostic status', async () => {
    const service = new CatalogSyncService(async () => {
      throw new Error('Codex unavailable')
    })

    await expect(service.syncNow()).rejects.toThrow('Codex unavailable')
    expect(service.getStatus()).toMatchObject({
      successCount: 0,
      failureCount: 1,
      lastError: 'Codex unavailable',
    })
    service.stop()
  })
})
