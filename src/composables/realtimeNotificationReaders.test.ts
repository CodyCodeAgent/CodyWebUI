import { describe, expect, it } from 'vitest'
import type { RpcNotification } from '../api/codexRealtimeClient'
import {
  extractThreadIdFromNotification,
  isAgentContentEvent,
  readAgentMessageCompleted,
  readAgentMessageDelta,
  readPlanUpdatedMessage,
  readStructuredPlanUpdate,
  readRateLimitSnapshotPayload,
  readReasoningDelta,
  readStartedThread,
  readThreadContextUsageUpdate,
  readTurnActivity,
  readTurnCompletedInfo,
  readTurnDurationHints,
  readTurnErrorMessage,
  readTurnStartedInfo,
  readUserMessageCompleted,
} from './realtimeNotificationReaders'

function notification(method: string, params: unknown, atIso = '2026-07-07T00:00:00.000Z'): RpcNotification {
  return { method, params, atIso }
}

describe('realtime notification readers', () => {
  it('extracts thread ids from common notification shapes', () => {
    expect(extractThreadIdFromNotification(notification('item/agentMessage/delta', { threadId: 'thread-a' }))).toBe('thread-a')
    expect(extractThreadIdFromNotification(notification('turn/started', { thread_id: 'thread-b' }))).toBe('thread-b')
    expect(extractThreadIdFromNotification(notification('turn/started', { thread: { id: 'thread-c' } }))).toBe('thread-c')
    expect(extractThreadIdFromNotification(notification('turn/started', { turn: { threadId: 'thread-d' } }))).toBe('thread-d')
    expect(extractThreadIdFromNotification(notification('turn/started', { conversationId: 'thread-e' }))).toBe('thread-e')
  })

  it('reads turn lifecycle and failure state', () => {
    const started = readTurnStartedInfo(notification('turn/started', {
      turn: {
        id: 'turn-1',
        threadId: 'thread-1',
        startedAt: '2026-07-07T01:00:00.000Z',
      },
    }))

    expect(started).toMatchObject({
      threadId: 'thread-1',
      turnId: 'turn-1',
      startedAtMs: new Date('2026-07-07T01:00:00.000Z').getTime(),
    })
    expect(readTurnStartedInfo(notification('turn/started', {
      thread_id: 'thread-raw',
      turn_id: 'turn-raw',
    }))).toMatchObject({
      threadId: 'thread-raw',
      turnId: 'turn-raw',
    })

    const completed = readTurnCompletedInfo(notification('turn/completed', {
      turn: {
        id: 'turn-1',
        threadId: 'thread-1',
        startedAt: '2026-07-07T01:00:00.000Z',
        completedAt: '2026-07-07T01:00:05.000Z',
      },
    }))

    expect(completed).toMatchObject({
      threadId: 'thread-1',
      turnId: 'turn-1',
      completedAtMs: new Date('2026-07-07T01:00:05.000Z').getTime(),
      startedAtMs: new Date('2026-07-07T01:00:00.000Z').getTime(),
    })

    expect(readTurnErrorMessage(notification('turn/completed', {
      turn: {
        status: 'failed',
        error: { message: 'model stopped' },
      },
    }))).toBe('model stopped')

    expect(readTurnDurationHints(notification('turn/completed', {
      durationMs: 1200,
      turn: { durationMs: 1000 },
    }))).toEqual({
      explicitDurationMs: 1200,
      turnDurationMs: 1000,
    })
  })

  it('reads rate limit update payloads without leaking protocol parsing into state', () => {
    const rateLimits = { limitId: 'codex', primary: { usedPercent: 10 } }

    expect(readRateLimitSnapshotPayload(notification('account/rateLimits/updated', {
      rateLimits,
    }))).toBe(rateLimits)
    expect(readRateLimitSnapshotPayload(notification('turn/started', {}))).toBeNull()
  })

  it('reads current thread context usage and model window from token notifications', () => {
    expect(readThreadContextUsageUpdate(notification('thread/tokenUsage/updated', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      tokenUsage: {
        last: {
          inputTokens: 118_000,
          totalTokens: 120_000,
        },
        modelContextWindow: 200_000,
      },
    }))).toMatchObject({
      threadId: 'thread-1',
      turnId: 'turn-1',
      inputTokens: 118_000,
      usedTokens: 120_000,
      contextWindow: 200_000,
      compactionState: 'idle',
    })

    expect(readThreadContextUsageUpdate(notification('thread/tokenUsage/updated', {
      thread_id: 'thread-2',
      token_usage: {
        last: { input_tokens: '99000', total_tokens: '100000' },
        model_context_window: '128000',
      },
    }))).toMatchObject({
      threadId: 'thread-2',
      usedTokens: 100_000,
      contextWindow: 128_000,
    })
  })

  it('reads started thread notifications for immediate sidebar updates', () => {
    expect(readStartedThread(notification('thread/started', {
      thread: {
        id: 'thread-1',
        title: 'Fresh task',
        projectName: 'CodyWeb',
        cwd: '/workspace/CodyWeb',
        createdAt: 1783414904,
        updatedAt: '2026-07-07T09:02:00.000Z',
        preview: 'first prompt',
      },
    }))).toMatchObject({
      id: 'thread-1',
      title: 'Fresh task',
      projectName: 'CodyWeb',
      cwd: '/workspace/CodyWeb',
      createdAtIso: '2026-07-07T09:01:44.000Z',
      updatedAtIso: '2026-07-07T09:02:00.000Z',
      preview: 'first prompt',
      unread: false,
      inProgress: false,
    })

    expect(readStartedThread(notification('thread/started', {
      threadId: 'thread-2',
      cwd: '/workspace/other',
    }))).toMatchObject({
      id: 'thread-2',
      title: 'Untitled thread',
      projectName: '/workspace/other',
      cwd: '/workspace/other',
      preview: 'Untitled thread',
    })
  })

  it('reads live activity and assistant message deltas', () => {
    expect(readTurnActivity(notification('item/agentMessage/delta', {
      threadId: 'thread-1',
      itemId: 'item-1',
      delta: 'hello',
    }))).toMatchObject({
      threadId: 'thread-1',
      activity: { label: 'Writing response' },
    })

    expect(readTurnActivity(notification('item/reasoning/textDelta', {
      threadId: 'thread-1',
      itemId: 'reason-1',
      delta: 'thinking',
    }))).toMatchObject({
      threadId: 'thread-1',
      activity: { label: 'Thinking' },
    })

    expect(readAgentMessageDelta(notification('item/agentMessage/delta', {
      threadId: 'thread-1',
      itemId: 'item-1',
      delta: 'hello',
    }))).toEqual({
      messageId: 'item-1',
      delta: 'hello',
    })
    expect(readAgentMessageDelta(notification('item/agentMessage/delta', {
      thread_id: 'thread-1',
      item_id: 'item-raw',
      delta: ' raw',
    }))).toEqual({
      messageId: 'item-raw',
      delta: ' raw',
    })
    expect(readAgentMessageDelta(notification('item/agentMessage/delta', {
      threadId: 'thread-1',
      item: { id: 'item-nested' },
      textDelta: ' nested',
    }))).toEqual({
      messageId: 'item-nested',
      delta: ' nested',
    })
    expect(readAgentMessageDelta(notification('item/agentMessage/delta', {
      threadId: 'thread-1',
      item_id: 'item-snake-delta',
      text_delta: ' snake',
    }))).toEqual({
      messageId: 'item-snake-delta',
      delta: ' snake',
    })

    expect(readAgentMessageCompleted(notification('item/completed', {
      item: {
        type: 'agentMessage',
        id: 'item-1',
        text: 'hello world',
      },
    }))).toMatchObject({
      id: 'item-1',
      role: 'assistant',
      text: 'hello world',
      messageType: 'agentMessage.live',
    })
  })

  it('reads completed user messages for immediate conversation rendering', () => {
    const messages = readUserMessageCompleted(notification('item/completed', {
      turnId: 'turn-1',
      item: {
        type: 'userMessage',
        id: 'user-1',
        content: [
          { type: 'skill', name: 'browser', path: '/skills/browser' },
          { type: 'text', text: 'Run this check', text_elements: [] },
          { type: 'localImage', path: '/tmp/screenshot.png' },
          { type: 'unknownBlock', value: 42 },
        ],
      },
    }))

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      turnId: 'turn-1',
      role: 'user',
      text: 'Run this check',
      images: ['/codex-api/local-image?path=%2Ftmp%2Fscreenshot.png'],
      skills: [
        {
          name: 'browser',
          path: '/skills/browser',
          displayName: 'browser',
          description: '',
        },
      ],
      messageType: 'userMessage',
    })
    expect(messages[1]).toMatchObject({
      id: 'user-1:user-content:3',
      turnId: 'turn-1',
      role: 'user',
      messageType: 'userContent.unknownBlock',
      isUnhandled: true,
    })
  })

  it('reads reasoning deltas and plan updates', () => {
    expect(readReasoningDelta(notification('item/reasoning/summaryTextDelta', {
      itemId: 'reason-1',
      delta: 'thinking',
    }))).toEqual({
      messageId: 'reason-1:live-reasoning',
      delta: 'thinking',
    })

    expect(readReasoningDelta(notification('item/reasoning/textDelta', {
      itemId: 'reason-1',
      delta: ' deeper',
    }))).toEqual({
      messageId: 'reason-1:live-reasoning',
      delta: ' deeper',
    })
    expect(readReasoningDelta(notification('item/reasoning/textDelta', {
      item: { id: 'reason-2' },
      content: ' nested reasoning',
    }))).toEqual({
      messageId: 'reason-2:live-reasoning',
      delta: ' nested reasoning',
    })

    expect(readPlanUpdatedMessage(notification('turn/plan/updated', {
      turnId: 'turn-1',
      explanation: 'Plan changed',
      plan: [
        { status: 'completed', step: 'Read code' },
        { status: 'inProgress', step: 'Patch code' },
        { status: 'pending', step: 'Run tests' },
      ],
    }), () => 'plan-message-1')).toMatchObject({
      id: 'plan-message-1',
      role: 'assistant',
      messageType: 'plan.live',
      text: 'Plan changed\n\n1. [done] Read code\n2. [doing] Patch code\n3. [todo] Run tests',
    })
    expect(readStructuredPlanUpdate(notification('turn/plan/updated', {
      threadId: 'thread-1', turnId: 'turn-1', explanation: 'Plan changed',
      plan: [{ status: 'completed', step: 'Read code' }, { status: 'inProgress', step: 'Patch code' }],
    }))).toMatchObject({
      threadId: 'thread-1', turnId: 'turn-1', explanation: 'Plan changed',
      steps: [{ status: 'completed', step: 'Read code' }, { status: 'inProgress', step: 'Patch code' }],
    })

    expect(isAgentContentEvent(notification('turn/plan/updated', { turnId: 'turn-1' }))).toBe(true)
    expect(isAgentContentEvent(notification('account/rateLimits/updated', {}))).toBe(false)
  })
})
