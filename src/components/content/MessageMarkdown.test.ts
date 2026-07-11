// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MessageMarkdown from './MessageMarkdown.vue'

describe('MessageMarkdown', () => {
  it('copies code and toggles wrapping from accessible controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(MessageMarkdown, { props: { text: '```ts\nconst answer = 42\n```' } })

    await wrapper.get('[data-markdown-action="copy-code"]').trigger('click')
    expect(writeText).toHaveBeenCalledOnce()

    await wrapper.get('[data-markdown-action="wrap-code"]').trigger('click')
    expect(wrapper.get('[data-markdown-action="wrap-code"]').attributes('aria-label')).toBe('Wrap')
  })

  it('renders workspace file references as focused controls', () => {
    const wrapper = mount(MessageMarkdown, { props: { text: '`src/main.ts:42`', cwd: '/repo' } })
    const link = wrapper.get('[data-markdown-action="open-file"]')
    expect(link.attributes('data-file-path')).toBe('src/main.ts')
    expect(link.attributes('title')).toContain('Open src/main.ts')
  })
})
