// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ThreadContextUsageBar from './ThreadContextUsageBar.vue'

describe('ThreadContextUsageBar', () => {
  it('shows context usage in a compact pinned status bar', () => {
    const wrapper = mount(ThreadContextUsageBar, {
      props: {
        usage: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          usedTokens: 150_000,
          inputTokens: 146_000,
          contextWindow: 200_000,
          autoCompactTokenLimit: 180_000,
          updatedAtIso: '2026-07-24T00:00:00.000Z',
          compactionState: 'idle',
        },
      },
    })

    const indicator = wrapper.get('[data-testid="thread-context-usage"]')
    expect(indicator.attributes('data-tone')).toBe('warning')
    expect(indicator.text()).toContain('75% used')
    expect(indicator.text()).toContain('approaching auto-compaction')
    expect(indicator.text()).toContain('150K / 200K')
    expect(indicator.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('75')
  })

  it('announces compaction without showing stale token counts', () => {
    const wrapper = mount(ThreadContextUsageBar, {
      props: {
        usage: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          usedTokens: 175_000,
          inputTokens: 170_000,
          contextWindow: 200_000,
          autoCompactTokenLimit: 180_000,
          updatedAtIso: '2026-07-24T00:00:00.000Z',
          compactionState: 'compacting',
        },
      },
    })

    const indicator = wrapper.get('[data-testid="thread-context-usage"]')
    expect(indicator.attributes('data-tone')).toBe('compacting')
    expect(indicator.text()).toContain('Compacting context')
    expect(indicator.text()).not.toContain('175K')
  })

  it('renders nothing until usage data is available', () => {
    const wrapper = mount(ThreadContextUsageBar, { props: { usage: null } })
    expect(wrapper.find('[data-testid="thread-context-usage"]').exists()).toBe(false)
  })
})
