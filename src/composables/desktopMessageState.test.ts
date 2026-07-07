import { describe, expect, it } from 'vitest'
import {
  areMessageArraysEqual,
  areTurnActivitiesEqual,
  appendLiveReasoningDelta,
  appendLiveReasoningSectionBreak,
  buildDisplayedMessages,
  buildRollbackAuditMessage,
  buildLiveOverlay,
  buildTurnSummaryMessage,
  formatTurnDuration,
  insertTurnSummaryMessage,
  mergeMessages,
  mergeTurnActivity,
  normalizeMessageText,
  removeRedundantLiveAgentMessages,
  resolveTurnDurationMs,
  upsertLiveAssistantDelta,
  upsertMessage,
  updateTurnActivityState,
  updateTurnErrorState,
  updateTurnSummaryState,
} from './desktopMessageState'
import type { UiMessage, UiToolingRollbackFileResult } from '../types/codex'

function message(overrides: Partial<UiMessage> = {}): UiMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    text: 'hello',
    ...overrides,
  }
}

function rollbackResult(overrides: Partial<UiToolingRollbackFileResult> = {}): UiToolingRollbackFileResult {
  return {
    cwd: '/workspace/app',
    repoRoot: '/workspace/app',
    filePath: 'src/app.ts',
    relativePath: 'src/app.ts',
    rollbackApplied: true,
    remainingStatus: '',
    checkpoint: {
      id: 'checkpoint-1',
      label: 'Before rollback',
      cwd: '/workspace/app',
      repoRoot: '/workspace/app',
      createdAtIso: '2026-07-07T00:00:00.000Z',
      paths: ['src/app.ts'],
      patchPath: '/workspace/app/.git/codex-web-checkpoints/checkpoint-1/workspace.patch',
      patchBytes: 128,
      hasPatch: true,
    },
    ...overrides,
  }
}

describe('desktopMessageState', () => {
  it('keeps previous message references when incoming fields are unchanged', () => {
    const previous = [message()]
    const incoming = [message()]

    const merged = mergeMessages(previous, incoming)

    expect(merged).toBe(previous)
    expect(merged[0]).toBe(previous[0])
    expect(areMessageArraysEqual(previous, merged)).toBe(true)
  })

  it('preserves missing messages during silent refreshes and appends new rows', () => {
    const previousOnly = message({ id: 'live', text: 'still streaming' })
    const persisted = message({ id: 'persisted', text: 'saved' })

    const merged = mergeMessages([previousOnly], [persisted], { preserveMissing: true })

    expect(merged.map((row) => row.id)).toEqual(['live', 'persisted'])
  })

  it('removes redundant live assistant messages once persisted text arrives', () => {
    const live = message({
      id: 'live-agent',
      text: 'hello   world',
      messageType: 'agentMessage.live',
    })
    const unrelated = message({ id: 'tool', role: 'system', text: '', messageType: 'tool.command' })
    const incoming = [message({ id: 'saved-agent', text: 'hello world' })]

    expect(removeRedundantLiveAgentMessages([live, unrelated], incoming)).toEqual([unrelated])
    expect(normalizeMessageText(' hello\n\nworld ')).toBe('hello world')
  })

  it('upserts changed messages and keeps unchanged upserts stable', () => {
    const existing = message()
    const unchanged = upsertMessage([existing], message())
    const changed = upsertMessage([existing], message({ text: 'updated' }))

    expect(unchanged).toBeInstanceOf(Array)
    expect(unchanged[0]).toBe(existing)
    expect(changed[0].text).toBe('updated')
  })

  it('appends live assistant deltas without duplicating message rows', () => {
    const first = upsertLiveAssistantDelta([], {
      messageId: 'agent-1',
      textDelta: 'hello',
      messageType: 'agentMessage.live',
    })
    const second = upsertLiveAssistantDelta(first, {
      messageId: 'agent-1',
      textDelta: ' world',
      messageType: 'agentMessage.live',
    })

    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      id: 'agent-1',
      role: 'assistant',
      text: 'hello world',
      messageType: 'agentMessage.live',
    })
  })

  it('preserves live reasoning whitespace until display time', () => {
    expect(appendLiveReasoningDelta('', '  thinking')).toBe('  thinking')
    expect(appendLiveReasoningDelta('  thinking', '\nnext')).toBe('  thinking\nnext')
    expect(appendLiveReasoningDelta('', '   ')).toBe('')
    expect(appendLiveReasoningSectionBreak('  thinking')).toBe('  thinking\n\n')
    expect(appendLiveReasoningSectionBreak('  thinking\n\n')).toBe('  thinking\n\n')
  })

  it('shows live assistant output before it is persisted by thread/read', () => {
    const persisted = [message({ id: 'user-1', role: 'user', text: 'question' })]
    const live = [
      message({
        id: 'agent-1',
        role: 'assistant',
        text: 'streaming answer',
        messageType: 'agentMessage.live',
      }),
    ]

    const displayed = buildDisplayedMessages(persisted, live, null)

    expect(displayed.map((row) => row.id)).toEqual(['user-1', 'agent-1'])
    expect(displayed[1]).toMatchObject({
      role: 'assistant',
      text: 'streaming answer',
      messageType: 'agentMessage.live',
    })
  })

  it('formats turn summaries and inserts them before the last assistant response', () => {
    const user = message({ id: 'user', role: 'user', text: 'question' })
    const assistant = message({ id: 'assistant', role: 'assistant', text: 'answer' })
    const staleSummary = buildTurnSummaryMessage({ turnId: 'old', durationMs: 1 })

    const next = insertTurnSummaryMessage([user, staleSummary, assistant], {
      turnId: 'turn-1',
      durationMs: 65_000,
    })

    expect(formatTurnDuration(65_000)).toBe('1m 5s')
    expect(next.map((row) => row.id)).toEqual(['user', 'turn-summary:turn-1', 'assistant'])
    expect(next[1].text).toBe('Worked for 1m 5s')
  })

  it('compares turn activities by label and details', () => {
    expect(areTurnActivitiesEqual(
      { label: 'Thinking', details: ['model'] },
      { label: 'Thinking', details: ['model'] },
    )).toBe(true)
    expect(areTurnActivitiesEqual(
      { label: 'Thinking', details: ['model'] },
      { label: 'Writing', details: ['model'] },
    )).toBe(false)
  })

  it('normalizes and merges turn activity details', () => {
    expect(mergeTurnActivity(undefined, {
      label: '   ',
      details: [' Thinking ', '', 'Thinking'],
    })).toEqual({
      label: 'Thinking',
      details: [],
    })

    expect(mergeTurnActivity(
      { label: 'Thinking', details: ['old', 'keep', 'same'] },
      { label: ' Writing response ', details: ['keep', 'new\nline', 'same', 'last'] },
    )).toEqual({
      label: 'Writing response',
      details: ['same', 'new line', 'last'],
    })
  })

  it('updates turn summary state without churning unchanged records', () => {
    const summary = { turnId: 'turn-1', durationMs: 1000 }
    const state = updateTurnSummaryState({}, 'thread-1', summary)

    expect(state).toEqual({ 'thread-1': summary })
    expect(updateTurnSummaryState(state, 'thread-1', summary)).toBe(state)
    expect(updateTurnSummaryState(state, 'thread-1', null)).toEqual({})
    expect(updateTurnSummaryState(state, '', null)).toBe(state)
  })

  it('updates turn activity state with normalized merged details', () => {
    const state = updateTurnActivityState({}, 'thread-1', {
      label: ' Thinking ',
      details: [' model ', '', 'Thinking'],
    })

    expect(state).toEqual({
      'thread-1': { label: 'Thinking', details: ['model'] },
    })
    expect(updateTurnActivityState(state, 'thread-1', {
      label: 'Thinking',
      details: ['model'],
    })).toBe(state)
    expect(updateTurnActivityState(state, 'thread-1', null)).toEqual({})
  })

  it('updates turn error state with normalized messages', () => {
    const state = updateTurnErrorState({}, 'thread-1', ' failed\nagain ')

    expect(state).toEqual({
      'thread-1': { message: 'failed again' },
    })
    expect(updateTurnErrorState(state, 'thread-1', 'failed again')).toBe(state)
    expect(updateTurnErrorState(state, 'thread-1', '   ')).toEqual({})
  })

  it('builds live overlay only when selected thread has live state', () => {
    expect(buildLiveOverlay('', {}, {}, {})).toBeNull()
    expect(buildLiveOverlay('thread-1', {}, {}, {})).toBeNull()
    expect(buildLiveOverlay(
      'thread-1',
      { 'thread-1': { label: 'Writing', details: ['tool'] } },
      { 'thread-1': '  reasoning  ' },
      { 'thread-1': { message: '  failed  ' } },
    )).toEqual({
      activityLabel: 'Writing',
      activityDetails: ['tool'],
      reasoningText: 'reasoning',
      errorText: 'failed',
    })
    expect(buildLiveOverlay(
      'thread-1',
      {},
      { 'thread-1': 'thinking' },
      {},
    )?.activityLabel).toBe('Thinking')
  })

  it('resolves turn duration from the strongest available source', () => {
    expect(resolveTurnDurationMs({
      explicitDurationMs: 100,
      turnDurationMs: 200,
      completedStartedAtMs: 0,
      completedAtMs: 500,
      pendingStartedAtMs: 0,
    })).toBe(100)
    expect(resolveTurnDurationMs({
      turnDurationMs: null,
      completedStartedAtMs: 400,
      completedAtMs: 100,
      pendingStartedAtMs: 0,
    })).toBe(0)
    expect(resolveTurnDurationMs({
      completedAtMs: 500,
      pendingStartedAtMs: 100,
    })).toBe(400)
  })

  it('builds rollback audit messages', () => {
    const audit = buildRollbackAuditMessage(rollbackResult({ rollbackApplied: false }))

    expect(audit).toMatchObject({
      id: 'tooling.rollback:checkpoint-1:src/app.ts',
      role: 'system',
      messageType: 'tool.rollback',
      tool: {
        kind: 'rollback',
        status: 'no changes',
        summary: 'No local changes found for src/app.ts',
      },
    })
  })
})
