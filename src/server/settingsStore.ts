import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
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

function sqlString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`
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

async function runSql(sql: string, options: { json?: boolean } = {}): Promise<string> {
  const dbPath = settingsDbPath()
  await mkdir(dirname(dbPath), { recursive: true })
  const args = options.json ? ['-batch', '-json', dbPath, sql] : ['-batch', '-noheader', dbPath, sql]
  const { stdout } = await execFileAsync('sqlite3', args, {
    maxBuffer: MAX_SETTING_VALUE_BYTES * 2,
  })
  return stdout.trim()
}

async function ensureSettingsTable(): Promise<void> {
  await runSql([
    'PRAGMA journal_mode=WAL;',
    'CREATE TABLE IF NOT EXISTS settings (',
    'key TEXT PRIMARY KEY,',
    'value_json TEXT NOT NULL,',
    'updated_at_iso TEXT NOT NULL',
    ');',
  ].join(' '))
}

export async function readUserSetting(key: string): Promise<UserSetting | null> {
  const normalizedKey = normalizeSettingKey(key)
  if (!normalizedKey) return null
  await ensureSettingsTable()

  const output = await runSql([
    `SELECT key, value_json, updated_at_iso AS updatedAtIso FROM settings WHERE key = ${sqlString(normalizedKey)} LIMIT 1;`,
  ].join('\n'), { json: true })
  const rows = output ? JSON.parse(output) as Array<{ key?: unknown; value_json?: unknown; updatedAtIso?: unknown }> : []
  const row = rows[0]
  if (!row || typeof row.key !== 'string' || typeof row.value_json !== 'string' || typeof row.updatedAtIso !== 'string') {
    return null
  }

  return {
    key: row.key,
    value: JSON.parse(row.value_json) as unknown,
    updatedAtIso: row.updatedAtIso,
  }
}

export async function writeUserSetting(key: string, value: unknown): Promise<UserSetting> {
  const normalizedKey = normalizeSettingKey(key)
  if (!normalizedKey) {
    throw new Error('Invalid setting key')
  }

  const valueJson = JSON.stringify(value)
  if (Buffer.byteLength(valueJson, 'utf8') > MAX_SETTING_VALUE_BYTES) {
    throw new Error('Setting value is too large')
  }

  const updatedAtIso = new Date().toISOString()
  await ensureSettingsTable()
  await runSql([
    'INSERT INTO settings (key, value_json, updated_at_iso)',
    `VALUES (${sqlString(normalizedKey)}, ${sqlString(valueJson)}, ${sqlString(updatedAtIso)})`,
    'ON CONFLICT(key) DO UPDATE SET',
    'value_json = excluded.value_json,',
    'updated_at_iso = excluded.updated_at_iso;',
  ].join(' '))

  return {
    key: normalizedKey,
    value,
    updatedAtIso,
  }
}

export async function listUserSettings(): Promise<UserSetting[]> {
  await ensureSettingsTable()
  const output = await runSql([
    'SELECT key, value_json, updated_at_iso AS updatedAtIso FROM settings ORDER BY key;',
  ].join('\n'), { json: true })
  const rows = output ? JSON.parse(output) as Array<{ key?: unknown; value_json?: unknown; updatedAtIso?: unknown }> : []
  return rows.flatMap((row) => {
    if (typeof row.key !== 'string' || typeof row.value_json !== 'string' || typeof row.updatedAtIso !== 'string') return []
    return [{
      key: row.key,
      value: JSON.parse(row.value_json) as unknown,
      updatedAtIso: row.updatedAtIso,
    }]
  })
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
