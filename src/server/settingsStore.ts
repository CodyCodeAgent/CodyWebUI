import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const DEFAULT_SETTINGS_DB_PATH = join(homedir(), '.codex-web-local', 'settings.sqlite3')
const MAX_SETTING_KEY_LENGTH = 160
const MAX_SETTING_VALUE_BYTES = 256 * 1024

export type UserSetting = {
  key: string
  value: unknown
  updatedAtIso: string
}

function settingsDbPath(): string {
  return process.env.CODEX_WEB_LOCAL_SETTINGS_DB?.trim() || DEFAULT_SETTINGS_DB_PATH
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeSettingKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  const key = value.trim()
  if (!key || key.length > MAX_SETTING_KEY_LENGTH) return ''
  return /^[A-Za-z0-9._:-]+$/u.test(key) ? key : ''
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    totalBytes += buffer.byteLength
    if (totalBytes > MAX_SETTING_VALUE_BYTES) {
      throw new Error('Request body is too large')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) return null
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) as unknown : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function openSettingsDb(): Promise<Database.Database> {
  const dbPath = settingsDbPath()
  await mkdir(dirname(dbPath), { recursive: true })
  try {
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    return db
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to open settings database at ${dbPath}: ${message}`)
  }
}

function ensureSettingsTable(db: Database.Database): void {
  db.exec([
    'CREATE TABLE IF NOT EXISTS settings (',
    'key TEXT PRIMARY KEY,',
    'value_json TEXT NOT NULL,',
    'updated_at_iso TEXT NOT NULL',
    ');',
  ].join(' '))
}

async function withSettingsDb<T>(operation: (db: Database.Database) => T): Promise<T> {
  const db = await openSettingsDb()
  try {
    ensureSettingsTable(db)
    return operation(db)
  } finally {
    db.close()
  }
}

async function readUserSettingFromSqlite(key: string): Promise<UserSetting | null> {
  const normalizedKey = normalizeSettingKey(key)
  if (!normalizedKey) return null
  return withSettingsDb((db) => {
    const row = db.prepare(`
      SELECT key, value_json AS valueJson, updated_at_iso AS updatedAtIso
      FROM settings
      WHERE key = ?
      LIMIT 1
    `).get(normalizedKey) as { key?: unknown; valueJson?: unknown; updatedAtIso?: unknown } | undefined

    if (!row || typeof row.key !== 'string' || typeof row.valueJson !== 'string' || typeof row.updatedAtIso !== 'string') {
      return null
    }

    return {
      key: row.key,
      value: JSON.parse(row.valueJson) as unknown,
      updatedAtIso: row.updatedAtIso,
    }
  })
}

async function writeUserSettingToSqlite(key: string, value: unknown): Promise<UserSetting> {
  const normalizedKey = normalizeSettingKey(key)
  if (!normalizedKey) {
    throw new Error('Invalid setting key')
  }

  const valueJson = JSON.stringify(value)
  if (Buffer.byteLength(valueJson, 'utf8') > MAX_SETTING_VALUE_BYTES) {
    throw new Error('Setting value is too large')
  }

  const updatedAtIso = new Date().toISOString()
  await withSettingsDb((db) => {
    db.prepare(`
      INSERT INTO settings (key, value_json, updated_at_iso)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at_iso = excluded.updated_at_iso
    `).run(normalizedKey, valueJson, updatedAtIso)
  })

  return {
    key: normalizedKey,
    value,
    updatedAtIso,
  }
}

async function listUserSettingsFromSqlite(): Promise<UserSetting[]> {
  return withSettingsDb((db) => {
    const rows = db.prepare(`
      SELECT key, value_json AS valueJson, updated_at_iso AS updatedAtIso
      FROM settings
      ORDER BY key
    `).all() as Array<{ key?: unknown; valueJson?: unknown; updatedAtIso?: unknown }>

    return rows.flatMap((row) => {
      if (typeof row.key !== 'string' || typeof row.valueJson !== 'string' || typeof row.updatedAtIso !== 'string') return []
      return [{
        key: row.key,
        value: JSON.parse(row.valueJson) as unknown,
        updatedAtIso: row.updatedAtIso,
      }]
    })
  })
}

export async function readUserSetting(key: string): Promise<UserSetting | null> {
  return readUserSettingFromSqlite(key)
}

export async function writeUserSetting(key: string, value: unknown): Promise<UserSetting> {
  return writeUserSettingToSqlite(key, value)
}

export async function listUserSettings(): Promise<UserSetting[]> {
  return listUserSettingsFromSqlite()
}

export async function handleReadUserSetting(url: URL, res: ServerResponse): Promise<void> {
  const key = normalizeSettingKey(url.searchParams.get('key'))
  if (!key) {
    setJson(res, 400, { error: 'key is required' })
    return
  }

  const setting = await readUserSetting(key)
  setJson(res, 200, { result: { setting } })
}

export async function handleListUserSettings(_url: URL, res: ServerResponse): Promise<void> {
  const settings = await listUserSettings()
  setJson(res, 200, { result: { settings } })
}

export async function handleWriteUserSetting(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = asRecord(await readJsonBody(req))
  const key = normalizeSettingKey(body?.key)
  if (!body || !key || !('value' in body)) {
    setJson(res, 400, { error: 'Invalid body: expected { key, value }' })
    return
  }

  const setting = await writeUserSetting(key, body.value)
  setJson(res, 200, { result: { setting } })
}
