import { describe, expect, it } from 'vitest'
import {
  clearDesktopRealtimeSyncQueue,
  consumeDesktopRealtimeSyncQueue,
  createDesktopRealtimeSyncQueue,
  hasPendingDesktopRealtimeSync,
  queueDesktopRealtimeSync,
} from './desktopRealtimeSyncQueue'

describe('desktopRealtimeSyncQueue', () => {
  it('queues thread list refreshes with optional message refreshes', () => {
    const queue = createDesktopRealtimeSyncQueue()

    expect(hasPendingDesktopRealtimeSync(queue)).toBe(false)

    queueDesktopRealtimeSync(queue, ' thread-1 ')
    queueDesktopRealtimeSync(queue, 'thread-2')
    queueDesktopRealtimeSync(queue)

    expect(hasPendingDesktopRealtimeSync(queue)).toBe(true)

    const batch = consumeDesktopRealtimeSyncQueue(queue)

    expect(batch.shouldRefreshThreads).toBe(true)
    expect(Array.from(batch.threadIdsToRefresh)).toEqual(['thread-1', 'thread-2'])
    expect(hasPendingDesktopRealtimeSync(queue)).toBe(false)
  })

  it('can be cleared without consuming a batch', () => {
    const queue = createDesktopRealtimeSyncQueue()

    queueDesktopRealtimeSync(queue, 'thread-1')
    clearDesktopRealtimeSyncQueue(queue)

    expect(consumeDesktopRealtimeSyncQueue(queue)).toEqual({
      shouldRefreshThreads: false,
      threadIdsToRefresh: new Set<string>(),
    })
  })
})
