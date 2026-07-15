import type Database from 'better-sqlite3'
import type { BackgroundTaskStatus } from './backgroundTaskRunner.js'
import { withLocalDatabase } from './localDatabase.js'

const writeQueueByTask = new Map<string, Promise<void>>()

function ensureTable(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS background_task_status (
    name TEXT PRIMARY KEY,
    status_json TEXT NOT NULL,
    updated_at_iso TEXT NOT NULL
  );`)
}

export async function readBackgroundTaskStatus(name: string): Promise<Partial<BackgroundTaskStatus> | null> {
  return withLocalDatabase((db) => {
    ensureTable(db)
    const row = db.prepare('SELECT status_json AS statusJson FROM background_task_status WHERE name = ?').get(name) as { statusJson?: unknown } | undefined
    if (typeof row?.statusJson !== 'string') return null
    try { return JSON.parse(row.statusJson) as Partial<BackgroundTaskStatus> } catch { return null }
  })
}

export async function writeBackgroundTaskStatus(status: BackgroundTaskStatus): Promise<void> {
  const snapshot = structuredClone(status)
  const previous = writeQueueByTask.get(status.name) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(() => withLocalDatabase((db) => {
    ensureTable(db)
    db.prepare(`INSERT INTO background_task_status (name, status_json, updated_at_iso)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET status_json = excluded.status_json, updated_at_iso = excluded.updated_at_iso`)
      .run(snapshot.name, JSON.stringify(snapshot), new Date().toISOString())
  })).finally(() => {
    if (writeQueueByTask.get(snapshot.name) === current) writeQueueByTask.delete(snapshot.name)
  })
  writeQueueByTask.set(snapshot.name, current)
  await current
}
