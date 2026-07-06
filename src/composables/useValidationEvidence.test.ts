import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import {
  buildValidationEvidence,
  buildValidationSummary,
} from './useValidationEvidence'

const messages: UiMessage[] = [
  {
    id: 'cmd-test',
    role: 'system',
    text: '',
    tool: {
      kind: 'command',
      title: 'Command execution',
      status: 'completed',
      summary: 'npm test',
      details: ['cwd: /workspace/app', 'status: completed', 'exit: 0', 'duration: 1.5s'],
      output: [
        '3 tests passed',
        'All files | 90 | 75 | 100 | 92.5 |',
      ].join('\n'),
    },
  },
  {
    id: 'cmd-build',
    role: 'system',
    text: '',
    tool: {
      kind: 'command',
      title: 'Command execution',
      status: 'completed',
      summary: 'npm run build',
      details: ['cwd: /workspace/app', 'status: completed', 'exit: 1', 'duration: 9s'],
      output: [
        'src/main.ts:10:5 - error TS2322: Type string is not assignable to type number.',
        'Build failed with 1 error.',
      ].join('\n'),
    },
  },
  {
    id: 'cmd-other',
    role: 'system',
    text: '',
    tool: {
      kind: 'command',
      title: 'Command execution',
      status: 'completed',
      summary: 'git status --short',
      details: ['cwd: /workspace/app', 'exit: 0'],
    },
  },
]

describe('validation evidence helpers', () => {
  it('extracts validation commands from command timeline entries', () => {
    const entries = buildValidationEvidence(messages)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      messageId: 'cmd-test',
      kind: 'test',
      label: 'Tests',
      command: 'npm test',
      cwd: '/workspace/app',
      status: 'passed',
      exitCode: 0,
      duration: '1.5s',
      testSummary: expect.objectContaining({
        total: 3,
        passed: 3,
      }),
      coverageSummary: expect.objectContaining({
        statements: 90,
        branches: 75,
        functions: 100,
        lines: 92.5,
      }),
    })
    expect(entries[1]).toMatchObject({
      messageId: 'cmd-build',
      kind: 'build',
      label: 'Build',
      status: 'failed',
      exitCode: 1,
    })
  })

  it('summarizes validation outcomes and failure lines', () => {
    const entries = buildValidationEvidence(messages)
    const summary = buildValidationSummary(messages)

    expect(summary).toEqual({
      totalCount: 2,
      passedCount: 1,
      failedCount: 1,
      runningCount: 0,
      unknownCount: 0,
      hasEvidence: true,
    })
    expect(entries[1].failureSummary).toEqual([
      'src/main.ts:10:5 - error TS2322: Type string is not assignable to type number.',
      'Build failed with 1 error.',
    ])
  })
})
