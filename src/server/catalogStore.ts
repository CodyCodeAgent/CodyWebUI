import type Database from 'better-sqlite3'
import { withLocalDatabase } from './localDatabase.js'

export type CatalogVisibility = 'visible' | 'hidden'

export type CatalogSourceThread = {
  id: string
  cwd: string
  title: string
  preview: string
  createdAtIso: string
  updatedAtIso: string
  sourceArchived: boolean
}

export type CatalogThread = CatalogSourceThread & {
  hidden: boolean
  hiddenAtIso: string | null
}

export type CatalogProject = {
  projectKey: string
  cwd: string
  displayName: string
  sortOrder: number | null
  hidden: boolean
  hiddenAtIso: string | null
  threads: CatalogThread[]
}

export type CatalogSnapshot = {
  projects: CatalogProject[]
  visibility: CatalogVisibility
  generatedAtIso: string
  projectCount: number
  threadCount: number
}

function ensureCatalogTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ui_projects (
      project_key TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      display_name TEXT,
      sort_order INTEGER,
      hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
      hidden_at_iso TEXT,
      source_missing INTEGER NOT NULL DEFAULT 0 CHECK (source_missing IN (0, 1)),
      first_seen_at_iso TEXT NOT NULL,
      last_seen_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ui_threads (
      thread_id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      source_updated_at_iso TEXT NOT NULL,
      source_archived INTEGER NOT NULL DEFAULT 0 CHECK (source_archived IN (0, 1)),
      hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
      hidden_at_iso TEXT,
      source_missing INTEGER NOT NULL DEFAULT 0 CHECK (source_missing IN (0, 1)),
      first_seen_at_iso TEXT NOT NULL,
      last_seen_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      FOREIGN KEY (project_key) REFERENCES ui_projects(project_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS ui_threads_project_key_idx ON ui_threads(project_key);
    CREATE INDEX IF NOT EXISTS ui_threads_visibility_idx ON ui_threads(hidden, source_missing);
  `)
}

function normalizeProjectKey(cwd: string): string {
  const normalized = cwd.trim().replace(/[\\/]+$/u, '')
  return normalized || cwd.trim() || '__unknown_project__'
}

function normalizeSourceThread(thread: CatalogSourceThread): CatalogSourceThread | null {
  const id = thread.id.trim()
  const cwd = thread.cwd.trim()
  if (!id || !cwd) return null
  const preview = thread.preview.trim()
  return {
    id,
    cwd,
    title: thread.title.trim() || preview || 'Untitled thread',
    preview,
    createdAtIso: thread.createdAtIso,
    updatedAtIso: thread.updatedAtIso,
    sourceArchived: thread.sourceArchived,
  }
}

export async function syncCatalogThreads(
  sourceThreads: CatalogSourceThread[],
  nowIso = new Date().toISOString(),
): Promise<{ projectCount: number; threadCount: number }> {
  const normalizedById = new Map<string, CatalogSourceThread>()
  for (const sourceThread of sourceThreads) {
    const thread = normalizeSourceThread(sourceThread)
    if (!thread) continue
    const previous = normalizedById.get(thread.id)
    if (!previous || (previous.sourceArchived && !thread.sourceArchived)) {
      normalizedById.set(thread.id, thread)
    }
  }

  return withLocalDatabase((db) => {
    ensureCatalogTables(db)

    const markProjectsMissing = db.prepare('UPDATE ui_projects SET source_missing = 1, updated_at_iso = ?')
    const markThreadsMissing = db.prepare('UPDATE ui_threads SET source_missing = 1, updated_at_iso = ?')
    const upsertProject = db.prepare(`
      INSERT INTO ui_projects (
        project_key, cwd, display_name, sort_order, hidden, hidden_at_iso,
        source_missing, first_seen_at_iso, last_seen_at_iso, updated_at_iso
      ) VALUES (?, ?, NULL, NULL, 0, NULL, 0, ?, ?, ?)
      ON CONFLICT(project_key) DO UPDATE SET
        cwd = excluded.cwd,
        source_missing = 0,
        last_seen_at_iso = excluded.last_seen_at_iso,
        updated_at_iso = excluded.updated_at_iso
    `)
    const upsertThread = db.prepare(`
      INSERT INTO ui_threads (
        thread_id, project_key, cwd, title, preview, created_at_iso,
        source_updated_at_iso, source_archived, hidden, hidden_at_iso,
        source_missing, first_seen_at_iso, last_seen_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        project_key = excluded.project_key,
        cwd = excluded.cwd,
        title = excluded.title,
        preview = excluded.preview,
        created_at_iso = excluded.created_at_iso,
        source_updated_at_iso = excluded.source_updated_at_iso,
        source_archived = excluded.source_archived,
        source_missing = 0,
        last_seen_at_iso = excluded.last_seen_at_iso,
        updated_at_iso = excluded.updated_at_iso
    `)

    const transaction = db.transaction(() => {
      markProjectsMissing.run(nowIso)
      markThreadsMissing.run(nowIso)

      for (const thread of normalizedById.values()) {
        const projectKey = normalizeProjectKey(thread.cwd)
        upsertProject.run(projectKey, thread.cwd, nowIso, nowIso, nowIso)
        const hidden = thread.sourceArchived ? 1 : 0
        const hiddenAtIso = thread.sourceArchived ? nowIso : null
        upsertThread.run(
          thread.id,
          projectKey,
          thread.cwd,
          thread.title,
          thread.preview,
          thread.createdAtIso,
          thread.updatedAtIso,
          thread.sourceArchived ? 1 : 0,
          hidden,
          hiddenAtIso,
          nowIso,
          nowIso,
          nowIso,
        )
      }

      db.prepare(`
        UPDATE ui_projects
        SET source_missing = CASE
          WHEN EXISTS (
            SELECT 1 FROM ui_threads
            WHERE ui_threads.project_key = ui_projects.project_key
              AND ui_threads.source_missing = 0
          ) THEN 0 ELSE 1 END
      `).run()
    })
    transaction()

    return {
      projectCount: db.prepare('SELECT COUNT(*) AS count FROM ui_projects WHERE source_missing = 0').get() as { count: number },
      threadCount: db.prepare('SELECT COUNT(*) AS count FROM ui_threads WHERE source_missing = 0').get() as { count: number },
    }
  }).then((counts) => ({
    projectCount: counts.projectCount.count,
    threadCount: counts.threadCount.count,
  }))
}

type CatalogJoinedRow = {
  projectKey: string
  projectCwd: string
  displayName: string | null
  sortOrder: number | null
  projectHidden: number
  projectHiddenAtIso: string | null
  threadId: string
  threadCwd: string
  title: string
  preview: string
  createdAtIso: string
  updatedAtIso: string
  sourceArchived: number
  threadHidden: number
  threadHiddenAtIso: string | null
}

export async function listCatalog(visibility: CatalogVisibility): Promise<CatalogSnapshot> {
  return withLocalDatabase((db) => {
    ensureCatalogTables(db)
    const visibilitySql = visibility === 'visible'
      ? 'p.hidden = 0 AND t.hidden = 0'
      : '(p.hidden = 1 OR t.hidden = 1)'
    const rows = db.prepare(`
      SELECT
        p.project_key AS projectKey,
        p.cwd AS projectCwd,
        p.display_name AS displayName,
        p.sort_order AS sortOrder,
        p.hidden AS projectHidden,
        p.hidden_at_iso AS projectHiddenAtIso,
        t.thread_id AS threadId,
        t.cwd AS threadCwd,
        t.title AS title,
        t.preview AS preview,
        t.created_at_iso AS createdAtIso,
        t.source_updated_at_iso AS updatedAtIso,
        t.source_archived AS sourceArchived,
        t.hidden AS threadHidden,
        t.hidden_at_iso AS threadHiddenAtIso
      FROM ui_projects p
      INNER JOIN ui_threads t ON t.project_key = p.project_key
      WHERE p.source_missing = 0
        AND t.source_missing = 0
        AND ${visibilitySql}
      ORDER BY
        CASE WHEN p.sort_order IS NULL THEN 1 ELSE 0 END,
        p.sort_order ASC,
        t.source_updated_at_iso DESC
    `).all() as CatalogJoinedRow[]

    const projects = new Map<string, CatalogProject>()
    for (const row of rows) {
      let project = projects.get(row.projectKey)
      if (!project) {
        project = {
          projectKey: row.projectKey,
          cwd: row.projectCwd,
          displayName: row.displayName?.trim() || '',
          sortOrder: row.sortOrder,
          hidden: row.projectHidden === 1,
          hiddenAtIso: row.projectHiddenAtIso,
          threads: [],
        }
        projects.set(row.projectKey, project)
      }
      project.threads.push({
        id: row.threadId,
        cwd: row.threadCwd,
        title: row.title,
        preview: row.preview,
        createdAtIso: row.createdAtIso,
        updatedAtIso: row.updatedAtIso,
        sourceArchived: row.sourceArchived === 1,
        hidden: row.threadHidden === 1,
        hiddenAtIso: row.threadHiddenAtIso,
      })
    }

    const projectRows = Array.from(projects.values())
    return {
      projects: projectRows,
      visibility,
      generatedAtIso: new Date().toISOString(),
      projectCount: projectRows.length,
      threadCount: projectRows.reduce((count, project) => count + project.threads.length, 0),
    }
  })
}

export async function setCatalogProjectHidden(projectKey: string, hidden: boolean): Promise<void> {
  const normalizedKey = normalizeProjectKey(projectKey)
  const nowIso = new Date().toISOString()
  await withLocalDatabase((db) => {
    ensureCatalogTables(db)
    db.prepare(`
      UPDATE ui_projects
      SET hidden = ?, hidden_at_iso = ?, updated_at_iso = ?
      WHERE project_key = ?
    `).run(hidden ? 1 : 0, hidden ? nowIso : null, nowIso, normalizedKey)
  })
}

export async function setCatalogThreadHidden(threadId: string, hidden: boolean): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return
  const nowIso = new Date().toISOString()
  await withLocalDatabase((db) => {
    ensureCatalogTables(db)
    db.prepare(`
      UPDATE ui_threads
      SET hidden = ?, hidden_at_iso = ?, updated_at_iso = ?
      WHERE thread_id = ?
    `).run(hidden ? 1 : 0, hidden ? nowIso : null, nowIso, normalizedThreadId)
  })
}

export async function setCatalogProjectDisplayName(projectKey: string, displayName: string): Promise<void> {
  const normalizedKey = normalizeProjectKey(projectKey)
  const normalizedDisplayName = displayName.trim()
  await withLocalDatabase((db) => {
    ensureCatalogTables(db)
    db.prepare(`
      UPDATE ui_projects
      SET display_name = ?, updated_at_iso = ?
      WHERE project_key = ?
    `).run(normalizedDisplayName || null, new Date().toISOString(), normalizedKey)
  })
}

export async function setCatalogProjectOrder(projectKeys: string[]): Promise<void> {
  const normalizedKeys = Array.from(new Set(projectKeys.map(normalizeProjectKey).filter(Boolean)))
  await withLocalDatabase((db) => {
    ensureCatalogTables(db)
    const update = db.prepare('UPDATE ui_projects SET sort_order = ?, updated_at_iso = ? WHERE project_key = ?')
    const nowIso = new Date().toISOString()
    const transaction = db.transaction(() => {
      normalizedKeys.forEach((projectKey, index) => update.run(index, nowIso, projectKey))
    })
    transaction()
  })
}
