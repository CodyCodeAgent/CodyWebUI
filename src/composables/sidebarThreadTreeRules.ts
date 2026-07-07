import type { UiProjectGroup, UiThread } from '../types/codex'

export type SidebarThreadState = 'working' | 'unread' | 'idle'

export function normalizeSidebarSearchQuery(value: string): string {
  return value.trim().toLowerCase()
}

export function sidebarBasenameFromPath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) ?? value
}

export function threadMatchesSidebarSearch(thread: UiThread, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return (
    thread.title.toLowerCase().includes(normalizedQuery) ||
    thread.preview.toLowerCase().includes(normalizedQuery)
  )
}

export function filterSidebarGroupsBySearch(groups: UiProjectGroup[], normalizedQuery: string): UiProjectGroup[] {
  if (!normalizedQuery) return groups
  return groups
    .map((group) => ({
      ...group,
      threads: group.threads.filter((thread) => threadMatchesSidebarSearch(thread, normalizedQuery)),
    }))
    .filter((group) => group.threads.length > 0)
}

export function buildSidebarPinnedThreads(
  groups: UiProjectGroup[],
  pinnedThreadIds: string[],
  normalizedQuery: string,
): UiThread[] {
  const threadById = new Map<string, UiThread>()
  for (const group of groups) {
    for (const thread of group.threads) {
      threadById.set(thread.id, thread)
    }
  }

  return pinnedThreadIds
    .map((threadId) => threadById.get(threadId) ?? null)
    .filter((thread): thread is UiThread => thread !== null)
    .filter((thread) => threadMatchesSidebarSearch(thread, normalizedQuery))
}

export function formatSidebarRelativeTime(value: string, nowMs = Date.now()): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'n/a'

  const diffMs = Math.abs(nowMs - timestamp)
  if (diffMs < 60000) return 'now'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${String(minutes)}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h`

  const days = Math.floor(hours / 24)
  return `${String(days)}d`
}

export function sidebarProjectDisplayName(
  projectName: string,
  projectDisplayNameById: Record<string, string>,
): string {
  return projectDisplayNameById[projectName] ?? sidebarBasenameFromPath(projectName)
}

export function sidebarProjectPath(group: UiProjectGroup): string {
  return group.cwd || group.threads[0]?.cwd || group.projectName
}

export function sidebarProjectTitleText(
  group: UiProjectGroup,
  projectDisplayNameById: Record<string, string>,
): string {
  const displayName = sidebarProjectDisplayName(group.projectName, projectDisplayNameById)
  const path = sidebarProjectPath(group)
  return path ? `${displayName} (${path})` : displayName
}

export function sidebarProjectThreads(group: UiProjectGroup, pinnedThreadIds: string[]): UiThread[] {
  const pinned = new Set(pinnedThreadIds)
  return group.threads.filter((thread) => !pinned.has(thread.id))
}

export function visibleSidebarThreads(
  group: UiProjectGroup,
  options: {
    pinnedThreadIds: string[]
    isSearchActive: boolean
    isCollapsed: boolean
    isExpanded: boolean
    limit?: number
  },
): UiThread[] {
  const rows = sidebarProjectThreads(group, options.pinnedThreadIds)
  if (options.isSearchActive) return rows
  if (options.isCollapsed) return []
  return options.isExpanded ? rows : rows.slice(0, options.limit ?? 10)
}

export function hasSidebarHiddenThreads(
  group: UiProjectGroup,
  options: {
    pinnedThreadIds: string[]
    isSearchActive: boolean
    isCollapsed: boolean
    limit?: number
  },
): boolean {
  if (options.isSearchActive) return false
  return !options.isCollapsed && sidebarProjectThreads(group, options.pinnedThreadIds).length > (options.limit ?? 10)
}

export function hasSidebarThreads(group: UiProjectGroup, pinnedThreadIds: string[]): boolean {
  return sidebarProjectThreads(group, pinnedThreadIds).length > 0
}

export function sidebarThreadState(thread: UiThread): SidebarThreadState {
  if (thread.inProgress) return 'working'
  if (thread.unread) return 'unread'
  return 'idle'
}
