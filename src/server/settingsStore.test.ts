import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listUserSettings, readUserSetting, writeUserSetting } from './settingsStore'

let previousDbPath: string | undefined
let tempDir = ''

beforeEach(async () => {
  previousDbPath = process.env.CODEX_WEB_LOCAL_SETTINGS_DB
  tempDir = await mkdtemp(join(tmpdir(), 'codex-web-settings-'))
  process.env.CODEX_WEB_LOCAL_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
})

afterEach(async () => {
  if (previousDbPath === undefined) {
    delete process.env.CODEX_WEB_LOCAL_SETTINGS_DB
  } else {
    process.env.CODEX_WEB_LOCAL_SETTINGS_DB = previousDbPath
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('settings store', () => {
  it('persists structured settings in sqlite', async () => {
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

  it('fails loudly when the sqlite database cannot be opened', async () => {
    process.env.CODEX_WEB_LOCAL_SETTINGS_DB = tempDir

    await expect(writeUserSetting('token-flame.widget.v1', {
      enabled: true,
      defaultCorner: 'bottom-right',
    })).rejects.toThrow('Failed to open settings database')
    await expect(readUserSetting('token-flame.widget.v1')).rejects.toThrow('Failed to open settings database')
    await expect(listUserSettings()).rejects.toThrow('Failed to open settings database')
  })
})
