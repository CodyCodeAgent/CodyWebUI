import { describe, expect, it } from 'vitest'
import {
  buildThreadCommandEntries,
  buildThreadActivityEntries,
  buildThreadActivitySummary,
  buildPendingApprovalCards,
  buildPendingApprovalSubtitle,
  buildWorkLogActionState,
  buildWorkLogDisplayPath,
  buildWorkLogDisplayPathParts,
  buildWorkLogFileStatLabel,
  buildWorkLogBadgeText,
  buildWorkLogFloatSummary,
  buildWorkLogMetrics,
  buildWorkLogTriggerLabel,
  filterWorkLogFiles,
  buildWorkLogStatusText,
  formatWorkLogLineNumber,
  isPendingApprovalRequest,
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
    expect(buildWorkLogFloatSummary({
      fileCount: 2,
      commandCount: 3,
    })).toBe('2 files · 3 commands')
    expect(buildWorkLogTriggerLabel({
      isOpen: false,
      fileCount: 2,
      commandCount: 3,
    })).toBe('Open work log: 2 files · 3 commands')
    expect(buildWorkLogTriggerLabel({
      isOpen: true,
      fileCount: 2,
      commandCount: 3,
    })).toBe('Close work log: 2 files · 3 commands')
    expect(buildWorkLogBadgeText(0)).toBe('')
    expect(buildWorkLogBadgeText(9)).toBe('9')
    expect(buildWorkLogBadgeText(100)).toBe('99+')
    expect(buildWorkLogMetrics({
      fileCount: 2,
      commandCount: 3,
      addedLines: 12,
      removedLines: 4,
    })).toEqual([
      { label: 'files', value: '2' },
      { label: 'commands', value: '3' },
      { label: 'added', value: '+12' },
      { label: 'removed', value: '-4' },
    ])
    expect(buildPendingApprovalSubtitle(1)).toBe('1 approval waiting')
    expect(buildPendingApprovalSubtitle(2)).toBe('2 approvals waiting')
    expect(buildWorkLogFileStatLabel({ addedLines: 2, removedLines: 1 })).toBe('+2 / -1')
    expect(buildWorkLogDisplayPath(
      '/data00/home/gouchao/code/life-csr/worktrees/money/src/app.ts',
      '/data00/home/gouchao/code/life-csr/worktrees/money',
    )).toBe('src/app.ts')
    expect(buildWorkLogDisplayPath('/data00/home/gouchao/code/life-csr/worktrees/money/src/app.ts')).toBe('.../money/src/app.ts')
    expect(buildWorkLogDisplayPathParts(
      '/data00/home/gouchao/code/life-csr/worktrees/money/src/app.ts',
      '/data00/home/gouchao/code/life-csr/worktrees/money',
    )).toEqual({
      label: 'app.ts',
      directory: 'src',
      title: '/data00/home/gouchao/code/life-csr/worktrees/money/src/app.ts',
    })

    expect(formatWorkLogLineNumber(null)).toBe('')
    expect(formatWorkLogLineNumber(12)).toBe('12')
    expect(workLogDiffLinePrefix('add')).toBe('+')
    expect(workLogDiffLinePrefix('remove')).toBe('-')
    expect(workLogDiffLinePrefix('context')).toBe('')
  })

  it('builds pending approval cards with stable request metadata', () => {
    const genericRequest: UiServerRequest = {
      id: 2,
      method: 'custom/request',
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'custom-1',
      receivedAtIso: '2026-07-04T12:01:00.000Z',
      params: { note: 'custom' },
    }
    const cards = buildPendingApprovalCards([...pendingRequests, genericRequest])

    expect(isPendingApprovalRequest(pendingRequests[0])).toBe(true)
    expect(isPendingApprovalRequest(genericRequest)).toBe(false)
    expect(cards).toHaveLength(2)
    expect(cards[0].request).toBe(pendingRequests[0])
    expect(cards[0].kind).toBe('command_approval')
    expect(cards[0].isApprovalRequest).toBe(true)
    expect(cards[0].summary.title).toBe('Command approval')
    expect(cards[1].request).toBe(genericRequest)
    expect(cards[1].kind).toBe('unknown')
    expect(cards[1].isApprovalRequest).toBe(false)
  })

  it('tracks work log badge and fullscreen file state from the diff review', () => {
    expect(workLogBadgeCount(diffReview)).toBe(1)
    expect(workLogFullscreenFile(diffReview, 'src/app.ts')?.status).toBe('modified')
    expect(workLogFullscreenFile(diffReview, 'missing.ts')).toBeNull()
    expect(shouldCloseWorkLogFullscreenFile(diffReview, '')).toBe(false)
    expect(shouldCloseWorkLogFullscreenFile(diffReview, 'src/app.ts')).toBe(false)
    expect(shouldCloseWorkLogFullscreenFile(diffReview, 'missing.ts')).toBe(true)
  })

  it('builds the thread-header work log action state', () => {
    expect(buildWorkLogActionState({
      isOpen: false,
      fileCount: 0,
      commandCount: 0,
    })).toEqual({
      badgeCount: 0,
      badgeText: '',
      floatSummary: '0 files · 0 commands',
      triggerLabel: 'Open work log: 0 files · 0 commands',
    })

    expect(buildWorkLogActionState({
      isOpen: true,
      fileCount: 9,
      commandCount: 2,
    })).toEqual({
      badgeCount: 9,
      badgeText: '9',
      floatSummary: '9 files · 2 commands',
      triggerLabel: 'Close work log: 9 files · 2 commands',
    })

    expect(buildWorkLogActionState({
      isOpen: false,
      fileCount: 120,
      commandCount: 1,
    })).toMatchObject({
      badgeCount: 120,
      badgeText: '99+',
      triggerLabel: 'Open work log: 120 files · 1 command',
    })
  })

  it('filters work log files by full path, display path, and old path', () => {
    const files: UiDiffReview['files'] = [
      diffReview.files[0],
      {
        ...diffReview.files[0],
        filePath: '/repo/src/routes/settings.ts',
        oldPath: '/repo/src/routes/preferences.ts',
      },
    ]

    expect(filterWorkLogFiles(files, '', '/repo').map((file) => file.filePath)).toEqual([
      'src/app.ts',
      '/repo/src/routes/settings.ts',
    ])
    expect(filterWorkLogFiles(files, 'settings', '/repo').map((file) => file.filePath)).toEqual([
      '/repo/src/routes/settings.ts',
    ])
    expect(filterWorkLogFiles(files, 'preferences', '/repo').map((file) => file.filePath)).toEqual([
      '/repo/src/routes/settings.ts',
    ])
    expect(filterWorkLogFiles(files, 'missing', '/repo')).toEqual([])
  })
})
