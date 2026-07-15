import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useServerRequestState } from './useServerRequestState'

describe('useServerRequestState', () => {
  it('owns request routing and selected-thread projection', () => {
    const selectedThreadId = ref('thread-1')
    const state = useServerRequestState(selectedThreadId)
    expect(state.handle({ method: 'server/request', atIso: '2026-07-12T00:00:00.000Z', params: { id: 7, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } } })).toBe(true)
    expect(state.selected.value.map((request) => request.id)).toEqual([7])
    state.handle({ method: 'server/request/resolved', atIso: '2026-07-12T00:00:01.000Z', params: { id: 7 } })
    expect(state.all.value).toEqual([])
  })
})
