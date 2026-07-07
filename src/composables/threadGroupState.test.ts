import { describe, expect, it } from 'vitest'
import {
  areStringArraysEqual,
  buildThreadGroupsWithFlags,
  markThreadReadState,
  markThreadUnreadState,
  mergeProjectOrder,
  mergeThreadGroups,
  pruneThreadStateMap,
  reconcileOptimisticThreads,
  reorderStringArray,
  updateThreadBooleanState,
  upsertThreadInGroups,
} from './threadGroupState'
import type { UiProjectGroup, UiThread } from '../types/codex'

function thread(overrides: Partial<UiThread> = {}): UiThread {
  return {
    id: 'thread-1',
    title: 'Thread 1',
    projectName: 'repo',
    cwd: '/workspace/repo',
    createdAtIso: '2026-07-07T00:00:00.000Z',
    updatedAtIso: '2026-07-07T00:00:00.000Z',
    preview: 'hello',
    unread: false,
    inProgress: false,
    ...overrides,
  }
}

function group(overrides: Partial<UiProjectGroup> = {}): UiProjectGroup {
  return {
    projectName: 'repo',
    cwd: '/workspace/repo',
    threads: [thread()],
    ...overrides,
  }
}

describe('threadGroupState', () => {
  it('treats missing string arrays as empty arrays', () => {
    expect(areStringArraysEqual(undefined, [])).toBe(true)
    expect(areStringArraysEqual(['a'], ['a'])).toBe(true)
    expect(areStringArraysEqual(['a'], ['b'])).toBe(false)
  })

  it('keeps existing project order and appends new projects', () => {
    const first = group({ projectName: 'first', cwd: '/first', threads: [] })
    const second = group({ projectName: 'second', cwd: '/second', threads: [] })
    const third = group({ projectName: 'third', cwd: '/third', threads: [] })

    expect(mergeProjectOrder(['second', 'missing', 'first'], [first, second, third])).toEqual([
      'second',
      'first',
      'third',
    ])
  })

  it('upserts new threads into an existing project by cwd', () => {
    const existingGroup = group({
      projectName: 'Friendly repo',
      cwd: '/workspace/repo',
      threads: [thread({ id: 'old', projectName: 'Friendly repo' })],
    })
    const optimisticThread = thread({
      id: 'new',
      projectName: '/workspace/repo',
      cwd: '/workspace/repo',
      title: 'New thread',
    })

    const nextGroups = upsertThreadInGroups([existingGroup], optimisticThread)

    expect(nextGroups).toHaveLength(1)
    expect(nextGroups[0].projectName).toBe('Friendly repo')
    expect(nextGroups[0].threads.map((row) => row.id)).toEqual(['new', 'old'])
    expect(nextGroups[0].threads[0].projectName).toBe('Friendly repo')
  })

  it('updates existing threads without duplicating them', () => {
    const existingGroup = group()
    const nextGroups = upsertThreadInGroups([
      existingGroup,
    ], thread({ title: 'Renamed', preview: 'Renamed' }))

    expect(nextGroups[0].threads).toHaveLength(1)
    expect(nextGroups[0].threads[0].title).toBe('Renamed')
    expect(nextGroups[0].threads[0].preview).toBe('Renamed')
  })

  it('keeps the same group array when an upsert is unchanged', () => {
    const groups = [group()]
    const nextGroups = upsertThreadInGroups(groups, groups[0].threads[0])

    expect(nextGroups).toBe(groups)
  })

  it('builds display flags for unread and in-progress threads', () => {
    const groups = [group({
      threads: [
        thread({ id: 'selected', updatedAtIso: '2026-07-07T00:00:00.000Z' }),
        thread({ id: 'changed', updatedAtIso: '2026-07-07T00:01:00.000Z' }),
        thread({ id: 'running', updatedAtIso: '2026-07-07T00:02:00.000Z' }),
      ],
    })]

    const flagged = buildThreadGroupsWithFlags(groups, {
      selectedThreadId: 'selected',
      inProgressById: { running: true },
      readStateByThreadId: {
        selected: '2026-07-07T00:00:00.000Z',
        changed: '2026-07-07T00:00:00.000Z',
      },
      eventUnreadByThreadId: {
        selected: true,
        running: true,
      },
    })

    expect(flagged[0].threads.map((row) => ({
      id: row.id,
      unread: row.unread,
      inProgress: row.inProgress,
    }))).toEqual([
      { id: 'selected', unread: false, inProgress: false },
      { id: 'changed', unread: true, inProgress: false },
      { id: 'running', unread: false, inProgress: true },
    ])
  })

  it('updates boolean thread state maps without churn', () => {
    const state = { running: true }

    expect(updateThreadBooleanState(state, 'running', true)).toBe(state)
    expect(updateThreadBooleanState(state, 'running', false)).toEqual({})
    expect(updateThreadBooleanState(state, 'new', true)).toEqual({ running: true, new: true })
    expect(updateThreadBooleanState(state, '', true)).toBe(state)
  })

  it('marks unread threads only when they are not selected', () => {
    const state = { old: true }

    expect(markThreadUnreadState(state, 'old', '')).toBe(state)
    expect(markThreadUnreadState(state, 'thread-1', 'thread-1')).toBe(state)
    expect(markThreadUnreadState(state, 'thread-1', 'selected')).toEqual({
      old: true,
      'thread-1': true,
    })
  })

  it('marks a thread read and clears event unread state', () => {
    const readState = { 'thread-1': 'old' }
    const eventUnread = { 'thread-1': true, other: true }
    const next = markThreadReadState(readState, eventUnread, thread({
      id: 'thread-1',
      updatedAtIso: 'new',
    }))

    expect(next.readStateByThreadId).toEqual({ 'thread-1': 'new' })
    expect(next.eventUnreadByThreadId).toEqual({ other: true })

    const stable = markThreadReadState(next.readStateByThreadId, next.eventUnreadByThreadId, thread({
      id: 'thread-1',
      updatedAtIso: 'new',
    }))
    expect(stable.readStateByThreadId).toBe(next.readStateByThreadId)
    expect(stable.eventUnreadByThreadId).toBe(next.eventUnreadByThreadId)
  })

  it('reconciles optimistic threads against server groups', () => {
    const serverGroups = [group({
      threads: [thread({ id: 'server-thread' })],
    })]
    const optimistic = {
      'server-thread': thread({ id: 'server-thread', title: 'Optimistic duplicate' }),
      'new-thread': thread({ id: 'new-thread', title: 'Still local' }),
    }

    const result = reconcileOptimisticThreads(serverGroups, optimistic)

    expect(result.optimisticThreadById).toEqual({
      'new-thread': optimistic['new-thread'],
    })
    expect(result.groups[0].threads.map((row) => row.id)).toEqual(['new-thread', 'server-thread'])
  })

  it('preserves group and thread references when incoming data is unchanged', () => {
    const existingGroup = group()
    const merged = mergeThreadGroups([existingGroup], [existingGroup])

    expect(merged).toBeInstanceOf(Array)
    expect(merged[0]).toBe(existingGroup)
    expect(merged[0].threads[0]).toBe(existingGroup.threads[0])
  })

  it('reorders and prunes state maps without mutating the source', () => {
    const order = ['a', 'b', 'c']
    expect(reorderStringArray(order, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(order).toEqual(['a', 'b', 'c'])

    expect(pruneThreadStateMap({ keep: true, drop: true }, new Set(['keep']))).toEqual({ keep: true })
  })
})
