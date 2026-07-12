import { describe, expect, it } from 'vitest'
import { applyStructuredPlanUpdate, clearStructuredPlan, endStructuredPlan } from './desktopPlanState'

const update = {
  threadId: 'thread-1', turnId: 'turn-1', explanation: '', updatedAtIso: '2026-07-12T00:00:00.000Z',
  steps: [{ status: 'inProgress' as const, step: 'First' }, { status: 'pending' as const, step: 'Second' }],
}

describe('desktopPlanState', () => {
  it('replaces the authoritative snapshot and increments revision externally', () => {
    const first = applyStructuredPlanUpdate({}, update, 1)
    expect(first['thread-1']).toMatchObject({ revision: 1, possiblyStale: false, lifecycle: 'active' })
    const second = applyStructuredPlanUpdate(first, { ...update, steps: [
      { status: 'completed', step: 'First' }, { status: 'inProgress', step: 'Second' },
    ] }, 2)
    expect(second['thread-1']).toMatchObject({ revision: 2, possiblyStale: false, steps: [{ status: 'completed' }, { status: 'inProgress' }] })
  })

  it('marks unfinished final snapshots unsynchronized and clears by thread', () => {
    const active = applyStructuredPlanUpdate({}, update, 1)
    const ended = endStructuredPlan(active, 'thread-1', 'turn-1')
    expect(ended['thread-1']).toMatchObject({ lifecycle: 'ended', possiblyStale: true })
    expect(clearStructuredPlan(ended, 'thread-1')).toEqual({})
  })
})
