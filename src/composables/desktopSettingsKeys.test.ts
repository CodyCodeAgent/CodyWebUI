import { describe, expect, it } from 'vitest'
import { DESKTOP_SETTING_KEYS, DESKTOP_STORAGE_KEYS } from './desktopSettingsKeys'

describe('desktopSettingsKeys', () => {
  it('keeps local storage keys namespaced and versioned', () => {
    const values = Object.values(DESKTOP_STORAGE_KEYS)

    expect(new Set(values).size).toBe(values.length)
    expect(values.every((key) => key.startsWith('codex-web-local.'))).toBe(true)
    expect(values.every((key) => /\.v\d+$/.test(key))).toBe(true)
  })

  it('keeps remote setting keys namespaced and versioned', () => {
    const values = Object.values(DESKTOP_SETTING_KEYS)

    expect(new Set(values).size).toBe(values.length)
    expect(values.every((key) => /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*\.v\d+$/.test(key))).toBe(true)
    expect(DESKTOP_SETTING_KEYS.locale).toBe('desktop.locale.v1')
    expect(DESKTOP_SETTING_KEYS.turnPreferences).toBe('desktop.turn-preferences.v1')
    expect(DESKTOP_SETTING_KEYS.tokenFlameWidget).toBe('token-flame.widget.v1')
  })
})
