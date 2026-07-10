// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ThreadComposer from './ThreadComposer.vue'

function mountComposer(overrides = {}) {
  return mount(ThreadComposer, {
    props: {
      activeThreadId: 'thread-1',
      models: ['gpt-5.5'],
      selectedModel: 'gpt-5.5',
      selectedReasoningEffort: 'high',
      collaborationModes: [
        {
          name: 'default',
          label: 'Default',
          mode: 'default',
          model: 'gpt-5.5',
          reasoningEffort: 'high',
          developerInstructions: null,
        },
      ],
      selectedCollaborationMode: 'default',
      selectedPermissionMode: 'current',
      cwd: '/repo',
      ...overrides,
    },
    global: {
      stubs: {
        ComposerDropdown: true,
        IconTablerArrowUp: true,
        IconTablerPhoto: true,
        IconTablerPlayerStopFilled: true,
        IconTablerX: true,
      },
    },
  })
}

describe('ThreadComposer', () => {
  it('enables submit after typing and emits a normalized message payload', async () => {
    const wrapper = mountComposer()
    const input = wrapper.get('[data-testid="thread-composer-input"]')
    const submit = wrapper.get('[data-testid="thread-composer-submit"]')

    expect((submit.element as HTMLButtonElement).disabled).toBe(true)

    await input.setValue('  hello from composer  ')

    expect((submit.element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.get('[data-testid="thread-composer"]').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          text: 'hello from composer',
          images: [],
          skills: [],
          contexts: [],
        },
      ],
    ])
    expect((input.element as HTMLTextAreaElement).value).toBe('')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the composer disabled when no active thread is selected', async () => {
    const wrapper = mountComposer({ activeThreadId: '' })

    expect((wrapper.get('[data-testid="thread-composer-input"]').element as HTMLTextAreaElement).disabled).toBe(true)
    expect((wrapper.get('[data-testid="thread-composer-submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('emits permission mode changes from the composer controls', async () => {
    const wrapper = mountComposer()
    const dropdowns = wrapper.findAllComponents({ name: 'ComposerDropdown' })

    await dropdowns[3]?.vm.$emit('update:modelValue', 'yolo')

    expect(wrapper.emitted('update:selected-permission-mode')).toEqual([['yolo']])
  })
})
