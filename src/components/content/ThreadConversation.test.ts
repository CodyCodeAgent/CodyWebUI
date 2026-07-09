// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import ThreadConversation from './ThreadConversation.vue'
import type { UiLiveOverlay, UiMessage } from '../../types/codex'

function message(index: number, overrides: Partial<UiMessage> = {}): UiMessage {
  return {
    id: `message-${String(index)}`,
    role: 'assistant',
    text: `Message ${String(index)}`,
    ...overrides,
  }
}

function mountConversation(input: {
  messages?: UiMessage[]
  liveOverlay?: UiLiveOverlay | null
  isLoading?: boolean
} = {}) {
  return mount(ThreadConversation, {
    props: {
      messages: input.messages ?? [],
      pendingRequests: [],
      liveOverlay: input.liveOverlay ?? null,
      isLoading: input.isLoading ?? false,
      loadError: '',
      activeThreadId: 'thread-1',
      scrollState: null,
    },
  })
}

describe('ThreadConversation', () => {
  it('renders long threads in a recent-message window and expands earlier rows on demand', async () => {
    const messages = Array.from({ length: 120 }, (_, index) => message(index + 1))
    const wrapper = mountConversation({ messages })

    const renderedMessages = () => wrapper.findAll('[data-testid="conversation-message"]')
    expect(renderedMessages()).toHaveLength(80)
    expect(renderedMessages()[0].attributes('data-message-id')).toBe('message-41')
    expect(wrapper.get('[data-testid="conversation-history-button"]').text()).toContain('Show 40 earlier messages')

    await wrapper.get('[data-testid="conversation-history-button"]').trigger('click')

    expect(renderedMessages()).toHaveLength(120)
    expect(renderedMessages()[0].attributes('data-message-id')).toBe('message-1')
    expect(wrapper.find('[data-testid="conversation-history-button"]').exists()).toBe(false)
  })

  it('keeps copy affordance on the last assistant response when messages are windowed', () => {
    const messages = Array.from({ length: 120 }, (_, index) => message(index + 1))
    const wrapper = mountConversation({ messages })

    const copyButtons = wrapper.findAll('[data-testid="conversation-copy-button"]')

    expect(copyButtons).toHaveLength(1)
    expect(copyButtons[0].attributes('aria-label')).toBe('Copy message')
    expect(wrapper.find('[data-message-id="message-120"] [data-testid="conversation-copy-button"]').exists()).toBe(true)
  })

  it('auto-loads earlier messages when scrolling near the top of a long thread', async () => {
    const messages = Array.from({ length: 200 }, (_, index) => message(index + 1))
    const wrapper = mountConversation({ messages })
    const list = wrapper.get('[data-testid="conversation-list"]').element as HTMLElement

    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => wrapper.findAll('[data-testid="conversation-message"]').length >= 160 ? 3200 : 2000,
    })
    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      value: 600,
    })
    list.scrollTop = 0

    expect(wrapper.findAll('[data-testid="conversation-message"]')).toHaveLength(80)
    expect(wrapper.find('[data-message-id="message-121"]').exists()).toBe(true)

    await wrapper.get('[data-testid="conversation-list"]').trigger('scroll')
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      value: 3200,
    })
    await nextTick()
    await nextTick()

    const renderedMessages = wrapper.findAll('[data-testid="conversation-message"]')
    expect(renderedMessages).toHaveLength(160)
    expect(renderedMessages[0].attributes('data-message-id')).toBe('message-41')
    expect(wrapper.get('[data-testid="conversation-history-button"]').text()).toContain('40 hidden')
    expect(list.scrollTop).toBe(1200)
  })

  it('resets the visible history window when switching threads', async () => {
    const firstThreadMessages = Array.from({ length: 120 }, (_, index) => message(index + 1, {
      id: `first-${String(index + 1)}`,
    }))
    const secondThreadMessages = Array.from({ length: 160 }, (_, index) => message(index + 1, {
      id: `second-${String(index + 1)}`,
    }))
    const wrapper = mountConversation({
      messages: firstThreadMessages,
    })

    await wrapper.get('[data-testid="conversation-history-button"]').trigger('click')
    expect(wrapper.findAll('[data-testid="conversation-message"]')).toHaveLength(120)

    await wrapper.setProps({
      activeThreadId: 'thread-2',
      messages: secondThreadMessages,
      scrollState: null,
    })
    await nextTick()

    const renderedMessages = wrapper.findAll('[data-testid="conversation-message"]')
    expect(renderedMessages).toHaveLength(80)
    expect(renderedMessages[0].attributes('data-message-id')).toBe('second-81')
    expect(wrapper.get('[data-testid="conversation-history-button"]').text()).toContain('Show 80 earlier messages')
  })

  it('shows initial live reasoning details without waiting for another realtime update', () => {
    const wrapper = mountConversation({
      liveOverlay: {
        activityLabel: 'Thinking',
        activityDetails: ['Reading repo files'],
        reasoningText: 'Inspecting the current implementation.',
        errorText: '',
      },
    })

    expect(wrapper.get('[data-testid="conversation-live-overlay-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="conversation-live-overlay-details"]').text()).toContain('Reading repo files')
    expect(wrapper.get('[data-testid="conversation-live-overlay-reasoning"]').text()).toBe('Inspecting the current implementation.')
  })
})
