import { computed, ref, watch } from 'vue'
import { fetchUserSetting, writeUserSetting } from '../api/codexSettingsClient'
import { BUILT_IN_SKINS } from './skins'
import {
  getBuiltInSkin,
  getLayoutPreset,
  normalizeAccentColor,
  normalizeThemeDensity,
  normalizeThemePreferences,
  normalizeWorkspaceThemePreferences,
  parseSkinPack,
  resolveThemeTokens,
  serializeSkinPack,
  themeTokensToCssVariables,
} from './themeRegistry'
import type { LayoutPresetId, SkinPack, ThemeDensity, ThemePreferences, WorkspaceThemePreferences } from './tokens'
import { DEFAULT_THEME_PREFERENCES } from './tokens'

const THEME_STORAGE_KEY = 'codex-web-local.theme.v1'
const THEME_IMPORTED_SKINS_STORAGE_KEY = 'codex-web-local.theme.imported-skins.v1'
const THEME_SETTING_KEY = 'theme.preferences.v1'
const THEME_IMPORTED_SKINS_SETTING_KEY = 'theme.imported-skins.v1'

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

function loadImportedSkins(): SkinPack[] {
  if (!hasWindow()) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(THEME_IMPORTED_SKINS_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        try {
          return parseSkinPack(JSON.stringify(item))
        } catch {
          return null
        }
      })
      .filter((item): item is SkinPack => Boolean(item))
      .slice(0, 20)
  } catch {
    return []
  }
}

function loadPreferences(skins: SkinPack[]): ThemePreferences {
  if (!hasWindow()) return DEFAULT_THEME_PREFERENCES
  try {
    return normalizeThemePreferences(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? 'null'), {
      skinIds: skins.map((skin) => skin.id),
    })
  } catch {
    return DEFAULT_THEME_PREFERENCES
  }
}

function savePreferences(nextPreferences: ThemePreferences): void {
  if (!hasWindow()) return
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextPreferences))
}

function saveImportedSkins(nextSkins: SkinPack[]): void {
  if (!hasWindow()) return
  window.localStorage.setItem(THEME_IMPORTED_SKINS_STORAGE_KEY, JSON.stringify(nextSkins.slice(0, 20)))
}

async function readRemoteSetting<T>(key: string): Promise<T | null> {
  if (!hasWindow()) return null
  try {
    const setting = await fetchUserSetting<T>(key)
    return setting?.value ?? null
  } catch {
    return null
  }
}

async function saveRemoteSetting(key: string, value: unknown): Promise<void> {
  if (!hasWindow()) return
  try {
    await writeUserSetting(key, value)
  } catch {
    // Local storage remains the fallback when the optional SQLite settings store is unavailable.
  }
}

function preferredSystemSkinId(): string {
  if (!hasWindow() || !window.matchMedia('(prefers-color-scheme: dark)').matches) return 'light-pro'
  return 'control-tower'
}

const initialImportedSkins = loadImportedSkins()
const importedSkins = ref<SkinPack[]>(initialImportedSkins)
const preferences = ref<ThemePreferences>(loadPreferences(initialImportedSkins))
const workspacePreferences = ref<WorkspaceThemePreferences | null>(null)

function allSkins(): SkinPack[] {
  const importedById = new Map(importedSkins.value.map((skin) => [skin.id, skin]))
  return [
    ...BUILT_IN_SKINS.filter((skin) => !importedById.has(skin.id)),
    ...importedSkins.value,
  ]
}

function findSkin(skinId: string): SkinPack {
  return allSkins().find((skin) => skin.id === skinId) ?? getBuiltInSkin(DEFAULT_THEME_PREFERENCES.skinId) ?? BUILT_IN_SKINS[0]
}

function applyWorkspaceOverrides(
  basePreferences: ThemePreferences,
  override: WorkspaceThemePreferences | null,
): ThemePreferences {
  if (!override) return basePreferences
  const next: ThemePreferences = { ...basePreferences }
  if (override.skinId && allSkins().some((skin) => skin.id === override.skinId)) {
    next.skinId = override.skinId
  }
  if (override.accentColor) next.accentColor = override.accentColor
  if (override.density) next.density = override.density
  if (override.layoutPresetId) next.layoutPresetId = override.layoutPresetId
  if (override.followSystem !== null) next.followSystem = override.followSystem
  return next
}

const availableSkins = computed(() => allSkins())
const effectivePreferences = computed(() => applyWorkspaceOverrides(preferences.value, workspacePreferences.value))
const resolvedSkin = computed(() => findSkin(
  effectivePreferences.value.followSystem ? preferredSystemSkinId() : effectivePreferences.value.skinId,
))
const resolvedTokens = computed(() => resolveThemeTokens(resolvedSkin.value, effectivePreferences.value))
const activeLayoutPreset = computed(() => getLayoutPreset(effectivePreferences.value.layoutPresetId))
const isDarkTheme = computed(() => resolvedSkin.value.isDark)
const themeRootClass = computed(() => (isDarkTheme.value ? 'app-dark' : ''))
const themeAttributes = computed(() => ({
  'data-theme-skin': resolvedSkin.value.id,
  'data-theme-density': effectivePreferences.value.density,
  'data-layout-preset': effectivePreferences.value.layoutPresetId,
}))

function applyCurrentTheme(): void {
  if (!hasDocument()) return
  const root = document.documentElement
  for (const [name, value] of Object.entries(themeTokensToCssVariables(resolvedTokens.value))) {
    root.style.setProperty(name, value)
  }
  root.dataset.themeSkin = resolvedSkin.value.id
  root.dataset.themeDensity = effectivePreferences.value.density
  root.dataset.layoutPreset = effectivePreferences.value.layoutPresetId
  root.style.colorScheme = resolvedSkin.value.isDark ? 'dark' : 'light'
}

function updatePreferences(nextPreferences: ThemePreferences): void {
  preferences.value = normalizeThemePreferences(nextPreferences, {
    skinIds: allSkins().map((skin) => skin.id),
  })
}

function setSkin(skinId: string): void {
  const skin = findSkin(skinId)
  preferences.value = {
    ...preferences.value,
    skinId: skin.id,
    followSystem: false,
  }
}

function setAccentColor(value: string): void {
  preferences.value = {
    ...preferences.value,
    accentColor: normalizeAccentColor(value),
  }
}

function setDensity(value: ThemeDensity): void {
  preferences.value = {
    ...preferences.value,
    density: normalizeThemeDensity(value),
  }
}

function setLayoutPreset(value: LayoutPresetId): void {
  preferences.value = {
    ...preferences.value,
    layoutPresetId: getLayoutPreset(value).id,
  }
}

function setFollowSystem(value: boolean): void {
  preferences.value = {
    ...preferences.value,
    followSystem: value,
  }
}

function setWorkspaceThemePreferences(value: unknown): void {
  const normalized = normalizeWorkspaceThemePreferences(value)
  const hasWorkspaceTheme =
    normalized.skinId ||
    normalized.accentColor ||
    normalized.density ||
    normalized.layoutPresetId ||
    normalized.followSystem !== null
  workspacePreferences.value = hasWorkspaceTheme ? normalized : null
}

function clearWorkspaceThemePreferences(): void {
  workspacePreferences.value = null
}

function toggleLightDark(): void {
  setSkin(isDarkTheme.value ? 'light-pro' : 'control-tower')
}

function resetTheme(): void {
  preferences.value = DEFAULT_THEME_PREFERENCES
}

function exportActiveSkin(): string {
  return serializeSkinPack(resolvedSkin.value)
}

function importSkin(value: string): SkinPack {
  const skin = parseSkinPack(value)
  importedSkins.value = [
    ...importedSkins.value.filter((candidate) => candidate.id !== skin.id),
    skin,
  ]
  saveImportedSkins(importedSkins.value)
  void saveRemoteSetting(THEME_IMPORTED_SKINS_SETTING_KEY, importedSkins.value.slice(0, 20))
  setSkin(skin.id)
  return skin
}

async function hydrateThemeFromSettingsStore(): Promise<void> {
  const remoteImportedSkins = await readRemoteSetting<unknown[]>(THEME_IMPORTED_SKINS_SETTING_KEY)
  if (Array.isArray(remoteImportedSkins)) {
    importedSkins.value = remoteImportedSkins
      .map((item) => {
        try {
          return parseSkinPack(JSON.stringify(item))
        } catch {
          return null
        }
      })
      .filter((item): item is SkinPack => Boolean(item))
      .slice(0, 20)
    saveImportedSkins(importedSkins.value)
  } else if (importedSkins.value.length > 0) {
    void saveRemoteSetting(THEME_IMPORTED_SKINS_SETTING_KEY, importedSkins.value.slice(0, 20))
  }

  const remotePreferences = await readRemoteSetting<unknown>(THEME_SETTING_KEY)
  if (remotePreferences) {
    preferences.value = normalizeThemePreferences(remotePreferences, {
      skinIds: allSkins().map((skin) => skin.id),
    })
    savePreferences(preferences.value)
  } else {
    void saveRemoteSetting(THEME_SETTING_KEY, preferences.value)
  }
}

watch(preferences, (nextPreferences) => {
  savePreferences(nextPreferences)
  void saveRemoteSetting(THEME_SETTING_KEY, nextPreferences)
  applyCurrentTheme()
}, { deep: true })

watch(workspacePreferences, () => {
  applyCurrentTheme()
}, { deep: true })

if (hasWindow()) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preferences.value.followSystem) applyCurrentTheme()
  })
  void hydrateThemeFromSettingsStore()
}

export function useTheme() {
  return {
    preferences,
    effectivePreferences,
    workspacePreferences,
    availableSkins,
    activeSkin: resolvedSkin,
    activeTokens: resolvedTokens,
    activeLayoutPreset,
    isDarkTheme,
    themeRootClass,
    themeAttributes,
    applyCurrentTheme,
    updatePreferences,
    setSkin,
    setAccentColor,
    setDensity,
    setLayoutPreset,
    setFollowSystem,
    setWorkspaceThemePreferences,
    clearWorkspaceThemePreferences,
    toggleLightDark,
    resetTheme,
    exportActiveSkin,
    importSkin,
  }
}
