import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export type UserSetting<T = unknown> = {
  key: string
  value: T
  updatedAtIso: string
}

function normalizeSetting<T>(value: unknown): UserSetting<T> | null {
  const row = asRecord(value)
  if (!row || typeof row.key !== 'string' || typeof row.updatedAtIso !== 'string' || !('value' in row)) {
    return null
  }
  return row as UserSetting<T>
}

export async function fetchUserSetting<T = unknown>(key: string): Promise<UserSetting<T> | null> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/settings', { key }), {
    method: 'settings/read',
    networkErrorMessage: 'Settings request failed before it was sent',
    httpErrorMessage: 'Settings request failed',
    malformedMessage: 'Settings read returned malformed response',
  })

  if (result.setting === null) return null
  const setting = normalizeSetting<T>(result.setting)
  if (!setting) {
    throw new CodexApiError('Settings read returned malformed response', {
      code: 'invalid_response',
      method: 'settings/read',
      status,
    })
  }
  return setting
}

export async function writeUserSetting<T = unknown>(key: string, value: T): Promise<UserSetting<T>> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/settings', {
    init: jsonPostInit({ key, value }),
    method: 'settings/write',
    networkErrorMessage: 'Settings save failed before it was sent',
    httpErrorMessage: 'Settings save failed',
    malformedMessage: 'Settings write returned malformed response',
  })

  const setting = normalizeSetting<T>(result.setting)
  if (!setting) {
    throw new CodexApiError('Settings write returned malformed response', {
      code: 'invalid_response',
      method: 'settings/write',
      status,
    })
  }
  return setting
}
