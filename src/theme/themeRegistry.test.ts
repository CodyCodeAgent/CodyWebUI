import { describe, expect, it } from 'vitest'
import { BUILT_IN_SKINS } from './skins'
import {
  getBuiltInSkin,
  getLayoutPreset,
  normalizeThemePreferences,
  normalizeWorkspaceThemePreferences,
  parseSkinPack,
  resolveThemeTokens,
  serializeSkinPack,
  themeTokensToCssVariables,
} from './themeRegistry'

describe('theme registry', () => {
  it('registers the expected built-in skin packs', () => {
    expect(BUILT_IN_SKINS.map((skin) => skin.id)).toEqual([
      'codex-classic',
      'control-tower',
      'cyber-ops',
      'light-pro',
      'terminal',
      'mobile-focus',
    ])
    expect(getBuiltInSkin('control-tower')?.isDark).toBe(true)
  })

  it('normalizes stored preferences to safe defaults', () => {
    expect(normalizeThemePreferences({
      skinId: 'missing',
      accentColor: 'not-a-color',
      density: 'huge',
      layoutPresetId: 'unknown',
      followSystem: true,
    })).toEqual({
      skinId: 'control-tower',
      accentColor: '',
      density: 'comfortable',
      layoutPresetId: 'ops-dashboard',
      followSystem: true,
    })
  })

  it('allows imported skin ids when normalizing stored preferences', () => {
    expect(normalizeThemePreferences({
      skinId: 'custom-ops',
      accentColor: '#abcdef',
      density: 'compact',
      layoutPresetId: 'mobile-review',
      followSystem: false,
    }, { skinIds: ['custom-ops'] })).toMatchObject({
      skinId: 'custom-ops',
      accentColor: '#abcdef',
      density: 'compact',
      layoutPresetId: 'mobile-review',
    })
  })

  it('normalizes workspace theme overrides without inventing missing fields', () => {
    expect(normalizeWorkspaceThemePreferences({
      skinId: 'cyber-ops',
      accentColor: '#22d3ee',
      density: 'compact',
      layoutPresetId: 'review-focus',
      followSystem: false,
    })).toEqual({
      skinId: 'cyber-ops',
      accentColor: '#22d3ee',
      density: 'compact',
      layoutPresetId: 'review-focus',
      followSystem: false,
    })

    expect(normalizeWorkspaceThemePreferences({
      accentColor: 'not-a-color',
      density: 'huge',
      layoutPresetId: 'unknown',
    })).toEqual({
      skinId: '',
      accentColor: '',
      density: '',
      layoutPresetId: '',
      followSystem: null,
    })
  })

  it('resolves accent overrides into CSS variables', () => {
    const skin = getBuiltInSkin('light-pro')
    expect(skin).not.toBeNull()

    const tokens = resolveThemeTokens(skin!, {
      skinId: 'light-pro',
      accentColor: '#123456',
      density: 'spacious',
      layoutPresetId: 'ide-mode',
      followSystem: false,
    })
    const variables = themeTokensToCssVariables(tokens)

    expect(tokens.color.accent).toBe('#123456')
    expect(tokens.density).toBe('spacious')
    expect(variables['--color-accent']).toBe('#123456')
    expect(variables['--density-scale']).toBe('1.12')
  })

  it('round-trips skin JSON and validates malformed imports', () => {
    const skin = getBuiltInSkin('terminal')
    expect(skin).not.toBeNull()

    expect(parseSkinPack(serializeSkinPack(skin!))).toMatchObject({
      id: 'terminal',
      name: 'Terminal',
    })
    expect(() => parseSkinPack('{}')).toThrow('Skin JSON must include id, name, and tokens.')
  })

  it('returns ops dashboard for unknown layout presets', () => {
    expect(getLayoutPreset('missing').id).toBe('ops-dashboard')
  })
})
