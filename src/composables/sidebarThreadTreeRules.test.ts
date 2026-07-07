import { describe, expect, it } from 'vitest'
import type { UiProjectGroup, UiThread } from '../types/codex'
import {
  buildSidebarGroupsContainerStyle,
  buildSidebarLayoutProjectOrder,
  buildSidebarLayoutTopByProject,
  buildSidebarPinnedThreads,
  closedSidebarThreadMenuState,
  filterSidebarGroupsBySearch,
  formatSidebarRelativeTime,
  hasSidebarHiddenThreads,
  hasSidebarThreads,
  isSidebarEventInsideElement,
  isSidebarPointerInProjectDropZone,
  normalizeSidebarSearchQuery,
  sidebarDropTargetIndex,
  sidebarBasenameFromPath,
  sidebarProjectGroupStyle,
  sidebarProjectDisplayName,
  sidebarProjectOuterHeight,
  sidebarProjectPath,
  sidebarProjectedDropProjectIndex,
  sidebarProjectThreads,
  sidebarProjectTitleText,
  sidebarArchiveThreadClickResult,
  sidebarThreadState,
  sidebarThreadRenameResult,
  threadMatchesSidebarSearch,
  toggleSidebarPinnedThreadIds,
  toggleSidebarProjectCollapseState,
  toggleSidebarProjectExpansionState,
  toggleSidebarThreadMenuState,
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

  it('detects whether menu dismiss events are inside an element', () => {
    expect(isSidebarEventInsideElement(new Event('pointerdown'), null)).toBe(false)
    const wrapper = { contains: () => false } as unknown as HTMLElement
    const child = {}

    expect(isSidebarEventInsideElement(new Event('pointerdown'), wrapper)).toBe(false)

    const targetEvent = new Event('pointerdown')
    Object.defineProperty(targetEvent, 'target', { value: child })
    expect(isSidebarEventInsideElement(targetEvent, wrapper)).toBe(false)

    const composedEvent = new Event('pointerdown')
    Object.defineProperty(composedEvent, 'composedPath', {
      value: () => [child, wrapper],
    })
    expect(isSidebarEventInsideElement(composedEvent, wrapper)).toBe(true)

    class FakeNode {}
    const originalNode = globalThis.Node
    const fakeChild = new FakeNode()
    const fakeWrapper = {
      contains: (target: unknown) => target === fakeChild,
    } as unknown as HTMLElement
    Object.defineProperty(globalThis, 'Node', {
      configurable: true,
      value: FakeNode,
    })
    try {
      const containedTargetEvent = new Event('pointerdown')
      Object.defineProperty(containedTargetEvent, 'target', { value: fakeChild })
      expect(isSidebarEventInsideElement(containedTargetEvent, fakeWrapper)).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'Node', {
        configurable: true,
        value: originalNode,
      })
    }
  })

  it('updates pinned thread and thread menu state', () => {
    expect(toggleSidebarPinnedThreadIds([], 'thread-1')).toEqual(['thread-1'])
    expect(toggleSidebarPinnedThreadIds(['thread-1', 'thread-2'], 'thread-1')).toEqual(['thread-2'])
    expect(toggleSidebarPinnedThreadIds(['thread-1'], '')).toEqual(['thread-1'])

    expect(closedSidebarThreadMenuState()).toEqual({
      openThreadMenuId: '',
      archiveConfirmThreadId: '',
    })
    expect(toggleSidebarThreadMenuState({
      openThreadMenuId: '',
      archiveConfirmThreadId: 'old',
    }, 'thread-1')).toEqual({
      openThreadMenuId: 'thread-1',
      archiveConfirmThreadId: '',
    })
    expect(toggleSidebarThreadMenuState({
      openThreadMenuId: 'thread-1',
      archiveConfirmThreadId: 'thread-1',
    }, 'thread-1')).toEqual(closedSidebarThreadMenuState())
  })

  it('handles archive confirmation and thread rename drafts', () => {
    const firstArchiveClick = sidebarArchiveThreadClickResult(
      { openThreadMenuId: 'thread-1', archiveConfirmThreadId: '' },
      ['thread-1'],
      'thread-1',
    )
    expect(firstArchiveClick).toEqual({
      menuState: { openThreadMenuId: 'thread-1', archiveConfirmThreadId: 'thread-1' },
      pinnedThreadIds: ['thread-1'],
      shouldArchive: false,
    })

    const secondArchiveClick = sidebarArchiveThreadClickResult(
      firstArchiveClick.menuState,
      firstArchiveClick.pinnedThreadIds,
      'thread-1',
    )
    expect(secondArchiveClick).toEqual({
      menuState: closedSidebarThreadMenuState(),
      pinnedThreadIds: [],
      shouldArchive: true,
    })

    const row = thread({ id: 'thread-1', title: 'Old title' })
    expect(sidebarThreadRenameResult(row, 'other', 'New title')).toBeNull()
    expect(sidebarThreadRenameResult(row, 'thread-1', '   ')).toBeNull()
    expect(sidebarThreadRenameResult(row, 'thread-1', ' Old title ')).toBeNull()
    expect(sidebarThreadRenameResult(row, 'thread-1', ' New title ')).toEqual({
      threadId: 'thread-1',
      title: 'New title',
    })
  })

  it('toggles project expansion and collapse state', () => {
    expect(toggleSidebarProjectExpansionState({}, 'app')).toEqual({ app: true })
    expect(toggleSidebarProjectExpansionState({ app: true }, 'app')).toEqual({ app: false })
    const expanded = { app: true }
    expect(toggleSidebarProjectExpansionState(expanded, '')).toBe(expanded)

    expect(toggleSidebarProjectCollapseState({
      collapsedProjects: {},
      projectName: 'app',
      suppressProjectName: '',
    })).toEqual({
      collapsedProjects: { app: true },
      suppressProjectName: '',
    })
    expect(toggleSidebarProjectCollapseState({
      collapsedProjects: { app: true },
      projectName: 'app',
      suppressProjectName: 'app',
    })).toEqual({
      collapsedProjects: { app: true },
      suppressProjectName: '',
    })
  })

  it('projects drag drop indexes and layout order', () => {
    expect(sidebarProjectedDropProjectIndex({
      drag: null,
      projectCount: 3,
    })).toBeNull()
    expect(sidebarProjectedDropProjectIndex({
      drag: { fromIndex: 1, dropTargetIndexFull: 1 },
      projectCount: 3,
    })).toBeNull()
    expect(sidebarProjectedDropProjectIndex({
      drag: { fromIndex: 1, dropTargetIndexFull: 3 },
      projectCount: 3,
    })).toBe(2)
    expect(sidebarProjectedDropProjectIndex({
      drag: { fromIndex: 2, dropTargetIndexFull: 0 },
      projectCount: 3,
    })).toBe(0)

    expect(buildSidebarLayoutProjectOrder({
      projectNames: ['a', 'b', 'c'],
      drag: { fromIndex: 0 },
      projectedIndex: 2,
    })).toEqual(['b', 'c', 'a'])
    expect(buildSidebarLayoutProjectOrder({
      projectNames: ['a', 'b', 'c'],
      drag: null,
      projectedIndex: 2,
    })).toEqual(['a', 'b', 'c'])
  })

  it('calculates project layout heights and drop targets', () => {
    expect(sidebarProjectOuterHeight({
      measuredHeight: 40,
      dragHeight: null,
      isCollapsed: false,
      expandedGapPx: 6,
    })).toBe(46)
    expect(sidebarProjectOuterHeight({
      measuredHeight: 40,
      dragHeight: 60,
      isCollapsed: true,
      expandedGapPx: 6,
    })).toBe(60)

    expect(buildSidebarLayoutTopByProject(['a', 'b', 'c'], (projectName) => ({
      a: 10,
      b: 20,
      c: 30,
    }[projectName] ?? 0))).toEqual({
      a: 0,
      b: 10,
      c: 30,
    })
    expect(buildSidebarGroupsContainerStyle(-1)).toEqual({ height: '0px' })
    expect(buildSidebarGroupsContainerStyle(42)).toEqual({ height: '42px' })

    const getProjectOuterHeight = (projectName: string) => ({
      a: 10,
      b: 20,
      c: 30,
    }[projectName] ?? 0)

    expect(sidebarDropTargetIndex({
      cursorY: 4,
      containerTop: 0,
      projectNames: ['a', 'b', 'c'],
      draggedProjectName: 'b',
      getProjectOuterHeight,
    })).toBe(0)
    expect(sidebarDropTargetIndex({
      cursorY: 20,
      containerTop: 0,
      projectNames: ['a', 'b', 'c'],
      draggedProjectName: 'b',
      getProjectOuterHeight,
    })).toBe(2)
    expect(sidebarDropTargetIndex({
      cursorY: 80,
      containerTop: 0,
      projectNames: ['a', 'b', 'c'],
      draggedProjectName: 'b',
      getProjectOuterHeight,
    })).toBe(3)
  })

  it('checks drag drop-zone bounds and builds stable group styles', () => {
    const bounds = { left: 10, right: 110, top: 20, bottom: 120 }
    expect(isSidebarPointerInProjectDropZone({ clientX: 20, clientY: -5 }, bounds, 32)).toBe(true)
    expect(isSidebarPointerInProjectDropZone({ clientX: 9, clientY: 50 }, bounds, 32)).toBe(false)
    expect(isSidebarPointerInProjectDropZone({ clientX: 20, clientY: 153 }, bounds, 32)).toBe(false)
    expect(isSidebarPointerInProjectDropZone({ clientX: 20, clientY: 50 }, null, 32)).toBe(false)

    expect(sidebarProjectGroupStyle({
      projectName: 'a',
      drag: null,
      targetTop: 24,
      isMenuOpen: true,
    })).toMatchObject({
      position: 'absolute',
      zIndex: '45',
      transform: 'translate3d(0, 24px, 0)',
    })
    expect(sidebarProjectGroupStyle({
      projectName: 'a',
      drag: {
        projectName: 'a',
        fromIndex: 0,
        groupLeft: 12,
        groupWidth: 240,
        groupHeight: 80,
        ghostTop: 99,
        dropTargetIndexFull: 2,
      },
      targetTop: 24,
      isMenuOpen: false,
    })).toMatchObject({
      position: 'fixed',
      left: '12px',
      width: '240px',
      height: '80px',
      transform: 'translate3d(0, 99px, 0)',
    })
  })
})
