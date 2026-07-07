import { describe, expect, it } from 'vitest'
import {
  isLiveOnlyNotificationMethod,
  shouldQueueEventDrivenSyncForMethod,
} from './realtimeSyncPolicy'

describe('realtime sync policy', () => {
  it('keeps high-frequency live deltas on the websocket-only path', () => {
    const liveOnlyMethods = [
      'item/agentMessage/delta',
      'item/plan/delta',
      'item/reasoning/summaryTextDelta',
      'item/reasoning/textDelta',
      'item/reasoning/summaryPartAdded',
    ]

    for (const method of liveOnlyMethods) {
      expect(isLiveOnlyNotificationMethod(method)).toBe(true)
      expect(shouldQueueEventDrivenSyncForMethod(method)).toBe(false)
    }
  })

  it('refreshes persisted state for lifecycle and completion events', () => {
    expect(shouldQueueEventDrivenSyncForMethod('item/completed')).toBe(true)
    expect(shouldQueueEventDrivenSyncForMethod('turn/completed')).toBe(true)
    expect(shouldQueueEventDrivenSyncForMethod('thread/status/changed')).toBe(true)
  })

  it('ignores unrelated notifications that are handled directly', () => {
    expect(isLiveOnlyNotificationMethod('account/rateLimits/updated')).toBe(false)
    expect(shouldQueueEventDrivenSyncForMethod('account/rateLimits/updated')).toBe(false)
    expect(shouldQueueEventDrivenSyncForMethod('mcpServer/startupStatus/updated')).toBe(false)
  })
})
