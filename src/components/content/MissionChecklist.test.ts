// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MissionChecklist from './MissionChecklist.vue'
import type { DesktopPlanState } from '../../composables/desktopPlanState'

function plan(overrides: Partial<DesktopPlanState> = {}): DesktopPlanState {
  return {
    threadId: 'thread-1', turnId: 'turn-1', explanation: '', updatedAtIso: '2026-07-12T00:00:00.000Z',
    revision: 1, lifecycle: 'active', possiblyStale: false,
    steps: [
      { status: 'completed', step: 'Read code' },
      { status: 'inProgress', step: 'Build checklist' },
      { status: 'pending', step: 'Run tests' },
    ],
    ...overrides,
  }
}

describe('MissionChecklist', () => {
  it('renders structured plan progress and marks completed steps', () => {
    const wrapper = mount(MissionChecklist, {
      props: {
        threadId: 'thread-1',
        isTurnInProgress: true,
        hasPendingApproval: false,
        plan: plan(),
      },
    })

    expect(wrapper.text()).toContain('Build checklist')
    expect(wrapper.text()).toContain('1 / 3')
    expect(wrapper.findAll('li[data-status="done"]')).toHaveLength(1)
    expect(wrapper.findAll('li[data-status="doing"]')).toHaveLength(1)
  })

  it('auto-dismisses a completed plan after the completion hold', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MissionChecklist, {
      props: {
        threadId: 'thread-1',
        isTurnInProgress: false,
        hasPendingApproval: false,
        plan: plan({ lifecycle: 'ended', revision: 2, steps: [
          { status: 'completed', step: 'Read code' }, { status: 'completed', step: 'Ship result' },
        ] }),
      },
    })

    expect(wrapper.text()).toContain('Mission complete')
    await vi.advanceTimersByTimeAsync(4_500)
    expect(wrapper.find('.mission-checklist').exists()).toBe(false)
    vi.useRealTimers()
  })

  it('follows the latest structured revision without consulting plan messages', async () => {
    const wrapper = mount(MissionChecklist, {
      props: {
        threadId: 'thread-1',
        plan: plan({ steps: [{ status: 'inProgress', step: 'First step' }, { status: 'pending', step: 'Second step' }] }),
        isTurnInProgress: true,
        hasPendingApproval: false,
      },
    })

    expect(wrapper.find('h2').text()).toBe('First step')

    await wrapper.setProps({
      plan: plan({ revision: 2, steps: [{ status: 'completed', step: 'First step' }, { status: 'inProgress', step: 'Second step' }] }),
    })

    expect(wrapper.find('h2').text()).toBe('Second step')
    expect(wrapper.text()).toContain('1 / 2')
  })

  it('does not warn during active execution even if a stale flag is present', () => {
    const wrapper = mount(MissionChecklist, { props: {
      threadId: 'thread-1', plan: plan({ possiblyStale: true }), isTurnInProgress: true, hasPendingApproval: false,
    } })
    expect(wrapper.text()).not.toContain('Progress may be out of date')
  })
})
