import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DEFAULT_SETTINGS_DB_PATH = join(homedir(), '.cody-web-ui', 'settings.sqlite3')

export function localDatabasePath(): string {
  return process.env.CODY_WEB_UI_SETTINGS_DB?.trim() || DEFAULT_SETTINGS_DB_PATH
}

export async function withLocalDatabase<T>(operation: (db: Database.Database) => T): Promise<T> {
  const dbPath = localDatabasePath()
  await mkdir(dirname(dbPath), { recursive: true })

  let db: Database.Database
  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to open settings database at ${dbPath}: ${message}`)
  }

  try {
    return operation(db)
  } finally {
    db.close()
  }
}
