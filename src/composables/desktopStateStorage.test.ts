import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadAutoRefreshEnabled,
  loadDesktopTurnPreferences,
  loadProjectDisplayNames,
  loadProjectOrder,
  loadReadStateMap,
  loadSelectedThreadId,
  loadThreadScrollStateMap,
  normalizeDesktopTurnPreferences,
  normalizeThreadScrollState,
  saveAutoRefreshEnabled,
  saveDesktopTurnPreferences,
  saveProjectDisplayNames,
  saveProjectOrder,
  saveReadStateMap,
  saveSelectedThreadId,
  saveThreadScrollStateMap,
} from './desktopStateStorage'

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const TURN_PREFERENCES_STORAGE_KEY = 'codex-web-local.turn-preferences.v1'

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

function installStorage(): MemoryStorage {
  const storage = new MemoryStorage()
  vi.stubGlobal('window', {
    localStorage: storage,
  })
  return storage
}

describe('desktopStateStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns safe defaults without a browser window', () => {
    vi.stubGlobal('window', undefined)

    expect(loadReadStateMap()).toEqual({})
    expect(loadThreadScrollStateMap()).toEqual({})
    expect(loadSelectedThreadId()).toBe('')
    expect(loadProjectOrder()).toEqual([])
    expect(loadProjectDisplayNames()).toEqual({})
    expect(loadAutoRefreshEnabled()).toBe(false)
    expect(loadDesktopTurnPreferences()).toEqual({
      modelId: '',
      reasoningEffort: 'medium',
      collaborationModeName: 'default',
    })
  })

  it('round-trips read state, selected thread, project names, and auto-refresh preference', () => {
    installStorage()

    saveReadStateMap({ 'thread-1': '2026-07-07T00:00:00.000Z' })
    saveSelectedThreadId('thread-1')
    saveProjectDisplayNames({ '/repo': 'Repo' })
    saveAutoRefreshEnabled(true)

    expect(loadReadStateMap()).toEqual({ 'thread-1': '2026-07-07T00:00:00.000Z' })
    expect(loadSelectedThreadId()).toBe('thread-1')
    expect(loadProjectDisplayNames()).toEqual({ '/repo': 'Repo' })
    expect(loadAutoRefreshEnabled()).toBe(true)

    saveSelectedThreadId('')
    expect(loadSelectedThreadId()).toBe('')
  })

  it('normalizes and stores turn preferences', () => {
    const storage = installStorage()

    expect(normalizeDesktopTurnPreferences({
      modelId: ' gpt-5.5 ',
      reasoningEffort: 'high',
      collaborationModeName: ' plan ',
    })).toEqual({
      modelId: 'gpt-5.5',
      reasoningEffort: 'high',
      collaborationModeName: 'plan',
    })

    expect(normalizeDesktopTurnPreferences({
      modelId: 42,
      reasoningEffort: 'invalid',
      collaborationModeName: '',
    })).toEqual({
      modelId: '',
      reasoningEffort: 'medium',
      collaborationModeName: 'default',
    })

    saveDesktopTurnPreferences({
      modelId: 'gpt-5.5',
      reasoningEffort: 'xhigh',
      collaborationModeName: 'plan',
    })
    expect(loadDesktopTurnPreferences()).toEqual({
      modelId: 'gpt-5.5',
      reasoningEffort: 'xhigh',
      collaborationModeName: 'plan',
    })

    storage.setItem(TURN_PREFERENCES_STORAGE_KEY, '{bad json')
    expect(loadDesktopTurnPreferences()).toEqual({
      modelId: '',
      reasoningEffort: 'medium',
      collaborationModeName: 'default',
    })
  })

  it('normalizes project order and ignores corrupt records', () => {
    const storage = installStorage()

    storage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(['repo', '', 'repo', 42, 'docs']))
    storage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, JSON.stringify({ repo: 'Repo', empty: '', bad: 42 }))

    expect(loadProjectOrder()).toEqual(['repo', 'docs'])
    expect(loadProjectDisplayNames()).toEqual({ repo: 'Repo', empty: '' })

    storage.setItem(PROJECT_ORDER_STORAGE_KEY, '{bad json')
    storage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, '{bad json')
    expect(loadProjectOrder()).toEqual([])
    expect(loadProjectDisplayNames()).toEqual({})
  })

  it('normalizes thread scroll state before reading it back', () => {
    const storage = installStorage()

    storage.setItem(
      SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        good: { scrollTop: -50, isAtBottom: false, scrollRatio: 2 },
        missingBottom: { scrollTop: 10 },
        badTop: { scrollTop: '10', isAtBottom: true },
      }),
    )

    expect(loadThreadScrollStateMap()).toEqual({
      good: { scrollTop: 0, isAtBottom: false, scrollRatio: 1 },
    })
    expect(normalizeThreadScrollState({ scrollTop: 10, isAtBottom: true, scrollRatio: -1 })).toEqual({
      scrollTop: 10,
      isAtBottom: true,
      scrollRatio: 0,
    })
  })

  it('saves scroll state and discards corrupt read state JSON', () => {
    const storage = installStorage()

    saveThreadScrollStateMap({ thread: { scrollTop: 10, isAtBottom: true } })
    expect(loadThreadScrollStateMap()).toEqual({ thread: { scrollTop: 10, isAtBottom: true } })

    saveProjectOrder(['a', 'b'])
    expect(loadProjectOrder()).toEqual(['a', 'b'])

    storage.setItem(READ_STATE_STORAGE_KEY, '{bad json')
    expect(loadReadStateMap()).toEqual({})
  })
})
