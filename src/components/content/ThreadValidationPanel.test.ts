import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../../types/codex'
import ThreadValidationPanel from './ThreadValidationPanel.vue'

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
      details: ['cwd: /workspace/app', 'exit: 0', 'duration: 2s'],
      output: 'all tests passed',
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
      details: ['cwd: /workspace/app', 'exit: 1', 'duration: 5s'],
      output: 'error TS2304: Cannot find name MissingType.',
    },
  },
]

describe('ThreadValidationPanel', () => {
  it('renders validation evidence from command messages', async () => {
    const html = await renderToString(h(ThreadValidationPanel, { messages }))

    expect(html).toContain('Validation')
    expect(html).toContain('1 passed')
    expect(html).toContain('1 failed')
    expect(html).toContain('npm test')
    expect(html).toContain('npm run build')
    expect(html).toContain('/workspace/app')
    expect(html).toContain('error TS2304')
  })
})
