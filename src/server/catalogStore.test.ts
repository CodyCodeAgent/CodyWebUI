import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listCatalog,
  setCatalogProjectDisplayName,
  setCatalogProjectHidden,
  setCatalogProjectOrder,
  setCatalogThreadHidden,
  syncCatalogThreads,
  type CatalogSourceThread,
} from './catalogStore'

let tempDir = ''

function thread(overrides: Partial<CatalogSourceThread> = {}): CatalogSourceThread {
  return {
    id: 'thread-1',
    cwd: '/repo/alpha',
    title: 'First thread',
    preview: 'First thread',
    createdAtIso: '2026-07-01T00:00:00.000Z',
    updatedAtIso: '2026-07-02T00:00:00.000Z',
    sourceArchived: false,
    ...overrides,
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cody-web-ui-catalog-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
})

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await rm(tempDir, { recursive: true, force: true })
})

describe('catalog store', () => {
  it('bootstraps an empty database and imports archived threads as hidden', async () => {
    await expect(syncCatalogThreads([
      thread(),
      thread({ id: 'thread-2', title: 'Archived thread', sourceArchived: true }),
    ])).resolves.toEqual({ projectCount: 1, threadCount: 2 })

    const visible = await listCatalog('visible')
    expect(visible.projects).toHaveLength(1)
    expect(visible.projects[0]?.threads.map((row) => row.id)).toEqual(['thread-1'])

    const hidden = await listCatalog('hidden')
    expect(hidden.projects[0]?.threads.map((row) => row.id)).toEqual(['thread-2'])
    expect(hidden.projects[0]?.threads[0]?.sourceArchived).toBe(true)
  })

  it('preserves local visibility while refreshing source metadata', async () => {
    await syncCatalogThreads([thread()])
    await setCatalogThreadHidden('thread-1', true)
    await syncCatalogThreads([thread({ title: 'Renamed by Codex', updatedAtIso: '2026-07-03T00:00:00.000Z' })])

    expect((await listCatalog('visible')).threadCount).toBe(0)
    const hidden = await listCatalog('hidden')
    expect(hidden.projects[0]?.threads[0]).toMatchObject({
      id: 'thread-1',
      title: 'Renamed by Codex',
      hidden: true,
    })

    await setCatalogThreadHidden('thread-1', false)
    expect((await listCatalog('visible')).projects[0]?.threads[0]?.title).toBe('Renamed by Codex')
  })

  it('hides and restores whole projects without mutating child visibility', async () => {
    await syncCatalogThreads([
      thread(),
      thread({ id: 'thread-2', cwd: '/repo/beta', title: 'Beta' }),
    ])
    await setCatalogProjectHidden('/repo/alpha', true)

    expect((await listCatalog('visible')).projects.map((project) => project.projectKey)).toEqual(['/repo/beta'])
    expect((await listCatalog('hidden')).projects[0]?.projectKey).toBe('/repo/alpha')

    await setCatalogProjectHidden('/repo/alpha', false)
    expect((await listCatalog('visible')).projects.map((project) => project.projectKey).sort()).toEqual([
      '/repo/alpha',
      '/repo/beta',
    ])
  })

  it('persists project presentation and filters missing source rows', async () => {
    await syncCatalogThreads([
      thread(),
      thread({ id: 'thread-2', cwd: '/repo/beta', title: 'Beta' }),
    ])
    await setCatalogProjectDisplayName('/repo/beta', 'Beta display')
    await setCatalogProjectOrder(['/repo/beta', '/repo/alpha'])

    const ordered = await listCatalog('visible')
    expect(ordered.projects.map((project) => [project.projectKey, project.displayName])).toEqual([
      ['/repo/beta', 'Beta display'],
      ['/repo/alpha', ''],
    ])

    await syncCatalogThreads([thread()])
    expect((await listCatalog('visible')).projects.map((project) => project.projectKey)).toEqual(['/repo/alpha'])

    await syncCatalogThreads([
      thread(),
      thread({ id: 'thread-2', cwd: '/repo/beta', title: 'Beta returns' }),
    ])
    expect((await listCatalog('visible')).projects[0]?.displayName).toBe('Beta display')
  })
})
