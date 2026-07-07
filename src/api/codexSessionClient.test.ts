import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCodexSessionEvents,
  fetchWorkspaceAuditEvents,
  fetchWorkspaceRecentSessions,
  testWorkspaceNotifications,
} from './codexSessionClient'

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

describe('codex session client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads workspace audit events with bounded limits', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        events: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceAuditEvents('/repo', 500)).resolves.toMatchObject({
      generatedAtIso: '2026-07-07T00:00:00.000Z',
      events: [],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/audit-events?cwd=%2Frepo&limit=200', undefined)
  })

  it('loads session replay events and omits blank thread ids', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        events: [],
      },
    }), { status: 200 }))

    await expect(fetchCodexSessionEvents('/repo', '  ', 80)).resolves.toMatchObject({
      events: [],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/session-events?cwd=%2Frepo&limit=80', undefined)
  })

  it('loads recent session summaries', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        sessions: [],
      },
    }), { status: 200 }))

    await expect(fetchWorkspaceRecentSessions('/repo', 12)).resolves.toMatchObject({
      sessions: [],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/recent-sessions?cwd=%2Frepo&limit=12', undefined)
  })

  it('posts notification test requests and rejects malformed responses', async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({
      result: {
        generatedAtIso: '2026-07-07T00:00:00.000Z',
        results: [],
      },
    }), { status: 200 }))

    await expect(testWorkspaceNotifications('/repo')).resolves.toMatchObject({
      results: [],
    })
    expect(fetchSpy).toHaveBeenCalledWith('/codex-api/tooling/notifications/test', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ cwd: '/repo' }),
    }))

    mockFetch(new Response(JSON.stringify({
      result: {
        generatedAtIso: '2026-07-07T00:00:00.000Z',
      },
    }), { status: 200 }))

    await expect(testWorkspaceNotifications('/repo')).rejects.toMatchObject({
      name: 'CodexApiError',
      code: 'invalid_response',
      method: 'tooling/notifications:test',
    })
  })
})
