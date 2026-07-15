import { afterEach, describe, expect, it, vi } from 'vitest'
import { controlBackgroundTask, fetchBackgroundTasks } from './codexBackgroundTaskClient'

const httpMock = vi.hoisted(() => ({ fetchCodexResultRecord: vi.fn() }))
vi.mock('./codexHttpClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./codexHttpClient')>(),
  fetchCodexResultRecord: httpMock.fetchCodexResultRecord,
}))

afterEach(() => vi.clearAllMocks())

describe('background task client', () => {
  it('normalizes task diagnostics and posts controls', async () => {
    httpMock.fetchCodexResultRecord.mockResolvedValue({
      result: { tasks: [{ name: 'catalog', state: 'running', running: true, runCount: 2, progress: { completed: 1, total: 3, message: 'sync' } }] },
      status: 200,
    })
    await expect(fetchBackgroundTasks()).resolves.toMatchObject([{ name: 'catalog', state: 'running', progress: { completed: 1, total: 3 } }])
    await controlBackgroundTask('catalog', 'pause')
    expect(httpMock.fetchCodexResultRecord).toHaveBeenLastCalledWith('/codex-api/background-tasks', expect.objectContaining({
      init: expect.objectContaining({ method: 'POST' }),
    }))
  })
})
