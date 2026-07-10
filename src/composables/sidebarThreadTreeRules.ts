import type { UiProjectGroup, UiThread } from '../types/codex'

export type SidebarThreadState = 'working' | 'unread' | 'idle'

export type SidebarThreadMenuState = {
  openThreadMenuId: string
  archiveConfirmThreadId: string
}

export type SidebarThreadArchiveClickResult = {
  menuState: SidebarThreadMenuState
  pinnedThreadIds: string[]
  shouldArchive: boolean
}

export type SidebarThreadRenameResult = {
  threadId: string
  title: string
}

export type SidebarActiveProjectDrag = {
  projectName: string
  fromIndex: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  ghostTop: number
  dropTargetIndexFull: number | null
}

export type SidebarProjectBounds = {
  left: number
  right: number
  top: number
  bottom: number
}

export type SidebarElementConstructor<T> = {
  new (...args: never[]): T
}

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

export function sidebarThreadTimeIso(thread: Pick<UiThread, 'createdAtIso' | 'updatedAtIso'>): string {
  return thread.updatedAtIso || thread.createdAtIso
}

function sidebarThreadTimestamp(thread: Pick<UiThread, 'createdAtIso' | 'updatedAtIso'>): number {
  const timestamp = new Date(sidebarThreadTimeIso(thread)).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function compareSidebarThreadsByUpdatedDesc(first: UiThread, second: UiThread): number {
  const timestampDiff = sidebarThreadTimestamp(second) - sidebarThreadTimestamp(first)
  if (timestampDiff !== 0) return timestampDiff
  return first.title.localeCompare(second.title)
}

export function flattenSidebarThreads(groups: UiProjectGroup[]): UiThread[] {
  const threadsById = new Map<string, UiThread>()
  for (const group of groups) {
    for (const thread of group.threads) {
      if (!threadsById.has(thread.id)) {
        threadsById.set(thread.id, thread)
      }
    }
  }
  return Array.from(threadsById.values())
}

export function buildSidebarConversationThreads(
  groups: UiProjectGroup[],
  pinnedThreadIds: string[],
  normalizedQuery: string,
): UiThread[] {
  const pinned = new Set(pinnedThreadIds)
  return flattenSidebarThreads(groups)
    .filter((thread) => !pinned.has(thread.id))
    .filter((thread) => threadMatchesSidebarSearch(thread, normalizedQuery))
    .sort(compareSidebarThreadsByUpdatedDesc)
}

function isCodexConversationPath(path: string): boolean {
  if (path.includes('Codex')) return true

  return path
    .split(/[\\/]+/u)
    .filter(Boolean)
    .some((segment) => {
      const normalized = segment.toLowerCase()
      return normalized === 'codex' || normalized === '.codex'
    })
}

export function isSidebarProjectGroup(group: UiProjectGroup): boolean {
  const projectName = group.projectName.trim()
  const projectPath = sidebarProjectPath(group).trim()
  return projectPath.length > 0 && projectName !== 'unknown-project' && !isCodexConversationPath(projectPath)
}

export function filterSidebarProjectGroups(groups: UiProjectGroup[]): UiProjectGroup[] {
  return groups.filter(isSidebarProjectGroup)
}

export function filterSidebarConversationGroups(groups: UiProjectGroup[]): UiProjectGroup[] {
  return groups.filter((group) => !isSidebarProjectGroup(group))
}

export function projectMatchesSidebarSearch(
  group: UiProjectGroup,
  normalizedQuery: string,
  projectDisplayNameById: Record<string, string>,
): boolean {
  if (!normalizedQuery) return true
  const displayName = sidebarProjectDisplayName(group.projectName, projectDisplayNameById)
  const path = sidebarProjectPath(group)
  return (
    displayName.toLowerCase().includes(normalizedQuery) ||
    group.projectName.toLowerCase().includes(normalizedQuery) ||
    path.toLowerCase().includes(normalizedQuery) ||
    group.threads.some((thread) => threadMatchesSidebarSearch(thread, normalizedQuery))
  )
}

export function filterSidebarProjectsBySearch(
  groups: UiProjectGroup[],
  normalizedQuery: string,
  projectDisplayNameById: Record<string, string>,
): UiProjectGroup[] {
  if (!normalizedQuery) return groups
  return groups.filter((group) =>
    projectMatchesSidebarSearch(group, normalizedQuery, projectDisplayNameById),
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

export function sidebarHiddenThreadCount(
  group: UiProjectGroup,
  pinnedThreadIds: string[],
  limit = 10,
): number {
  return Math.max(0, sidebarProjectThreads(group, pinnedThreadIds).length - limit)
}

export function hasSidebarThreads(group: UiProjectGroup, pinnedThreadIds: string[]): boolean {
  return sidebarProjectThreads(group, pinnedThreadIds).length > 0
}

export function sidebarThreadState(thread: UiThread): SidebarThreadState {
  if (thread.inProgress) return 'working'
  if (thread.unread) return 'unread'
  return 'idle'
}

export function isSidebarEventInsideElement(event: Event, element: HTMLElement | null): boolean {
  if (!element) return false

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (eventPath.includes(element)) return true

  const target = event.target
  return typeof Node !== 'undefined' && target instanceof Node ? element.contains(target) : false
}

export function sidebarElementFromRef<T>(
  value: unknown,
  elementConstructor: SidebarElementConstructor<T>,
): T | null {
  if (value instanceof elementConstructor) return value
  if (typeof value !== 'object' || value === null || !('$el' in value)) return null

  const element = value.$el
  return element instanceof elementConstructor ? element : null
}

export function toggleSidebarPinnedThreadIds(pinnedThreadIds: string[], threadId: string): string[] {
  if (!threadId) return pinnedThreadIds
  if (pinnedThreadIds.includes(threadId)) return pinnedThreadIds.filter((id) => id !== threadId)
  return [threadId, ...pinnedThreadIds]
}

export function closedSidebarThreadMenuState(): SidebarThreadMenuState {
  return {
    openThreadMenuId: '',
    archiveConfirmThreadId: '',
  }
}

export function toggleSidebarThreadMenuState(
  state: SidebarThreadMenuState,
  threadId: string,
): SidebarThreadMenuState {
  if (!threadId || state.openThreadMenuId === threadId) return closedSidebarThreadMenuState()
  return {
    openThreadMenuId: threadId,
    archiveConfirmThreadId: '',
  }
}

export function sidebarArchiveViewHeaderLabel(isArchiveView: boolean): string {
  return isArchiveView ? 'Archived' : 'Threads'
}

export function sidebarArchiveViewToggleLabel(isArchiveView: boolean): string {
  return isArchiveView ? 'Active' : 'Archived'
}

export function sidebarArchiveThreadButtonLabel(params: {
  archiveConfirmThreadId: string
  threadId: string
}): string {
  return params.archiveConfirmThreadId === params.threadId ? 'Confirm archive' : 'Archive'
}

export function sidebarProjectExpansionButtonLabel(isExpanded: boolean, hiddenCount = 0): string {
  if (isExpanded) return 'Show less'
  return hiddenCount > 0 ? `Show ${String(hiddenCount)} more` : 'Show more'
}

export function sidebarArchiveThreadClickResult(
  state: SidebarThreadMenuState,
  pinnedThreadIds: string[],
  threadId: string,
): SidebarThreadArchiveClickResult {
  if (state.archiveConfirmThreadId !== threadId) {
    return {
      menuState: {
        ...state,
        archiveConfirmThreadId: threadId,
      },
      pinnedThreadIds,
      shouldArchive: false,
    }
  }

  return {
    menuState: closedSidebarThreadMenuState(),
    pinnedThreadIds: pinnedThreadIds.filter((id) => id !== threadId),
    shouldArchive: true,
  }
}

export function sidebarThreadRenameResult(
  thread: UiThread,
  renamingThreadId: string,
  draft: string,
): SidebarThreadRenameResult | null {
  if (renamingThreadId !== thread.id) return null

  const title = draft.trim()
  if (!title || title === thread.title) return null
  return {
    threadId: thread.id,
    title,
  }
}

export function toggleSidebarProjectExpansionState(
  expandedProjects: Record<string, boolean>,
  projectName: string,
): Record<string, boolean> {
  if (!projectName) return expandedProjects
  return {
    ...expandedProjects,
    [projectName]: expandedProjects[projectName] !== true,
  }
}

export function toggleSidebarProjectCollapseState(params: {
  collapsedProjects: Record<string, boolean>
  projectName: string
  suppressProjectName: string
}): {
  collapsedProjects: Record<string, boolean>
  suppressProjectName: string
} {
  if (!params.projectName) return params
  if (params.suppressProjectName === params.projectName) {
    return {
      collapsedProjects: params.collapsedProjects,
      suppressProjectName: '',
    }
  }
  return {
    collapsedProjects: {
      ...params.collapsedProjects,
      [params.projectName]: params.collapsedProjects[params.projectName] === false,
    },
    suppressProjectName: params.suppressProjectName,
  }
}

export function sidebarProjectedDropProjectIndex(params: {
  drag: Pick<SidebarActiveProjectDrag, 'fromIndex' | 'dropTargetIndexFull'> | null
  projectCount: number
}): number | null {
  const { drag, projectCount } = params
  if (!drag || drag.dropTargetIndexFull === null || projectCount === 0) return null

  const boundedDropIndex = Math.max(0, Math.min(drag.dropTargetIndexFull, projectCount))
  const projectedIndex = boundedDropIndex > drag.fromIndex ? boundedDropIndex - 1 : boundedDropIndex
  const boundedProjectedIndex = Math.max(0, Math.min(projectedIndex, projectCount - 1))
  return boundedProjectedIndex === drag.fromIndex ? null : boundedProjectedIndex
}

export function buildSidebarLayoutProjectOrder(params: {
  projectNames: string[]
  drag: Pick<SidebarActiveProjectDrag, 'fromIndex'> | null
  projectedIndex: number | null
}): string[] {
  const { projectNames, drag, projectedIndex } = params
  if (!drag || projectedIndex === null) return projectNames

  const next = [...projectNames]
  const [movedProject] = next.splice(drag.fromIndex, 1)
  if (!movedProject) return projectNames
  next.splice(projectedIndex, 0, movedProject)
  return next
}

export function sidebarProjectOuterHeight(params: {
  measuredHeight: number
  dragHeight: number | null
  isCollapsed: boolean
  expandedGapPx: number
}): number {
  const baseHeight = params.dragHeight ?? params.measuredHeight
  const gap = params.isCollapsed ? 0 : params.expandedGapPx
  return Math.max(0, baseHeight + gap)
}

export function buildSidebarLayoutTopByProject(
  projectOrder: string[],
  getProjectOuterHeight: (projectName: string) => number,
): Record<string, number> {
  const topByProject: Record<string, number> = {}
  let currentTop = 0

  for (const projectName of projectOrder) {
    topByProject[projectName] = currentTop
    currentTop += getProjectOuterHeight(projectName)
  }

  return topByProject
}

export function buildSidebarGroupsContainerStyle(totalHeight: number): Record<string, string> {
  return {
    height: `${Math.max(0, totalHeight)}px`,
  }
}

export function sidebarDropTargetIndex(params: {
  cursorY: number
  containerTop: number
  projectNames: string[]
  draggedProjectName: string
  getProjectOuterHeight: (projectName: string) => number
}): number {
  const projectIndexByName = new Map(params.projectNames.map((projectName, index) => [projectName, index]))
  const nonDraggedProjectNames = params.projectNames.filter((projectName) => projectName !== params.draggedProjectName)
  let accumulatedTop = 0

  for (const projectName of nonDraggedProjectNames) {
    const originalIndex = projectIndexByName.get(projectName)
    if (originalIndex === undefined) continue

    const groupOuterHeight = params.getProjectOuterHeight(projectName)
    const groupMiddleY = params.containerTop + accumulatedTop + groupOuterHeight / 2
    if (params.cursorY < groupMiddleY) {
      return originalIndex
    }

    accumulatedTop += groupOuterHeight
  }

  return params.projectNames.length
}

export function isSidebarPointerInProjectDropZone(
  sample: { clientX: number; clientY: number },
  bounds: SidebarProjectBounds | null,
  tolerancePx = 32,
): boolean {
  if (!bounds) return false
  const xInBounds = sample.clientX >= bounds.left && sample.clientX <= bounds.right
  const yInBounds = sample.clientY >= bounds.top - tolerancePx && sample.clientY <= bounds.bottom + tolerancePx
  return xInBounds && yInBounds
}

export function sidebarProjectGroupStyle(params: {
  projectName: string
  drag: SidebarActiveProjectDrag | null
  targetTop: number
  isMenuOpen: boolean
}): Record<string, string> {
  const { projectName, drag, targetTop, isMenuOpen } = params

  if (!drag || drag.projectName !== projectName) {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      zIndex: isMenuOpen ? '45' : '1',
      transform: `translate3d(0, ${targetTop}px, 0)`,
      willChange: 'transform',
      transition: 'transform 180ms ease',
    }
  }

  return {
    position: 'fixed',
    top: '0',
    left: `${drag.groupLeft}px`,
    width: `${drag.groupWidth}px`,
    height: `${drag.groupHeight}px`,
    zIndex: '50',
    pointerEvents: 'none',
    transform: `translate3d(0, ${drag.ghostTop}px, 0)`,
    willChange: 'transform',
    transition: 'transform 0ms linear',
  }
}
