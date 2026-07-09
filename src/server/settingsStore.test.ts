import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listUserSettings, readUserSetting, writeUserSetting } from './settingsStore'

let previousDbPath: string | undefined
let previousJsonPath: string | undefined
let previousSqliteBin: string | undefined
let tempDir = ''

beforeEach(async () => {
  previousDbPath = process.env.CODEX_WEB_LOCAL_SETTINGS_DB
  previousJsonPath = process.env.CODEX_WEB_LOCAL_SETTINGS_JSON
  previousSqliteBin = process.env.CODEX_WEB_LOCAL_SQLITE_BIN
  tempDir = await mkdtemp(join(tmpdir(), 'codex-web-settings-'))
  process.env.CODEX_WEB_LOCAL_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
  process.env.CODEX_WEB_LOCAL_SETTINGS_JSON = join(tempDir, 'settings.json')
})

afterEach(async () => {
  if (previousDbPath === undefined) {
    delete process.env.CODEX_WEB_LOCAL_SETTINGS_DB
  } else {
    process.env.CODEX_WEB_LOCAL_SETTINGS_DB = previousDbPath
  }
  if (previousJsonPath === undefined) {
    delete process.env.CODEX_WEB_LOCAL_SETTINGS_JSON
  } else {
    process.env.CODEX_WEB_LOCAL_SETTINGS_JSON = previousJsonPath
  }
  if (previousSqliteBin === undefined) {
    delete process.env.CODEX_WEB_LOCAL_SQLITE_BIN
  } else {
    process.env.CODEX_WEB_LOCAL_SQLITE_BIN = previousSqliteBin
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('settings store', () => {
  it('persists JSON settings in sqlite', async () => {
    await writeUserSetting('theme.preferences.v1', {
      skinId: 'control-tower',
      followSystem: false,
    })

    await expect(readUserSetting('theme.preferences.v1')).resolves.toMatchObject({
      key: 'theme.preferences.v1',
      value: {
        skinId: 'control-tower',
        followSystem: false,
      },
    })
  })

  it('updates existing keys and lists settings', async () => {
    await writeUserSetting('theme.preferences.v1', { skinId: 'light-pro' })
    await writeUserSetting('theme.preferences.v1', { skinId: 'control-tower' })
    await writeUserSetting('ui.sidebar.v1', { collapsed: true })

    const settings = await listUserSettings()

    expect(settings.map((setting) => setting.key)).toEqual([
      'theme.preferences.v1',
      'ui.sidebar.v1',
    ])
    expect(settings[0]?.value).toEqual({ skinId: 'control-tower' })
  })

  it('rejects invalid setting keys', async () => {
    await expect(writeUserSetting('bad key', true)).rejects.toThrow('Invalid setting key')
    await expect(readUserSetting('bad key')).resolves.toBeNull()
  })

  it('falls back to JSON settings when sqlite is unavailable', async () => {
    process.env.CODEX_WEB_LOCAL_SQLITE_BIN = join(tempDir, 'missing-sqlite3')

    await writeUserSetting('token-flame.widget.v1', {
      enabled: true,
      defaultCorner: 'bottom-right',
    })

    await expect(readUserSetting('token-flame.widget.v1')).resolves.toMatchObject({
      key: 'token-flame.widget.v1',
      value: {
        enabled: true,
        defaultCorner: 'bottom-right',
      },
    })
    await expect(listUserSettings()).resolves.toHaveLength(1)
  })
})
