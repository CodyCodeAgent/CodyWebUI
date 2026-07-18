import { describe, expect, it, vi } from 'vitest'
import { FeishuCodexGateway } from './feishuCodexGateway'
import type { CatalogSnapshot } from './catalogStore'

const catalog: CatalogSnapshot = {
  projects: [{
    projectKey: '/repo', cwd: '/repo', displayName: 'Repository', sortOrder: null,
    hidden: false, hiddenAtIso: null,
    threads: [{
      id: 'thread-1', cwd: '/repo', title: 'Existing session', preview: 'Latest work',
      createdAtIso: '2026-07-17T00:00:00.000Z', updatedAtIso: '2026-07-18T00:00:00.000Z',
      sourceArchived: false, hidden: false, hiddenAtIso: null,
    }],
  }],
  visibility: 'visible', generatedAtIso: '2026-07-18T00:00:00.000Z', projectCount: 1, threadCount: 1,
}

describe('FeishuCodexGateway', () => {
  it('maps the Cody catalog to project and session options', async () => {
    const refreshCatalog = vi.fn(async () => undefined)
    const gateway = new FeishuCodexGateway({
      rpc: vi.fn(), respondToServerRequest: vi.fn(), readCatalog: vi.fn(async () => catalog), refreshCatalog,
    })
    await expect(gateway.listProjects()).resolves.toEqual([{ id: '/repo', name: 'Repository', cwd: '/repo', sessionCount: 1 }])
    await expect(gateway.listSessions('/repo')).resolves.toEqual([{
      id: 'thread-1', title: 'Existing session', preview: 'Latest work', updatedAtIso: '2026-07-18T00:00:00.000Z',
    }])
    expect(refreshCatalog).toHaveBeenCalledTimes(2)
  })

  it('starts a session and sends the first turn through app-server', async () => {
    const rpc = vi.fn(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-new' } }
      if (method === 'turn/start') return { turn: { id: 'turn-new' } }
      return {}
    })
    const gateway = new FeishuCodexGateway({ rpc, respondToServerRequest: vi.fn(), readCatalog: vi.fn(async () => catalog) })
    await expect(gateway.startSession('/repo')).resolves.toMatchObject({ id: 'thread-new', cwd: '/repo' })
    await expect(gateway.startTurn('thread-new', 'Ship it', ['/private/one.png', '  ', '/private/two.jpg'])).resolves.toEqual({ threadId: 'thread-new', turnId: 'turn-new' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'thread/resume', { threadId: 'thread-new' })
    expect(rpc).toHaveBeenNthCalledWith(3, 'turn/start', {
      threadId: 'thread-new', input: [
        { type: 'text', text: 'Ship it', text_elements: [] },
        { type: 'localImage', path: '/private/one.png' },
        { type: 'localImage', path: '/private/two.jpg' },
      ],
    })
  })

  it('resolves approvals through the existing server-request channel', async () => {
    const respondToServerRequest = vi.fn(async () => undefined)
    const gateway = new FeishuCodexGateway({ rpc: vi.fn(), respondToServerRequest, readCatalog: vi.fn(async () => catalog) })
    await gateway.resolveApproval(42, 'acceptForSession')
    expect(respondToServerRequest).toHaveBeenCalledWith({
      id: 42, approvalScope: 'session', result: { decision: 'acceptForSession' },
    })
  })

  it('maps user-input answers to the app-server response schema', async () => {
    const respondToServerRequest = vi.fn(async () => undefined)
    const gateway = new FeishuCodexGateway({ rpc: vi.fn(), respondToServerRequest, readCatalog: vi.fn(async () => catalog) })
    await gateway.resolveUserInput(7, { strategy: ['Safe'], note: ['Keep tests'] })
    expect(respondToServerRequest).toHaveBeenCalledWith({
      id: 7,
      result: { answers: { strategy: { answers: ['Safe'] }, note: { answers: ['Keep tests'] } } },
    })
  })

  it('renames and archives sessions through app-server', async () => {
    const rpc = vi.fn(async () => ({}))
    const gateway = new FeishuCodexGateway({ rpc, respondToServerRequest: vi.fn(), readCatalog: vi.fn(async () => catalog) })
    await gateway.renameSession(' thread-1 ', ' Shared session ')
    await gateway.archiveSession(' thread-1 ')
    expect(rpc).toHaveBeenNthCalledWith(1, 'thread/name/set', { threadId: 'thread-1', name: 'Shared session' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'thread/archive', { threadId: 'thread-1' })
  })

  it('finds the active turn so another CodyWebUI client can stop it', async () => {
    const rpc = vi.fn(async () => ({
      thread: { turns: [{ id: 'turn-done', status: 'completed' }, { id: 'turn-live', status: 'inProgress' }] },
    }))
    const gateway = new FeishuCodexGateway({ rpc, respondToServerRequest: vi.fn(), readCatalog: vi.fn(async () => catalog) })
    await expect(gateway.findActiveTurnId(' thread-1 ')).resolves.toBe('turn-live')
    expect(rpc).toHaveBeenCalledWith('thread/read', { threadId: 'thread-1', includeTurns: true })
  })
})
