import { describe, expect, it } from 'vitest'
import type { UiProjectGroup, UiThread } from '../types/codex'
import {
  buildSidebarPinnedThreads,
  filterSidebarGroupsBySearch,
  formatSidebarRelativeTime,
  hasSidebarHiddenThreads,
  hasSidebarThreads,
  normalizeSidebarSearchQuery,
  sidebarBasenameFromPath,
  sidebarProjectDisplayName,
  sidebarProjectPath,
  sidebarProjectThreads,
  sidebarProjectTitleText,
  sidebarThreadState,
  threadMatchesSidebarSearch,
  visibleSidebarThreads,
} from './sidebarThreadTreeRules'

function thread(overrides: Partial<UiThread> = {}): UiThread {
  return {
    id: 'thread-1',
    title: 'Thread One',
    projectName: '/repo/app',
    cwd: '/repo/app',
    createdAtIso: '2026-07-07T00:00:00.000Z',
    updatedAtIso: '2026-07-07T00:00:00.000Z',
    preview: 'initial preview',
    unread: false,
    inProgress: false,
    ...overrides,
  }
}

function group(overrides: Partial<UiProjectGroup> = {}): UiProjectGroup {
  return {
    projectName: '/repo/app',
    cwd: '/repo/app',
    threads: [thread()],
    ...overrides,
  }
}

describe('sidebar thread tree rules', () => {
  it('normalizes and applies thread search', () => {
    const query = normalizeSidebarSearchQuery('  PREVIEW ')
    expect(query).toBe('preview')
    expect(threadMatchesSidebarSearch(thread({ preview: 'Initial Preview' }), query)).toBe(true)
    expect(threadMatchesSidebarSearch(thread({ title: 'Other', preview: 'no match' }), query)).toBe(false)

    const groups = filterSidebarGroupsBySearch([
      group({ projectName: 'first', threads: [thread({ id: 'a', preview: 'match me' })] }),
      group({ projectName: 'second', threads: [thread({ id: 'b', preview: 'skip' })] }),
    ], 'match')

    expect(groups.map((row) => row.projectName)).toEqual(['first'])
    expect(groups[0].threads.map((row) => row.id)).toEqual(['a'])
  })

  it('builds pinned thread rows in pinned order and still applies search', () => {
    const groups = [
      group({
        threads: [
          thread({ id: 'a', title: 'Alpha' }),
          thread({ id: 'b', title: 'Beta' }),
        ],
      }),
    ]

    expect(buildSidebarPinnedThreads(groups, ['missing', 'b', 'a'], '')).toEqual([
      groups[0].threads[1],
      groups[0].threads[0],
    ])
    expect(buildSidebarPinnedThreads(groups, ['b', 'a'], 'alpha')).toEqual([
      groups[0].threads[0],
    ])
  })

  it('formats relative times from a stable clock', () => {
    const now = Date.parse('2026-07-07T12:00:00.000Z')
    expect(formatSidebarRelativeTime('not a date', now)).toBe('n/a')
    expect(formatSidebarRelativeTime('2026-07-07T11:59:45.000Z', now)).toBe('now')
    expect(formatSidebarRelativeTime('2026-07-07T11:45:00.000Z', now)).toBe('15m')
    expect(formatSidebarRelativeTime('2026-07-07T09:00:00.000Z', now)).toBe('3h')
    expect(formatSidebarRelativeTime('2026-07-05T12:00:00.000Z', now)).toBe('2d')
  })

  it('formats project display labels and paths', () => {
    const project = group({
      projectName: '/repo/app',
      cwd: '',
      threads: [thread({ cwd: '/repo/app/worktree' })],
    })

    expect(sidebarBasenameFromPath('/repo/app')).toBe('app')
    expect(sidebarProjectDisplayName('/repo/app', {})).toBe('app')
    expect(sidebarProjectDisplayName('/repo/app', { '/repo/app': 'Friendly' })).toBe('Friendly')
    expect(sidebarProjectPath(project)).toBe('/repo/app/worktree')
    expect(sidebarProjectTitleText(project, { '/repo/app': 'Friendly' })).toBe('Friendly (/repo/app/worktree)')
  })

  it('hides pinned threads from project rows and handles collapsed/expanded visibility', () => {
    const threads = Array.from({ length: 12 }, (_, index) => thread({ id: `thread-${String(index + 1)}` }))
    const project = group({ threads })
    const pinnedThreadIds = ['thread-1', 'thread-2']

    expect(sidebarProjectThreads(project, pinnedThreadIds).map((row) => row.id)).toEqual(
      threads.slice(2).map((row) => row.id),
    )
    expect(hasSidebarThreads(project, pinnedThreadIds)).toBe(true)
    expect(visibleSidebarThreads(project, {
      pinnedThreadIds,
      isSearchActive: false,
      isCollapsed: true,
      isExpanded: false,
    })).toEqual([])
    expect(visibleSidebarThreads(project, {
      pinnedThreadIds,
      isSearchActive: false,
      isCollapsed: false,
      isExpanded: false,
      limit: 3,
    }).map((row) => row.id)).toEqual(['thread-3', 'thread-4', 'thread-5'])
    expect(hasSidebarHiddenThreads(project, {
      pinnedThreadIds,
      isSearchActive: false,
      isCollapsed: false,
      limit: 3,
    })).toBe(true)
    expect(hasSidebarHiddenThreads(project, {
      pinnedThreadIds,
      isSearchActive: true,
      isCollapsed: false,
      limit: 3,
    })).toBe(false)
  })

  it('prioritizes working state over unread state', () => {
    expect(sidebarThreadState(thread())).toBe('idle')
    expect(sidebarThreadState(thread({ unread: true }))).toBe('unread')
    expect(sidebarThreadState(thread({ unread: true, inProgress: true }))).toBe('working')
  })
})
