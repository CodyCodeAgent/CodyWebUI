import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useStructuredPlanState } from './useStructuredPlanState'

describe('useStructuredPlanState', () => {
  it('owns plan revisions and selected-thread projection', () => {
    const selectedThreadId = ref('thread-1')
    const state = useStructuredPlanState(selectedThreadId)
    state.apply({ threadId: 'thread-1', turnId: 'turn-1', steps: [{ step: 'Inspect', status: 'inProgress' }], explanation: '', updatedAtIso: '2026-07-12T00:00:00.000Z' })
    expect(state.selected.value).toMatchObject({ revision: 1, lifecycle: 'active' })
    state.end('thread-1', 'turn-1')
    expect(state.selected.value).toMatchObject({ lifecycle: 'ended', possiblyStale: true })
  })
})
