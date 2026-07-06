import { describe, expect, it } from 'vitest'
import {
  buildThreadActivityEntries,
  buildThreadActivitySummary,
  isToolFailureStatus,
} from './useThreadActivity'
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
      details: ['exit: 0'],
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

  it('treats failure-like statuses as failed evidence', () => {
    expect(isToolFailureStatus('failed')).toBe(true)
    expect(isToolFailureStatus('declined')).toBe(true)
    expect(isToolFailureStatus('completed')).toBe(false)
  })
})
