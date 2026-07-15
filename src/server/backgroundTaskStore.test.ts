import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readBackgroundTaskStatus, writeBackgroundTaskStatus } from './backgroundTaskStore'
import type { BackgroundTaskStatus } from './backgroundTaskRunner'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ''; delete process.env.CODY_WEB_UI_SETTINGS_DB })

describe('backgroundTaskStore', () => {
  it('persists the latest task summary in sqlite', async () => {
    root = await mkdtemp(join(tmpdir(), 'cody-task-store-'))
    process.env.CODY_WEB_UI_SETTINGS_DB = join(root, 'settings.sqlite3')
    const status = {
      name: 'catalog', state: 'paused', running: false, paused: true, pendingRerun: false, currentRunId: null,
      runCount: 4, successCount: 3, failureCount: 1, timedOutCount: 0, consecutiveFailures: 1,
      lastStartedAtIso: null, lastSuccessAtIso: null, lastFailureAtIso: null, lastDurationMs: 12,
      lastError: 'offline', nextRunAtIso: null, progress: null, health: 'degraded',
    } satisfies BackgroundTaskStatus
    await writeBackgroundTaskStatus(status)
    await expect(readBackgroundTaskStatus('catalog')).resolves.toMatchObject({ runCount: 4, paused: true, lastError: 'offline' })
  })
})
