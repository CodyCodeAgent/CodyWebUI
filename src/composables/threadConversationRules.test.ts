import { describe, expect, it } from 'vitest'
import type { UiMessage, UiServerRequest, UiToolTimelineEntry } from '../types/codex'
import {
  buildApprovalDecisionReply,
  buildApprovalScopeReply,
  buildConversationScrollMetrics,
  buildCopyText,
  buildCopyTextAt,
  buildEmptyServerRequestReply,
  buildRejectedServerRequestReply,
  buildToolCallFailureReply,
  buildToolCallSuccessReply,
  buildToolCopyText,
  buildToolUserInputReply,
  hasLiveOverlayDetails,
  isCopyableMessage,
  readToolQuestionAnswer,
  readToolQuestionOtherAnswer,
  readToolQuestions,
  restoredConversationScrollTop,
  shouldLockConversationToBottom,
  shouldShowCopyButton,
  shouldShowScrollToBottomButton,
  toolQuestionKey,
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

function serverRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 42,
    method: 'item/tool/requestUserInput',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-07-07T12:00:00.000Z',
    params: {},
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

  it('parses tool questions and reads saved answers by request/question key', () => {
    const request = serverRequest({
      params: {
        questions: [
          {
            id: 'choice',
            header: 'Mode',
            question: 'Pick one',
            isOther: true,
            options: [
              { label: 'Fast' },
              { label: '' },
              { name: 'missing-label' },
              { label: 'Careful' },
            ],
          },
          { id: '', question: 'skip me' },
          null,
        ],
      },
    })

    expect(readToolQuestions(request)).toEqual([
      {
        id: 'choice',
        header: 'Mode',
        question: 'Pick one',
        isOther: true,
        options: ['Fast', 'Careful'],
      },
    ])
    expect(toolQuestionKey(42, 'choice')).toBe('42:choice')
    expect(readToolQuestionAnswer({ '42:choice': 'Careful' }, 42, 'choice', 'Fast')).toBe('Careful')
    expect(readToolQuestionAnswer({}, 42, 'choice', 'Fast')).toBe('Fast')
    expect(readToolQuestionOtherAnswer({ '42:choice': 'Custom' }, 42, 'choice')).toBe('Custom')
    expect(readToolQuestionOtherAnswer({}, 42, 'choice')).toBe('')
  })

  it('builds approval and tool request replies', () => {
    expect(buildApprovalDecisionReply(7, 'acceptForSession')).toEqual({
      id: 7,
      approvalScope: 'session',
      result: { decision: 'acceptForSession' },
    })
    expect(buildApprovalScopeReply(7, 'workspace')).toEqual({
      id: 7,
      approvalScope: 'workspace',
      result: { decision: 'accept' },
    })
    expect(buildToolCallSuccessReply(8)).toEqual({
      id: 8,
      result: { success: true, contentItems: [] },
    })
    expect(buildToolCallFailureReply(8)).toEqual({
      id: 8,
      result: {
        success: false,
        contentItems: [
          {
            type: 'inputText',
            text: 'Tool call rejected from codex-web-local UI.',
          },
        ],
      },
    })
    expect(buildEmptyServerRequestReply(9)).toEqual({ id: 9, result: {} })
    expect(buildRejectedServerRequestReply(9, 'Nope')).toEqual({
      id: 9,
      error: { code: -32000, message: 'Nope' },
    })
  })

  it('builds tool user input replies from selected and custom answers', () => {
    const request = serverRequest({
      params: {
        questions: [
          {
            id: 'size',
            question: 'Size?',
            options: [{ label: 'Small' }, { label: 'Large' }],
          },
          {
            id: 'note',
            question: 'Anything else?',
            isOther: true,
            options: [{ label: 'Other' }],
          },
        ],
      },
    })

    expect(buildToolUserInputReply({
      request,
      answersByKey: { '42:size': 'Large' },
      otherAnswersByKey: { '42:note': '  custom note  ' },
    })).toEqual({
      id: 42,
      result: {
        answers: {
          size: { answers: ['Large'] },
          note: { answers: ['Other', 'custom note'] },
        },
      },
    })
  })

  it('summarizes live overlay details and scroll-to-bottom visibility', () => {
    expect(hasLiveOverlayDetails(null)).toBe(false)
    expect(hasLiveOverlayDetails({
      activityLabel: 'Thinking',
      activityDetails: [],
      reasoningText: '   ',
      errorText: '',
    })).toBe(false)
    expect(hasLiveOverlayDetails({
      activityLabel: 'Thinking',
      activityDetails: ['reading files'],
      reasoningText: '',
      errorText: '',
    })).toBe(true)
    expect(hasLiveOverlayDetails({
      activityLabel: 'Thinking',
      activityDetails: [],
      reasoningText: 'reasoning',
      errorText: '',
    })).toBe(true)

    expect(shouldShowScrollToBottomButton({
      activeThreadId: '',
      isLoading: false,
      messageCount: 1,
      pendingRequestCount: 0,
      hasLiveOverlay: false,
      scrollState: { scrollTop: 0, scrollRatio: 0, isAtBottom: false },
    })).toBe(false)
    expect(shouldShowScrollToBottomButton({
      activeThreadId: 'thread-1',
      isLoading: true,
      messageCount: 1,
      pendingRequestCount: 0,
      hasLiveOverlay: false,
      scrollState: { scrollTop: 0, scrollRatio: 0, isAtBottom: false },
    })).toBe(false)
    expect(shouldShowScrollToBottomButton({
      activeThreadId: 'thread-1',
      isLoading: false,
      messageCount: 0,
      pendingRequestCount: 0,
      hasLiveOverlay: false,
      scrollState: { scrollTop: 0, scrollRatio: 0, isAtBottom: false },
    })).toBe(false)
    expect(shouldShowScrollToBottomButton({
      activeThreadId: 'thread-1',
      isLoading: false,
      messageCount: 0,
      pendingRequestCount: 0,
      hasLiveOverlay: true,
      scrollState: { scrollTop: 0, scrollRatio: 0, isAtBottom: false },
    })).toBe(true)
  })

  it('calculates conversation scroll metrics and restored positions', () => {
    expect(buildConversationScrollMetrics({
      scrollTop: 80,
      scrollHeight: 200,
      clientHeight: 100,
      bottomThresholdPx: 16,
    })).toEqual({
      maxScrollTop: 100,
      scrollRatio: 0.8,
      isAtBottom: false,
    })
    expect(buildConversationScrollMetrics({
      scrollTop: 85,
      scrollHeight: 200,
      clientHeight: 100,
      bottomThresholdPx: 16,
    }).isAtBottom).toBe(true)
    expect(buildConversationScrollMetrics({
      scrollTop: 20,
      scrollHeight: 80,
      clientHeight: 100,
      bottomThresholdPx: 16,
    })).toEqual({
      maxScrollTop: 0,
      scrollRatio: 1,
      isAtBottom: true,
    })

    expect(restoredConversationScrollTop({
      scrollTop: 500,
      scrollRatio: 0.25,
      isAtBottom: false,
    }, 200)).toBe(50)
    expect(restoredConversationScrollTop({
      scrollTop: -20,
      isAtBottom: false,
    }, 200)).toBe(0)
    expect(restoredConversationScrollTop({
      scrollTop: 500,
      isAtBottom: false,
    }, 200)).toBe(200)
  })

  it('locks live output to bottom only when the saved state is at bottom', () => {
    expect(shouldLockConversationToBottom(null)).toBe(true)
    expect(shouldLockConversationToBottom({ scrollTop: 0, scrollRatio: 0, isAtBottom: true })).toBe(true)
    expect(shouldLockConversationToBottom({ scrollTop: 0, scrollRatio: 0, isAtBottom: false })).toBe(false)
  })
})
