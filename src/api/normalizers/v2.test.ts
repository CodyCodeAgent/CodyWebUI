import { describe, expect, it } from 'vitest'
import type { ThreadReadResponse } from '../appServerDtos'
import { normalizeThreadMessagesV2 } from './v2'

function buildThreadReadResponse(): ThreadReadResponse {
  return {
    thread: {
      id: 'thread-1',
      preview: 'Build the audit timeline',
      modelProvider: 'openai',
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_120,
      path: null,
      cwd: '/workspace/example',
      cliVersion: '0.0.0-test',
      source: 'appServer',
      gitInfo: null,
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          error: null,
          items: [
            {
              type: 'userMessage',
              id: 'user-1',
              content: [{ type: 'text', text: 'Run tests', text_elements: [] }],
            },
            {
              type: 'commandExecution',
              id: 'cmd-1',
              command: 'npm test',
              cwd: '/workspace/example',
              processId: 'pty-1',
              status: 'completed',
              commandActions: [],
              aggregatedOutput: '2 tests passed',
              exitCode: 0,
              durationMs: 1520,
            },
            {
              type: 'fileChange',
              id: 'patch-1',
              status: 'completed',
              changes: [
                {
                  path: 'src/app.ts',
                  kind: { type: 'update', move_path: null },
                  diff: '@@ -1 +1 @@\n-old\n+new',
                },
              ],
            },
            {
              type: 'mcpToolCall',
              id: 'mcp-1',
              server: 'github',
              tool: 'list_pull_requests',
              status: 'completed',
              arguments: { state: 'open' },
              result: { content: ['ok'], structuredContent: null },
              error: null,
              durationMs: 80,
            },
            {
              type: 'agentMessage',
              id: 'agent-1',
              text: 'Done.',
            },
          ],
        },
      ],
    },
  }
}

describe('normalizeThreadMessagesV2', () => {
  it('preserves app-server tool items as auditable timeline messages', () => {
    const messages = normalizeThreadMessagesV2(buildThreadReadResponse())

    expect(messages.map((message) => message.id)).toEqual([
      'user-1',
      'cmd-1',
      'patch-1',
      'mcp-1',
      'agent-1',
      'turn-summary:turn-1',
    ])

    expect(messages.at(-1)).toMatchObject({
      messageType: 'worked',
      role: 'system',
    })

    expect(messages[1]).toMatchObject({
      role: 'system',
      messageType: 'tool.commandExecution',
      tool: {
        kind: 'command',
        title: 'Command execution',
        status: 'completed',
        summary: 'npm test',
        output: '2 tests passed',
      },
    })
    expect(messages[1].tool?.details).toContain('exit: 0')

    expect(messages[2]).toMatchObject({
      role: 'system',
      messageType: 'tool.fileChange',
      tool: {
        kind: 'fileChange',
        title: 'File changes',
        status: 'completed',
        summary: '1 file changed',
        outputLabel: 'Diff',
      },
    })
    expect(messages[2].tool?.details).toContain('update: src/app.ts')
    expect(messages[2].tool?.output).toContain('+new')

    expect(messages[3]).toMatchObject({
      role: 'system',
      messageType: 'tool.mcpToolCall',
      tool: {
        kind: 'mcp',
        title: 'MCP tool call',
        status: 'completed',
        summary: 'github.list_pull_requests',
      },
    })
  })
})
