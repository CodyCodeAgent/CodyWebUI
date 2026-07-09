import { isReasoningEffort } from './desktopTurnPreferences'
import type { ReasoningEffort, ThreadScrollState } from '../types/codex'

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1'
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const AUTO_REFRESH_ENABLED_STORAGE_KEY = 'codex-web-local.auto-refresh-enabled.v1'
const TURN_PREFERENCES_STORAGE_KEY = 'codex-web-local.turn-preferences.v1'

export type DesktopTurnPreferences = {
  modelId: string
  reasoningEffort: ReasoningEffort | ''
  collaborationModeName: string
}

export const DEFAULT_DESKTOP_TURN_PREFERENCES: DesktopTurnPreferences = {
  modelId: '',
  reasoningEffort: 'medium',
  collaborationModeName: 'default',
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function readJsonStorage(key: string): unknown {
  const storage = getLocalStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  const storage = getLocalStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(value))
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const normalized: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 0 && typeof rawValue === 'string') {
      normalized[key] = rawValue
    }
  }
  return normalized
}

export function normalizeDesktopTurnPreferences(value: unknown): DesktopTurnPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_DESKTOP_TURN_PREFERENCES
  }

  const row = value as Record<string, unknown>
  const modelId = typeof row.modelId === 'string' ? row.modelId.trim() : ''
  const rawReasoningEffort = typeof row.reasoningEffort === 'string' ? row.reasoningEffort.trim() : ''
  const reasoningEffort = rawReasoningEffort && isReasoningEffort(rawReasoningEffort)
    ? rawReasoningEffort
    : DEFAULT_DESKTOP_TURN_PREFERENCES.reasoningEffort
  const collaborationModeName = typeof row.collaborationModeName === 'string' && row.collaborationModeName.trim()
    ? row.collaborationModeName.trim()
    : DEFAULT_DESKTOP_TURN_PREFERENCES.collaborationModeName

  return {
    modelId,
    reasoningEffort,
    collaborationModeName,
  }
}

export function normalizeThreadScrollState(value: unknown): ThreadScrollState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const rawState = value as Record<string, unknown>
  if (typeof rawState.scrollTop !== 'number' || !Number.isFinite(rawState.scrollTop)) return null
  if (typeof rawState.isAtBottom !== 'boolean') return null

  const normalized: ThreadScrollState = {
    scrollTop: Math.max(0, rawState.scrollTop),
    isAtBottom: rawState.isAtBottom,
  }

  if (typeof rawState.scrollRatio === 'number' && Number.isFinite(rawState.scrollRatio)) {
    normalized.scrollRatio = clamp(rawState.scrollRatio, 0, 1)
  }

  return normalized
}

export function loadReadStateMap(): Record<string, string> {
  return normalizeStringRecord(readJsonStorage(READ_STATE_STORAGE_KEY))
}

export function saveReadStateMap(state: Record<string, string>): void {
  writeJsonStorage(READ_STATE_STORAGE_KEY, state)
}

export function loadAutoRefreshEnabled(): boolean {
  const storage = getLocalStorage()
  return storage?.getItem(AUTO_REFRESH_ENABLED_STORAGE_KEY) === '1'
}

export function saveAutoRefreshEnabled(value: boolean): void {
  const storage = getLocalStorage()
  if (!storage) return
  storage.setItem(AUTO_REFRESH_ENABLED_STORAGE_KEY, value ? '1' : '0')
}

export function loadDesktopTurnPreferences(): DesktopTurnPreferences {
  return normalizeDesktopTurnPreferences(readJsonStorage(TURN_PREFERENCES_STORAGE_KEY))
}

export function saveDesktopTurnPreferences(preferences: DesktopTurnPreferences): void {
  writeJsonStorage(TURN_PREFERENCES_STORAGE_KEY, normalizeDesktopTurnPreferences(preferences))
}

export function loadThreadScrollStateMap(): Record<string, ThreadScrollState> {
  const parsed = readJsonStorage(SCROLL_STATE_STORAGE_KEY)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const normalizedMap: Record<string, ThreadScrollState> = {}
  for (const [threadId, state] of Object.entries(parsed as Record<string, unknown>)) {
    if (!threadId) continue
    const normalizedState = normalizeThreadScrollState(state)
    if (normalizedState) {
      normalizedMap[threadId] = normalizedState
    }
  }
  return normalizedMap
}

export function saveThreadScrollStateMap(state: Record<string, ThreadScrollState>): void {
  writeJsonStorage(SCROLL_STATE_STORAGE_KEY, state)
}

export function loadSelectedThreadId(): string {
  const storage = getLocalStorage()
  return storage?.getItem(SELECTED_THREAD_STORAGE_KEY) ?? ''
}

export function saveSelectedThreadId(threadId: string): void {
  const storage = getLocalStorage()
  if (!storage) return
  if (!threadId) {
    storage.removeItem(SELECTED_THREAD_STORAGE_KEY)
    return
  }
  storage.setItem(SELECTED_THREAD_STORAGE_KEY, threadId)
}

export function loadProjectOrder(): string[] {
  const parsed = readJsonStorage(PROJECT_ORDER_STORAGE_KEY)
  if (!Array.isArray(parsed)) return []

  const order: string[] = []
  for (const item of parsed) {
    if (typeof item === 'string' && item.length > 0 && !order.includes(item)) {
      order.push(item)
    }
  }
  return order
}

export function saveProjectOrder(order: string[]): void {
  writeJsonStorage(PROJECT_ORDER_STORAGE_KEY, order)
}

export function loadProjectDisplayNames(): Record<string, string> {
  return normalizeStringRecord(readJsonStorage(PROJECT_DISPLAY_NAME_STORAGE_KEY))
}

export function saveProjectDisplayNames(displayNames: Record<string, string>): void {
  writeJsonStorage(PROJECT_DISPLAY_NAME_STORAGE_KEY, displayNames)
}
