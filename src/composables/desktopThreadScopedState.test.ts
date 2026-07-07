import { describe, expect, it } from 'vitest'
import { pruneDesktopThreadScopedState, type DesktopThreadScopedState } from './desktopThreadScopedState'

function state(): DesktopThreadScopedState {
  return {
    readStateByThreadId: { keep: 'read', drop: 'read' },
    scrollStateByThreadId: {
      keep: { scrollTop: 10, isAtBottom: false },
      drop: { scrollTop: 20, isAtBottom: true },
    },
    loadedMessagesByThreadId: { keep: true, drop: true },
    loadedVersionByThreadId: { keep: 'v1', drop: 'v2' },
    resumedThreadById: { keep: true, drop: true },
    persistedMessagesByThreadId: { keep: [], drop: [] },
    liveAgentMessagesByThreadId: { keep: [], drop: [] },
    liveReasoningTextByThreadId: { keep: 'thinking', drop: 'stale' },
    turnSummaryByThreadId: { keep: { turnId: 'turn-1', durationMs: 1 }, drop: { turnId: 'turn-2', durationMs: 2 } },
    turnActivityByThreadId: { keep: { label: 'Thinking', details: [] }, drop: { label: 'Writing', details: [] } },
    turnErrorByThreadId: { keep: { message: 'still here' }, drop: { message: 'stale' } },
    activeTurnIdByThreadId: { keep: 'turn-1', drop: 'turn-2' },
    eventUnreadByThreadId: { keep: true, drop: true },
    inProgressById: { keep: true, drop: true },
    pendingServerRequestsByThreadId: {
      keep: [{ id: 1, method: 'server/request', threadId: 'keep', turnId: '', itemId: '', receivedAtIso: '', params: {} }],
      drop: [{ id: 2, method: 'server/request', threadId: 'drop', turnId: '', itemId: '', receivedAtIso: '', params: {} }],
    },
  }
}

describe('desktopThreadScopedState', () => {
  it('prunes every thread-scoped state map consistently', () => {
    const pruned = pruneDesktopThreadScopedState(state(), new Set(['keep']))

    expect(Object.keys(pruned.readStateByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.scrollStateByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.loadedMessagesByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.loadedVersionByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.resumedThreadById)).toEqual(['keep'])
    expect(Object.keys(pruned.persistedMessagesByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.liveAgentMessagesByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.liveReasoningTextByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.turnSummaryByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.turnActivityByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.turnErrorByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.activeTurnIdByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.eventUnreadByThreadId)).toEqual(['keep'])
    expect(Object.keys(pruned.inProgressById)).toEqual(['keep'])
    expect(Object.keys(pruned.pendingServerRequestsByThreadId)).toEqual(['keep'])
  })
})
