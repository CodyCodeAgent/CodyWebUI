import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { withLocalDatabase } from './localDatabase.js'

const originalSettingsDb = process.env.CODY_WEB_UI_SETTINGS_DB
const temporaryDirectories: string[] = []

afterEach(async () => {
  if (originalSettingsDb === undefined) delete process.env.CODY_WEB_UI_SETTINGS_DB
  else process.env.CODY_WEB_UI_SETTINGS_DB = originalSettingsDb
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('local database permissions', () => {
  it('keeps a custom settings database readable only by its owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cody-local-db-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'settings.sqlite3')
    process.env.CODY_WEB_UI_SETTINGS_DB = databasePath

    await withLocalDatabase((db) => db.exec('CREATE TABLE permission_probe (id INTEGER PRIMARY KEY)'))
    await chmod(databasePath, 0o666)
    await withLocalDatabase((db) => db.prepare('SELECT COUNT(*) AS total FROM permission_probe').get())

    expect((await stat(databasePath)).mode & 0o777).toBe(0o600)
  })
})
