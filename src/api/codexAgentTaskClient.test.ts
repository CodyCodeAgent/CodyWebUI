import { afterEach, describe, expect, it, vi } from 'vitest'
import { controlAgentTask, createAgentTask, deleteAgentTask, fetchAgentTasks, type AgentTaskInput } from './codexAgentTaskClient'

const httpMock = vi.hoisted(() => ({ fetchCodexResultRecord: vi.fn() }))
vi.mock('./codexHttpClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./codexHttpClient')>(),
  fetchCodexResultRecord: httpMock.fetchCodexResultRecord,
}))

afterEach(() => vi.clearAllMocks())

const task = {
  id: 'task-1', name: 'Review', description: '', cwd: '/repo', prompt: 'Review it',
  schedule: { kind: 'daily', time: '09:00' }, timezone: 'UTC', model: '', effort: null,
  permission: 'read-only', enabled: true, timeoutMinutes: 45, maxRetries: 1,
  conversationMode: 'new', fixedThreadId: '',
  nextRunAtIso: '2026-07-17T09:00:00.000Z', lastRunAtIso: null, consecutiveFailures: 0,
  createdAtIso: '2026-07-16T00:00:00.000Z', updatedAtIso: '2026-07-16T00:00:00.000Z',
}

describe('Agent task client', () => {
  it('normalizes task definitions and run history', async () => {
    httpMock.fetchCodexResultRecord.mockResolvedValue({ result: { tasks: [task], runs: [{
      id: 'run-1', taskId: 'task-1', status: 'waiting_approval', trigger: 'schedule', scheduledAtIso: '2026-07-16T09:00:00.000Z',
      threadId: 'thread-1', turnId: 'turn-1', totalTokens: 42,
    }] }, status: 200 })
    await expect(fetchAgentTasks()).resolves.toMatchObject({
      tasks: [{ id: 'task-1', schedule: { kind: 'daily', time: '09:00' } }],
      runs: [{ id: 'run-1', status: 'waiting_approval', totalTokens: 42 }],
    })
    expect(httpMock.fetchCodexResultRecord).toHaveBeenLastCalledWith('/codex-api/agent-tasks?visibility=active', expect.anything())
  })

  it('posts create and control actions with the expected contract', async () => {
    httpMock.fetchCodexResultRecord.mockResolvedValueOnce({ result: { task }, status: 201 })
    const input = { ...task } as unknown as AgentTaskInput
    await createAgentTask(input)
    expect(httpMock.fetchCodexResultRecord).toHaveBeenLastCalledWith('/codex-api/agent-tasks', expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }))

    httpMock.fetchCodexResultRecord.mockResolvedValueOnce({ result: { run: {
      id: 'run-1', taskId: 'task-1', status: 'queued', trigger: 'manual', scheduledAtIso: '2026-07-16T09:00:00.000Z',
    } }, status: 202 })
    await expect(controlAgentTask('task-1', 'run')).resolves.toMatchObject({ status: 'queued', trigger: 'manual' })

    httpMock.fetchCodexResultRecord.mockResolvedValueOnce({ result: { deleted: true, permanent: true }, status: 200 })
    await deleteAgentTask('task-1', true)
    expect(httpMock.fetchCodexResultRecord).toHaveBeenLastCalledWith('/codex-api/agent-tasks/item?id=task-1&permanent=true', expect.objectContaining({ init: { method: 'DELETE' } }))
  })
})
