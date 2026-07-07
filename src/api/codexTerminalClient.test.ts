import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTerminalSessions,
  runWorkspaceScript,
  startTerminalSession,
  stopTerminalSession,
} from './codexTerminalClient'

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

describe('codex terminal client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads terminal sessions for a workspace', async () => {
    mockFetch(new Response(JSON.stringify({
      result: { sessions: [] },
    }), { status: 200 }))

    await expect(fetchTerminalSessions('/repo')).resolves.toEqual({ sessions: [] })
  })

  it('starts and stops terminal sessions', async () => {
    const startFetch = mockFetch(new Response(JSON.stringify({
      result: {
        id: 'session-1',
        status: 'running',
        output: '',
      },
    }), { status: 200 }))

    await expect(startTerminalSession('/repo', 'dev')).resolves.toMatchObject({
      id: 'session-1',
      output: '',
    })
    expect(startFetch).toHaveBeenCalledWith('/codex-api/tooling/terminal-sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', scriptName: 'dev' }),
    }))

    const stopFetch = mockFetch(new Response(JSON.stringify({
      result: {
        id: 'session-1',
        status: 'stopped',
      },
    }), { status: 200 }))

    await expect(stopTerminalSession('/repo', 'session-1')).resolves.toMatchObject({
      id: 'session-1',
      status: 'stopped',
    })
    expect(stopFetch).toHaveBeenCalledWith('/codex-api/tooling/terminal-sessions/stop', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', sessionId: 'session-1' }),
    }))
  })

  it('runs workspace scripts through the tooling endpoint', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        scriptName: 'test',
        status: 'completed',
      },
    }), { status: 200 }))

    await expect(runWorkspaceScript('/repo', 'test')).resolves.toMatchObject({
      scriptName: 'test',
      status: 'completed',
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/workspace-script/run', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo', scriptName: 'test' }),
    }))
  })
})
