export type DesktopRealtimeSyncQueue = {
  pendingThreadsRefresh: boolean
  pendingThreadMessageRefresh: Set<string>
}

export type DesktopRealtimeSyncBatch = {
  shouldRefreshThreads: boolean
  threadIdsToRefresh: Set<string>
}

export function createDesktopRealtimeSyncQueue(): DesktopRealtimeSyncQueue {
  return {
    pendingThreadsRefresh: false,
    pendingThreadMessageRefresh: new Set<string>(),
  }
}

export function queueDesktopRealtimeSync(
  queue: DesktopRealtimeSyncQueue,
  threadId?: string,
): void {
  const normalizedThreadId = threadId?.trim() ?? ''
  if (normalizedThreadId) {
    queue.pendingThreadMessageRefresh.add(normalizedThreadId)
  }
  queue.pendingThreadsRefresh = true
}

export function consumeDesktopRealtimeSyncQueue(
  queue: DesktopRealtimeSyncQueue,
): DesktopRealtimeSyncBatch {
  const batch = {
    shouldRefreshThreads: queue.pendingThreadsRefresh,
    threadIdsToRefresh: new Set(queue.pendingThreadMessageRefresh),
  }
  clearDesktopRealtimeSyncQueue(queue)
  return batch
}

export function hasPendingDesktopRealtimeSync(queue: DesktopRealtimeSyncQueue): boolean {
  return queue.pendingThreadsRefresh || queue.pendingThreadMessageRefresh.size > 0
}

export function clearDesktopRealtimeSyncQueue(queue: DesktopRealtimeSyncQueue): void {
  queue.pendingThreadsRefresh = false
  queue.pendingThreadMessageRefresh.clear()
}
