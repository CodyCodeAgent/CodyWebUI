import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRollbackAuditMessage, useDesktopState } from './useDesktopState'
import { buildThreadActivityEntries } from './useThreadActivity'
import type { UiMessage, UiToolingRollbackFileResult } from '../types/codex'
import type { RpcNotification } from '../api/codexRealtimeClient'

const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'

const codexApiMock = vi.hoisted(() => {
  let notificationListener: ((value: RpcNotification) => void) | null = null

  return {
    getNotificationListener: () => notificationListener,
    archiveThread: vi.fn(),
    compactThread: vi.fn(),
    forkThread: vi.fn(),
    getAccountRateLimits: vi.fn(async () => null),
    getAvailableModelIds: vi.fn(async () => []),
    getCollaborationModes: vi.fn(async () => []),
    getCurrentModelConfig: vi.fn(async () => ({ model: '', reasoningEffort: '' })),
    fetchPendingServerRequests: vi.fn(async () => []),
    getThreadGroups: vi.fn(async () => []),
    getThreadMessages: vi.fn(async (_threadId?: string): Promise<UiMessage[]> => []),
    interruptThreadTurn: vi.fn(),
    normalizeRateLimitSnapshot: vi.fn(() => null),
    renameThread: vi.fn(),
    respondServerRequest: vi.fn(),
    resumeThread: vi.fn(),
    startThread: vi.fn(),
    startThreadTurn: vi.fn(),
    steerThreadTurn: vi.fn(),
    subscribeRpcNotifications: vi.fn((listener: (value: RpcNotification) => void) => {
      notificationListener = listener
      return vi.fn(() => {
        notificationListener = null
      })
    }),
    unarchiveThread: vi.fn(),
  }
})

vi.mock('../api/codexBridgeClient', () => ({
  fetchPendingServerRequests: codexApiMock.fetchPendingServerRequests,
  respondServerRequest: codexApiMock.respondServerRequest,
}))
vi.mock('../api/codexModelClient', () => ({
  getAvailableModelIds: codexApiMock.getAvailableModelIds,
  getCollaborationModes: codexApiMock.getCollaborationModes,
  getCurrentModelConfig: codexApiMock.getCurrentModelConfig,
}))
vi.mock('../api/codexRateLimitClient', () => ({
  getAccountRateLimits: codexApiMock.getAccountRateLimits,
  normalizeRateLimitSnapshot: codexApiMock.normalizeRateLimitSnapshot,
}))
vi.mock('../api/codexRealtimeClient', () => ({
  subscribeRpcNotifications: codexApiMock.subscribeRpcNotifications,
}))
vi.mock('../api/codexThreadClient', () => ({
  archiveThread: codexApiMock.archiveThread,
  compactThread: codexApiMock.compactThread,
  forkThread: codexApiMock.forkThread,
  getThreadGroups: codexApiMock.getThreadGroups,
  getThreadMessages: codexApiMock.getThreadMessages,
  interruptThreadTurn: codexApiMock.interruptThreadTurn,
  renameThread: codexApiMock.renameThread,
  resumeThread: codexApiMock.resumeThread,
  startThread: codexApiMock.startThread,
  startThreadTurn: codexApiMock.startThreadTurn,
  steerThreadTurn: codexApiMock.steerThreadTurn,
  unarchiveThread: codexApiMock.unarchiveThread,
}))

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function installBrowserGlobals(selectedThreadId = ''): void {
  const storage = new MemoryStorage()
  if (selectedThreadId) {
    storage.setItem(SELECTED_THREAD_STORAGE_KEY, selectedThreadId)
  }

  vi.stubGlobal('window', {
    localStorage: storage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  })
}

function buildRollbackResult(overrides: Partial<UiToolingRollbackFileResult> = {}): UiToolingRollbackFileResult {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    filePath: 'src/app.ts',
    relativePath: 'src/app.ts',
    rollbackApplied: true,
    remainingStatus: '',
    checkpoint: {
      id: 'checkpoint-1',
      label: 'Before rollback',
      cwd: '/workspace/app',
      repoRoot: '/workspace/app',
      createdAtIso: '2026-07-05T00:00:00.000Z',
      paths: ['src/app.ts'],
      patchPath: '/workspace/app/.git/codex-web-checkpoints/checkpoint-1/workspace.patch',
      patchBytes: 128,
      hasPatch: true,
    },
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('useDesktopState realtime messages', () => {
  it('renders live assistant deltas before the turn completes', () => {
    installBrowserGlobals('thread-live')
    const state = useDesktopState()

    state.startRealtimeSync()
    const listener = codexApiMock.getNotificationListener()
    expect(listener).not.toBeNull()

    listener?.({
      method: 'turn/started',
      params: {
        threadId: 'thread-live',
        turn: {
          id: 'turn-live',
          startedAt: '2026-07-07T00:00:00.000Z',
        },
      },
      atIso: '2026-07-07T00:00:00.000Z',
    })
    listener?.({
      method: 'item/started',
      params: {
        threadId: 'thread-live',
        turnId: 'turn-live',
        item: {
          id: 'msg-live',
          type: 'agentMessage',
        },
      },
      atIso: '2026-07-07T00:00:01.000Z',
    })
    listener?.({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-live',
        turnId: 'turn-live',
        itemId: 'msg-live',
        delta: '实时',
      },
      atIso: '2026-07-07T00:00:02.000Z',
    })

    expect(state.messages.value).toEqual([
      {
        id: 'msg-live',
        role: 'assistant',
        text: '实时',
        messageType: 'agentMessage.live',
      },
    ])
    expect(state.selectedLiveOverlay.value?.activityLabel).toBe('Writing response')

    listener?.({
      method: 'item/agentMessage/delta',
      params: {
        thread_id: 'thread-live',
        turn_id: 'turn-live',
        item_id: 'msg-live',
        delta: '输出',
      },
      atIso: '2026-07-07T00:00:03.000Z',
    })

    expect(state.messages.value[0]?.text).toBe('实时输出')

    state.stopRealtimeSync()
  })

  it('keeps message loading scoped to the selected thread', async () => {
    installBrowserGlobals('thread-a')
    const threadALoad = deferred<UiMessage[]>()
    const threadBLoad = deferred<UiMessage[]>()
    codexApiMock.getThreadMessages.mockImplementation(async (threadId?: string) => {
      if (threadId === 'thread-a') return threadALoad.promise
      if (threadId === 'thread-b') return threadBLoad.promise
      return []
    })

    const state = useDesktopState()

    const threadAPromise = state.selectThread('thread-a')
    await flushPromises()
    expect(state.isLoadingMessages.value).toBe(true)

    const threadBPromise = state.selectThread('thread-b')
    await flushPromises()
    expect(state.isLoadingMessages.value).toBe(true)

    threadBLoad.resolve([])
    await threadBPromise
    expect(state.selectedThreadId.value).toBe('thread-b')
    expect(state.isLoadingMessages.value).toBe(false)

    threadALoad.resolve([])
    await threadAPromise
    expect(state.selectedThreadId.value).toBe('thread-b')
    expect(state.isLoadingMessages.value).toBe(false)
  })

  it('ignores stale message loads that finish after a newer load for the same thread', async () => {
    installBrowserGlobals('thread-a')
    const firstLoad = deferred<UiMessage[]>()
    const secondLoad = deferred<UiMessage[]>()
    codexApiMock.getThreadMessages
      .mockImplementationOnce(async () => firstLoad.promise)
      .mockImplementationOnce(async () => secondLoad.promise)

    const state = useDesktopState()

    const firstPromise = state.selectThread('thread-a')
    await flushPromises()
    const secondPromise = state.selectThread('thread-a')
    await flushPromises()

    secondLoad.resolve([{ id: 'new', role: 'assistant', text: 'new response' }])
    await secondPromise
    expect(state.messages.value.map((message) => message.text)).toEqual(['new response'])

    firstLoad.resolve([{ id: 'old', role: 'assistant', text: 'old response' }])
    await firstPromise
    expect(state.messages.value.map((message) => message.text)).toEqual(['new response'])
  })

  it('returns new thread ids before the first turn finishes starting', async () => {
    installBrowserGlobals()
    const turnStart = deferred<string>()
    codexApiMock.startThread.mockResolvedValue('thread-new')
    codexApiMock.startThreadTurn.mockImplementation(async () => turnStart.promise)

    const state = useDesktopState()
    const createdThreadId = await state.sendMessageToNewThread({
      text: 'stream this response',
      images: [],
      skills: [],
    }, '/repo')

    expect(createdThreadId).toBe('thread-new')
    expect(state.selectedThreadId.value).toBe('thread-new')
    expect(state.selectedThread?.value?.inProgress).toBe(true)
    expect(state.isSendingMessage.value).toBe(false)
    expect(codexApiMock.startThreadTurn).toHaveBeenCalledWith(
      'thread-new',
      'stream this response',
      [],
      [],
      undefined,
      'medium',
      null,
    )
  })

  it('surfaces and clears new thread creation failures', async () => {
    installBrowserGlobals()
    codexApiMock.startThread.mockRejectedValue(new Error('start failed'))

    const state = useDesktopState()

    await expect(state.sendMessageToNewThread({
      text: 'create this thread',
      images: [],
      skills: [],
    }, '/repo')).rejects.toThrow('start failed')

    expect(state.error.value).toBe('start failed')

    state.clearError()

    expect(state.error.value).toBe('')
  })
})

describe('buildRollbackAuditMessage', () => {
  it('creates an auditable tool message for successful file rollbacks', () => {
    const message = buildRollbackAuditMessage(buildRollbackResult())

    expect(message).toMatchObject({
      id: 'tooling.rollback:checkpoint-1:src/app.ts',
      role: 'system',
      messageType: 'tool.rollback',
      tool: {
        kind: 'rollback',
        title: 'File rollback',
        status: 'completed',
        summary: 'Rolled back src/app.ts',
        outputLabel: 'Checkpoint patch',
      },
    })
    expect(message.tool?.details).toContain('checkpoint: checkpoint-1')
    expect(message.tool?.details).toContain('remaining status: clean')
    expect(buildThreadActivityEntries([message])[0]).toMatchObject({
      kind: 'rollback',
      messageId: message.id,
    })
  })

  it('records no-op rollback attempts without marking them as failures', () => {
    const message = buildRollbackAuditMessage(buildRollbackResult({ rollbackApplied: false }))

    expect(message.tool?.status).toBe('no changes')
    expect(message.tool?.summary).toBe('No local changes found for src/app.ts')
  })
})
