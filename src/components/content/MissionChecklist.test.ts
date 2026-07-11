// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MissionChecklist from './MissionChecklist.vue'

describe('MissionChecklist', () => {
  it('renders structured plan progress and marks completed steps', () => {
    const wrapper = mount(MissionChecklist, {
      props: {
        threadId: 'thread-1',
        isTurnInProgress: true,
        hasPendingApproval: false,
        messages: [{
          id: 'plan-1',
          role: 'assistant',
          messageType: 'plan.live',
          text: 'Plan updated\n\n1. [done] Read code\n2. [doing] Build checklist\n3. [todo] Run tests',
        }],
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
        messages: [{
          id: 'plan-2',
          role: 'assistant',
          messageType: 'plan.live',
          text: '1. [done] Read code\n2. [done] Ship result',
        }],
      },
    })

    expect(wrapper.text()).toContain('Mission complete')
    await vi.advanceTimersByTimeAsync(4_500)
    expect(wrapper.find('.mission-checklist').exists()).toBe(false)
    vi.useRealTimers()
  })
})
