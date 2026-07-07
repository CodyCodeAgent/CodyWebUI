import { describe, expect, it } from 'vitest'
import {
  buildThreadCommandEntries,
  buildThreadActivityEntries,
  buildThreadActivitySummary,
  buildWorkLogStatusText,
  formatWorkLogLineNumber,
  isToolFailureStatus,
  shouldCloseWorkLogFullscreenFile,
  workLogBadgeCount,
  workLogDiffLinePrefix,
  workLogFullscreenFile,
} from './useThreadActivity'
import type { UiDiffReview } from './useDiffReview'
import type { UiMessage, UiServerRequest } from '../types/codex'

const messages: UiMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    text: 'Run the checks',
  },
  {
    id: 'cmd-1',
    role: 'system',
    text: '',
    tool: {
      kind: 'command',
      title: 'Command execution',
      status: 'completed',
      summary: 'npm test',
      details: ['cwd: /workspace/app', 'exit: 0', 'duration: 1.2s'],
    },
  },
  {
    id: 'patch-1',
    role: 'system',
    text: '',
    tool: {
      kind: 'fileChange',
      title: 'File changes',
      status: 'failed',
      summary: '1 file changed',
      details: ['update: src/app.ts'],
    },
  },
  {
    id: 'mcp-1',
    role: 'system',
    text: '',
    tool: {
      kind: 'mcp',
      title: 'MCP tool call',
      status: 'completed',
      summary: 'github.list_pull_requests',
      details: ['server: github'],
    },
  },
]

const pendingRequests: UiServerRequest[] = [
  {
    id: 1,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'cmd-2',
    receivedAtIso: '2026-07-04T12:00:00.000Z',
    params: { reason: 'needs approval' },
  },
]

const diffReview: UiDiffReview = {
  files: [
    {
      filePath: 'src/app.ts',
      oldPath: '',
      status: 'modified',
      addedLines: 2,
      removedLines: 1,
      hunks: [],
      patch: 'diff --git a/src/app.ts b/src/app.ts',
      messageIds: ['patch-1'],
    },
  ],
  summary: {
    fileCount: 1,
    hunkCount: 0,
    addedLines: 2,
    removedLines: 1,
    patch: 'diff --git a/src/app.ts b/src/app.ts',
  },
}

describe('thread activity helpers', () => {
  it('extracts tool evidence entries from mixed messages', () => {
    const entries = buildThreadActivityEntries(messages)

    expect(entries.map((entry) => entry.messageId)).toEqual(['cmd-1', 'patch-1', 'mcp-1'])
    expect(entries[0]).toMatchObject({
      kind: 'command',
      summary: 'npm test',
    })
  })

  it('summarizes evidence and pending requests for the activity panel', () => {
    expect(buildThreadActivitySummary(messages, pendingRequests)).toEqual({
      toolCount: 3,
      commandCount: 1,
      fileChangeCount: 1,
      mcpCount: 1,
      failedCount: 1,
      pendingRequestCount: 1,
    })
  })

  it('extracts command entries with runnable details', () => {
    expect(buildThreadCommandEntries(messages)).toEqual([
      expect.objectContaining({
        messageId: 'cmd-1',
        summary: 'npm test',
        cwd: '/workspace/app',
        exitCode: 0,
        duration: '1.2s',
      }),
    ])
  })

  it('treats failure-like statuses as failed evidence', () => {
    expect(isToolFailureStatus('failed')).toBe(true)
    expect(isToolFailureStatus('declined')).toBe(true)
    expect(isToolFailureStatus('completed')).toBe(false)
  })

  it('formats work log status and diff display helpers', () => {
    expect(buildWorkLogStatusText({
      pendingRequestCount: 2,
      fileCount: 1,
      commandCount: 1,
    })).toBe('2 waiting')
    expect(buildWorkLogStatusText({
      pendingRequestCount: 0,
      fileCount: 1,
      commandCount: 1,
    })).toBe('1 changed file · 1 command')
    expect(buildWorkLogStatusText({
      pendingRequestCount: 0,
      fileCount: 0,
      commandCount: 0,
    })).toBe('No changes or commands recorded yet')

    expect(formatWorkLogLineNumber(null)).toBe('')
    expect(formatWorkLogLineNumber(12)).toBe('12')
    expect(workLogDiffLinePrefix('add')).toBe('+')
    expect(workLogDiffLinePrefix('remove')).toBe('-')
    expect(workLogDiffLinePrefix('context')).toBe('')
  })

  it('tracks work log badge and fullscreen file state from the diff review', () => {
    expect(workLogBadgeCount(diffReview, 3)).toBe(4)
    expect(workLogFullscreenFile(diffReview, 'src/app.ts')?.status).toBe('modified')
    expect(workLogFullscreenFile(diffReview, 'missing.ts')).toBeNull()
    expect(shouldCloseWorkLogFullscreenFile(diffReview, '')).toBe(false)
    expect(shouldCloseWorkLogFullscreenFile(diffReview, 'src/app.ts')).toBe(false)
    expect(shouldCloseWorkLogFullscreenFile(diffReview, 'missing.ts')).toBe(true)
  })
})
