import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTurnInput,
  startThread,
  startThreadTurn,
} from './codexThreadClient'

const rpcMock = vi.hoisted(() => ({
  rpcCall: vi.fn(),
}))

vi.mock('./codexRpcClient', () => rpcMock)

afterEach(() => {
  vi.clearAllMocks()
})

describe('codex thread client', () => {
  it('builds turn input from skills, text, and local images', () => {
    expect(buildTurnInput(
      '  explain this  ',
      [
        { id: 'img-1', name: 'screen.png', path: ' /tmp/screen.png ', url: '/image', mimeType: 'image/png' },
        { id: 'img-empty', name: 'empty.png', path: ' ', url: '/empty', mimeType: 'image/png' },
      ],
      [
        { name: ' docs ', path: ' /skills/docs ', displayName: 'Docs', description: '' },
        { name: 'missing-path', path: ' ', displayName: 'Missing', description: '' },
      ],
    )).toEqual([
      { type: 'skill', name: 'docs', path: '/skills/docs' },
      { type: 'text', text: 'explain this', text_elements: [] },
      { type: 'localImage', path: '/tmp/screen.png' },
    ])
  })

  it('starts threads with normalized optional params', async () => {
    rpcMock.rpcCall.mockResolvedValue({ thread: { id: 'thread-1' } })

    await expect(startThread(' /repo ', ' gpt-5 ')).resolves.toBe('thread-1')

    expect(rpcMock.rpcCall).toHaveBeenCalledWith('thread/start', {
      cwd: '/repo',
      model: 'gpt-5',
    })
  })

  it('starts turns with plan collaboration settings when selected', async () => {
    rpcMock.rpcCall.mockResolvedValue({ turn: { id: ' turn-1 ' } })

    await expect(startThreadTurn(
      'thread-1',
      'hello',
      [],
      [],
      'gpt-5',
      'medium',
      {
        mode: 'plan',
        settings: {
          model: 'gpt-5',
          reasoning_effort: 'medium',
          developer_instructions: null,
        },
      },
    )).resolves.toBe('turn-1')

    expect(rpcMock.rpcCall).toHaveBeenCalledWith('turn/start', {
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'hello', text_elements: [] }],
      model: 'gpt-5',
      effort: 'medium',
      collaborationMode: {
        mode: 'plan',
        settings: {
          model: 'gpt-5',
          reasoning_effort: 'medium',
          developer_instructions: null,
        },
      },
    })
  })
})
