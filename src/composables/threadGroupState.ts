import type { UiProjectGroup, UiThread } from '../types/codex'

export function flattenThreads(groups: UiProjectGroup[]): UiThread[] {
  return groups.flatMap((group) => group.threads)
}

export function mergeProjectOrder(previousOrder: string[], incomingGroups: UiProjectGroup[]): string[] {
  const nextOrder = previousOrder.filter((projectName) =>
    incomingGroups.some((group) => group.projectName === projectName),
  )
  for (const group of incomingGroups) {
    if (!nextOrder.includes(group.projectName)) {
      nextOrder.push(group.projectName)
    }
  }
  return areStringArraysEqual(previousOrder, nextOrder) ? previousOrder : nextOrder
}

export function orderGroupsByProjectOrder(
  incoming: UiProjectGroup[],
  projectOrder: string[],
): UiProjectGroup[] {
  if (projectOrder.length === 0) return incoming
  const orderIndex = new Map(projectOrder.map((projectName, index) => [projectName, index]))
  return incoming.slice().sort((first, second) => {
    const firstIndex = orderIndex.get(first.projectName) ?? Number.MAX_SAFE_INTEGER
    const secondIndex = orderIndex.get(second.projectName) ?? Number.MAX_SAFE_INTEGER
    if (firstIndex !== secondIndex) return firstIndex - secondIndex
    return first.projectName.localeCompare(second.projectName)
  })
}

export function areStringArraysEqual(first?: string[], second?: string[]): boolean {
  const left = Array.isArray(first) ? first : []
  const right = Array.isArray(second) ? second : []
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export function reorderStringArray(items: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex) return items
  if (fromIndex < 0 || fromIndex >= items.length) return items
  if (toIndex < 0 || toIndex >= items.length) return items

  const nextItems = items.slice()
  const [moved] = nextItems.splice(fromIndex, 1)
  if (!moved) return items
  nextItems.splice(toIndex, 0, moved)
  return nextItems
}

export function omitKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export function updateThreadBooleanState(
  state: Record<string, boolean>,
  threadId: string,
  nextValue: boolean,
): Record<string, boolean> {
  if (!threadId) return state
  const currentValue = state[threadId] === true
  if (currentValue === nextValue) return state
  if (nextValue) {
    return {
      ...state,
      [threadId]: true,
    }
  }
  return omitKey(state, threadId)
}

export function markThreadUnreadState(
  state: Record<string, boolean>,
  threadId: string,
  selectedThreadId: string,
): Record<string, boolean> {
  if (!threadId || threadId === selectedThreadId || state[threadId] === true) return state
  return {
    ...state,
    [threadId]: true,
  }
}

export function markThreadReadState(
  readStateByThreadId: Record<string, string>,
  eventUnreadByThreadId: Record<string, boolean>,
  thread: Pick<UiThread, 'id' | 'updatedAtIso'> | null | undefined,
): {
  readStateByThreadId: Record<string, string>
  eventUnreadByThreadId: Record<string, boolean>
} {
  if (!thread?.id) {
    return { readStateByThreadId, eventUnreadByThreadId }
  }

  const nextReadState = readStateByThreadId[thread.id] === thread.updatedAtIso
    ? readStateByThreadId
    : {
        ...readStateByThreadId,
        [thread.id]: thread.updatedAtIso,
      }
  const nextEventUnreadState = eventUnreadByThreadId[thread.id]
    ? omitKey(eventUnreadByThreadId, thread.id)
    : eventUnreadByThreadId

  return {
    readStateByThreadId: nextReadState,
    eventUnreadByThreadId: nextEventUnreadState,
  }
}

export function pruneThreadStateMap<T>(
  stateMap: Record<string, T>,
  threadIds: Set<string>,
): Record<string, T> {
  const nextEntries = Object.entries(stateMap).filter(([threadId]) => threadIds.has(threadId))
  if (nextEntries.length === Object.keys(stateMap).length) {
    return stateMap
  }
  return Object.fromEntries(nextEntries) as Record<string, T>
}

function areThreadFieldsEqual(first: UiThread, second: UiThread): boolean {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.projectName === second.projectName &&
    first.cwd === second.cwd &&
    first.createdAtIso === second.createdAtIso &&
    first.updatedAtIso === second.updatedAtIso &&
    first.preview === second.preview &&
    first.unread === second.unread &&
    first.inProgress === second.inProgress
  )
}

function areThreadArraysEqual(first: UiThread[], second: UiThread[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

function areGroupArraysEqual(first: UiProjectGroup[], second: UiProjectGroup[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

export function mergeThreadGroups(
  previous: UiProjectGroup[],
  incoming: UiProjectGroup[],
): UiProjectGroup[] {
  const previousGroupsByName = new Map(previous.map((group) => [group.projectName, group]))
  const mergedGroups: UiProjectGroup[] = incoming.map((incomingGroup) => {
    const previousGroup = previousGroupsByName.get(incomingGroup.projectName)
    const previousThreadsById = new Map(previousGroup?.threads.map((thread) => [thread.id, thread]) ?? [])

    const mergedThreads = incomingGroup.threads.map((incomingThread) => {
      const previousThread = previousThreadsById.get(incomingThread.id)
      if (previousThread && areThreadFieldsEqual(previousThread, incomingThread)) {
        return previousThread
      }
      return incomingThread
    })

    if (
      previousGroup &&
      previousGroup.projectName === incomingGroup.projectName &&
      areThreadArraysEqual(previousGroup.threads, mergedThreads)
    ) {
      return previousGroup
    }

    return {
      projectName: incomingGroup.projectName,
      cwd: incomingGroup.cwd,
      threads: mergedThreads,
    }
  })

  return areGroupArraysEqual(previous, mergedGroups) ? previous : mergedGroups
}

export function buildThreadGroupsWithFlags(
  sourceGroups: UiProjectGroup[],
  values: {
    selectedThreadId: string
    inProgressById: Record<string, boolean>
    readStateByThreadId: Record<string, string>
    eventUnreadByThreadId: Record<string, boolean>
  },
): UiProjectGroup[] {
  return sourceGroups.map((group) => ({
    projectName: group.projectName,
    cwd: group.cwd,
    threads: group.threads.map((thread) => {
      const inProgress = values.inProgressById[thread.id] === true
      const isSelected = values.selectedThreadId === thread.id
      const lastReadIso = values.readStateByThreadId[thread.id]
      const unreadByEvent = values.eventUnreadByThreadId[thread.id] === true
      const unread = !isSelected && !inProgress && (unreadByEvent || lastReadIso !== thread.updatedAtIso)

      return {
        ...thread,
        inProgress,
        unread,
      }
    }),
  }))
}

function doesGroupMatchThread(group: UiProjectGroup, thread: UiThread): boolean {
  if (group.projectName === thread.projectName) return true
  const groupCwd = group.cwd.trim()
  const threadCwd = thread.cwd.trim()
  return groupCwd.length > 0 && threadCwd.length > 0 && groupCwd === threadCwd
}

function normalizeThreadForGroup(group: UiProjectGroup, thread: UiThread): UiThread {
  const nextCwd = thread.cwd || group.cwd
  if (group.projectName === thread.projectName && thread.cwd === nextCwd) {
    return thread
  }
  return {
    ...thread,
    projectName: group.projectName,
    cwd: nextCwd,
  }
}

export function upsertThreadInGroups(groups: UiProjectGroup[], thread: UiThread): UiProjectGroup[] {
  let didMatch = false
  let didChange = false

  const nextGroups = groups.map((group) => {
    if (!doesGroupMatchThread(group, thread)) return group

    didMatch = true
    const nextThread = normalizeThreadForGroup(group, thread)
    const existingIndex = group.threads.findIndex((row) => row.id === thread.id)
    if (existingIndex === -1) {
      didChange = true
      return {
        ...group,
        cwd: group.cwd || nextThread.cwd || group.projectName,
        threads: [nextThread, ...group.threads],
      }
    }

    const existing = group.threads[existingIndex]
    if (existing && areThreadFieldsEqual(existing, nextThread)) return group

    didChange = true
    const nextThreads = group.threads.slice()
    nextThreads[existingIndex] = {
      ...existing,
      ...nextThread,
    }
    return {
      ...group,
      threads: nextThreads,
    }
  })

  if (didMatch) return didChange ? nextGroups : groups

  return [
    {
      projectName: thread.projectName,
      cwd: thread.cwd || thread.projectName,
      threads: [thread],
    },
    ...groups,
  ]
}

export function reconcileOptimisticThreads(
  groups: UiProjectGroup[],
  optimisticThreadById: Record<string, UiThread>,
): {
  groups: UiProjectGroup[]
  optimisticThreadById: Record<string, UiThread>
} {
  const serverThreadIds = new Set(flattenThreads(groups).map((thread) => thread.id))
  let nextOptimistic = optimisticThreadById
  let nextGroups = groups

  for (const [threadId, optimisticThread] of Object.entries(optimisticThreadById)) {
    if (serverThreadIds.has(threadId)) {
      if (nextOptimistic === optimisticThreadById) {
        nextOptimistic = { ...optimisticThreadById }
      }
      delete nextOptimistic[threadId]
      continue
    }

    nextGroups = upsertThreadInGroups(nextGroups, optimisticThread)
  }

  return {
    groups: nextGroups,
    optimisticThreadById: nextOptimistic,
  }
}

export function renameThreadInGroups(
  groups: UiProjectGroup[],
  threadId: string,
  title: string,
): UiProjectGroup[] {
  let didChange = false
  const nextGroups = groups.map((group) => {
    let didChangeGroup = false
    const nextThreads = group.threads.map((thread) => {
      if (thread.id !== threadId) return thread
      if (thread.title === title && thread.preview === title) return thread

      didChange = true
      didChangeGroup = true
      return {
        ...thread,
        title,
        preview: title,
      }
    })

    return didChangeGroup ? { ...group, threads: nextThreads } : group
  })

  return didChange ? nextGroups : groups
}
