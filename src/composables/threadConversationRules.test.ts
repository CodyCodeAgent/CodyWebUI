import { describe, expect, it } from 'vitest'
import type { UiMessage, UiToolTimelineEntry } from '../types/codex'
import {
  buildCopyText,
  buildCopyTextAt,
  buildToolCopyText,
  isCopyableMessage,
  shouldShowCopyButton,
} from './threadConversationRules'

function tool(overrides: Partial<UiToolTimelineEntry> = {}): UiToolTimelineEntry {
  return {
    kind: 'command',
    title: 'Shell command',
    status: 'completed',
    summary: 'npm test',
    details: ['cwd: /repo', 'exit: 0'],
    outputLabel: 'Output',
    output: 'Tests passed',
    ...overrides,
  }
}

function message(overrides: Partial<UiMessage> = {}): UiMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    text: 'Answer',
    ...overrides,
  }
}

describe('thread conversation rules', () => {
  it('builds copy text from tool, message, skills, and images', () => {
    expect(buildToolCopyText(tool())).toBe([
      'Shell command: npm test',
      'Status: Completed',
      'cwd: /repo\nexit: 0',
      'Output:\nTests passed',
    ].join('\n'))

    expect(buildCopyText(message({
      text: '  Answer body  ',
      tool: tool({ output: '  ' }),
      skills: [
        { name: 'review', path: '/skills/review', description: '', displayName: 'Review' },
        { name: ' ', path: '/skills/skip', description: '', displayName: 'Skip' },
      ],
      images: [' image-a.png ', ''],
    }))).toBe([
      'Shell command: npm test\nStatus: Completed\ncwd: /repo\nexit: 0',
      'Answer body',
      '$review',
      ' image-a.png ',
    ].join('\n\n'))
  })

  it('excludes worked summaries and blank messages from copy actions', () => {
    expect(isCopyableMessage(message({ messageType: 'worked' }))).toBe(false)
    expect(isCopyableMessage(message({ text: ' ', images: [], skills: [] }))).toBe(false)
    expect(isCopyableMessage(message({ text: 'copy me' }))).toBe(true)
  })

  it('shows copy buttons only for the last adjacent assistant response', () => {
    const messages = [
      message({ id: 'user', role: 'user', text: 'Question' }),
      message({ id: 'tool', role: 'assistant', text: '', tool: tool() }),
      message({ id: 'assistant', role: 'assistant', text: 'Answer' }),
      message({ id: 'next-user', role: 'user', text: 'Next question' }),
    ]

    expect(shouldShowCopyButton(messages, messages[0], 0)).toBe(true)
    expect(shouldShowCopyButton(messages, messages[1], 1)).toBe(false)
    expect(shouldShowCopyButton(messages, messages[2], 2)).toBe(true)
    expect(shouldShowCopyButton(messages, messages[3], 3)).toBe(true)
  })

  it('combines adjacent assistant messages when copying a response', () => {
    const messages = [
      message({ id: 'user', role: 'user', text: 'Question' }),
      message({ id: 'tool', role: 'assistant', text: '', tool: tool() }),
      message({ id: 'assistant', role: 'assistant', text: 'Answer' }),
    ]

    expect(buildCopyTextAt(messages, messages[0], 0)).toBe('Question')
    expect(buildCopyTextAt(messages, messages[2], 2)).toBe([
      buildCopyText(messages[1]),
      'Answer',
    ].join('\n\n'))
  })
})
