import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCatalog,
  fetchCatalogStatus,
  saveCatalogProjectOrder,
  setProjectHidden,
  setThreadHidden,
} from './codexCatalogClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('codex catalog client', () => {
  it('normalizes visible catalog projects and sync status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      result: {
        catalog: {
          projects: [{
            projectKey: '/repo',
            cwd: '/repo',
            displayName: 'Repo',
            sortOrder: 0,
            threads: [{
              id: 'thread-1',
              cwd: '/repo',
              title: 'Hello',
              preview: 'Hello',
              createdAtIso: '2026-07-01T00:00:00.000Z',
              updatedAtIso: '2026-07-02T00:00:00.000Z',
            }],
          }],
        },
        sync: {
          name: 'project-thread-catalog-sync',
          running: false,
          runCount: 1,
          successCount: 1,
          failureCount: 0,
          lastError: '',
        },
      },
    })))

    await expect(fetchCatalog('visible')).resolves.toMatchObject({
      groups: [{
        projectName: '/repo',
        cwd: '/repo',
        threads: [{ id: 'thread-1', title: 'Hello', projectName: '/repo' }],
      }],
      projectDisplayNameById: { '/repo': 'Repo' },
      projectOrder: ['/repo'],
      hasStoredProjectOrder: true,
      sync: { successCount: 1 },
    })
  })

  it('sends visibility and ordering mutations only to CodyWebUI catalog APIs', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ result: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)

    await setProjectHidden('/repo', true)
    await setThreadHidden('thread-1', true)
    await saveCatalogProjectOrder(['/repo', '/other'])

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/codex-api/catalog/projects/visibility',
      '/codex-api/catalog/threads/visibility',
      '/codex-api/catalog/projects/order',
    ])
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))).toEqual([
      { projectKey: '/repo', hidden: true },
      { threadId: 'thread-1', hidden: true },
      { projectKeys: ['/repo', '/other'] },
    ])
  })

  it('reads background catalog status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      result: {
        sync: {
          name: 'project-thread-catalog-sync',
          running: true,
          runCount: 3,
          successCount: 2,
          failureCount: 0,
          lastError: '',
          nextRunAtIso: '2026-07-10T00:00:30.000Z',
        },
      },
    })))

    await expect(fetchCatalogStatus()).resolves.toMatchObject({
      running: true,
      runCount: 3,
      nextRunAtIso: '2026-07-10T00:00:30.000Z',
    })
  })
})
