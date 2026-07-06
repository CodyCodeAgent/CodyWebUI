import { BUILT_IN_SKINS } from './skins'
import type {
  LayoutPreset,
  LayoutPresetId,
  SkinPack,
  ThemeDensity,
  ThemePreferences,
  ThemeTokens,
  WorkspaceThemePreferences,
} from './tokens'
import { DEFAULT_THEME_PREFERENCES } from './tokens'

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'chat-focus',
    name: 'Chat Focus',
    description: 'Conversation and composer first.',
  },
  {
    id: 'review-focus',
    name: 'Review Focus',
    description: 'Diff, validation, and approvals first.',
  },
  {
    id: 'ops-dashboard',
    name: 'Ops Dashboard',
    description: 'Workspace health and task supervision first.',
  },
  {
    id: 'ide-mode',
    name: 'IDE Mode',
    description: 'Files, terminal, git, and preview first.',
  },
  {
    id: 'mobile-review',
    name: 'Mobile Review',
    description: 'Status, approvals, and summaries first.',
  },
]

export function getBuiltInSkin(skinId: string): SkinPack | null {
  return BUILT_IN_SKINS.find((skin) => skin.id === skinId) ?? null
}

export function getLayoutPreset(layoutPresetId: string): LayoutPreset {
  return LAYOUT_PRESETS.find((preset) => preset.id === layoutPresetId) ?? LAYOUT_PRESETS[2]
}

export function normalizeThemeDensity(value: unknown): ThemeDensity {
  return value === 'compact' || value === 'comfortable' || value === 'spacious' ? value : 'comfortable'
}

function isColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u.test(value.trim())
}

export function normalizeAccentColor(value: string): string {
  const normalized = value.trim()
  return normalized && isColor(normalized) ? normalized : ''
}

export function normalizeThemePreferences(
  value: unknown,
  options: { skinIds?: string[] } = {},
): ThemePreferences {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const knownSkinIds = new Set([
    ...BUILT_IN_SKINS.map((skin) => skin.id),
    ...(options.skinIds ?? []),
  ])
  const skinId = typeof row.skinId === 'string' && knownSkinIds.has(row.skinId)
    ? row.skinId
    : DEFAULT_THEME_PREFERENCES.skinId
  const layoutPresetId = typeof row.layoutPresetId === 'string'
    ? getLayoutPreset(row.layoutPresetId).id
    : DEFAULT_THEME_PREFERENCES.layoutPresetId
  return {
    skinId,
    accentColor: typeof row.accentColor === 'string' ? normalizeAccentColor(row.accentColor) : '',
    density: normalizeThemeDensity(row.density),
    layoutPresetId: layoutPresetId as LayoutPresetId,
    followSystem: row.followSystem === true,
  }
}

export function normalizeWorkspaceThemePreferences(value: unknown): WorkspaceThemePreferences {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const density = typeof row.density === 'string' &&
    (row.density === 'compact' || row.density === 'comfortable' || row.density === 'spacious')
    ? row.density
    : ''
  const layoutPresetId = typeof row.layoutPresetId === 'string' &&
    LAYOUT_PRESETS.some((preset) => preset.id === row.layoutPresetId)
    ? row.layoutPresetId as WorkspaceThemePreferences['layoutPresetId']
    : ''
  return {
    skinId: typeof row.skinId === 'string' ? row.skinId.trim() : '',
    accentColor: typeof row.accentColor === 'string' ? normalizeAccentColor(row.accentColor) : '',
    density,
    layoutPresetId,
    followSystem: typeof row.followSystem === 'boolean' ? row.followSystem : null,
  }
}

export function resolveThemeTokens(skin: SkinPack, preferences: ThemePreferences): ThemeTokens {
  return {
    ...skin.tokens,
    color: {
      ...skin.tokens.color,
      accent: preferences.accentColor || skin.tokens.color.accent,
    },
    density: preferences.density,
  }
}

export function themeTokensToCssVariables(tokens: ThemeTokens): Record<string, string> {
  return {
    '--color-background': tokens.color.background,
    '--color-surface': tokens.color.surface,
    '--color-panel': tokens.color.panel,
    '--color-elevated': tokens.color.elevated,
    '--color-text': tokens.color.text,
    '--color-text-muted': tokens.color.textMuted,
    '--color-border': tokens.color.border,
    '--color-accent': tokens.color.accent,
    '--color-danger': tokens.color.danger,
    '--color-warning': tokens.color.warning,
    '--color-success': tokens.color.success,
    '--color-info': tokens.color.info,
    '--color-code-background': tokens.color.codeBackground,
    '--color-terminal-background': tokens.color.terminalBackground,
    '--font-sans': tokens.font.sans,
    '--font-mono': tokens.font.mono,
    '--space-xs': tokens.spacing.xs,
    '--space-sm': tokens.spacing.sm,
    '--space-md': tokens.spacing.md,
    '--space-lg': tokens.spacing.lg,
    '--radius-sm': tokens.radius.sm,
    '--radius-md': tokens.radius.md,
    '--radius-lg': tokens.radius.lg,
    '--shadow-panel': tokens.shadow.panel,
    '--shadow-floating': tokens.shadow.floating,
    '--shadow-focus': tokens.shadow.focus,
    '--motion-fast': tokens.motion.fast,
    '--motion-normal': tokens.motion.normal,
    '--motion-slow': tokens.motion.slow,
    '--density-scale': tokens.density === 'compact' ? '0.9' : tokens.density === 'spacious' ? '1.12' : '1',
  }
}

export function serializeSkinPack(skin: SkinPack): string {
  return JSON.stringify(skin, null, 2)
}

export function parseSkinPack(value: string): SkinPack {
  const parsed = JSON.parse(value) as unknown
  const row = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.tokens !== 'object') {
    throw new Error('Skin JSON must include id, name, and tokens.')
  }
  return parsed as SkinPack
}
