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

  it('places prompt library content into the draft without sending it', async () => {
    const wrapper = mountComposer()
    const input = wrapper.get('[data-testid="thread-composer-input"]')
    await input.setValue('Existing note')
    ;(input.element as HTMLTextAreaElement).setSelectionRange(13, 13)

    await wrapper.setProps({ promptInsertion: { id: 1, text: 'Reusable prompt', mode: 'insert' } })

    expect((input.element as HTMLTextAreaElement).value).toBe('Existing note\n\nReusable prompt')
    expect(wrapper.emitted('submit')).toBeUndefined()

    await wrapper.setProps({ promptInsertion: { id: 2, text: 'Replacement', mode: 'replace' } })
    expect((input.element as HTMLTextAreaElement).value).toBe('Replacement')
  })

  it('shows accurate context usage and warns before automatic compaction', () => {
    const wrapper = mountComposer({
      contextUsage: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        usedTokens: 150_000,
        inputTokens: 146_000,
        contextWindow: 200_000,
        autoCompactTokenLimit: 180_000,
        updatedAtIso: '2026-07-24T00:00:00.000Z',
        compactionState: 'idle',
      },
    })

    const indicator = wrapper.get('[data-testid="thread-context-usage"]')
    expect(indicator.attributes('data-tone')).toBe('warning')
    expect(indicator.text()).toContain('75% used')
    expect(indicator.text()).toContain('approaching auto-compaction')
    expect(indicator.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('75')
  })

  it('announces compaction progress without showing stale token counts', () => {
    const wrapper = mountComposer({
      contextUsage: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        usedTokens: 175_000,
        inputTokens: 170_000,
        contextWindow: 200_000,
        autoCompactTokenLimit: 180_000,
        updatedAtIso: '2026-07-24T00:00:00.000Z',
        compactionState: 'compacting',
      },
    })

    const indicator = wrapper.get('[data-testid="thread-context-usage"]')
    expect(indicator.attributes('data-tone')).toBe('compacting')
    expect(indicator.text()).toContain('Compacting context')
    expect(indicator.text()).not.toContain('175K')
  })
})
