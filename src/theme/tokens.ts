export type ThemeDensity = 'compact' | 'comfortable' | 'spacious'

export type ThemeTokens = {
  color: {
    background: string
    surface: string
    panel: string
    elevated: string
    text: string
    textMuted: string
    border: string
    accent: string
    danger: string
    warning: string
    success: string
    info: string
    codeBackground: string
    terminalBackground: string
  }
  font: {
    sans: string
    mono: string
  }
  spacing: {
    xs: string
    sm: string
    md: string
    lg: string
  }
  radius: {
    sm: string
    md: string
    lg: string
  }
  shadow: {
    panel: string
    floating: string
    focus: string
  }
  motion: {
    fast: string
    normal: string
    slow: string
  }
  density: ThemeDensity
}

export type SkinPack = {
  id: string
  name: string
  description: string
  isDark: boolean
  tokens: ThemeTokens
  syntaxTheme: 'light' | 'dark' | string
  terminalTheme: Record<string, string>
  chartPalette: string[]
  background?: {
    type: 'solid' | 'grid' | 'noise' | 'image' | 'animated'
  }
}

export type LayoutPresetId = 'chat-focus' | 'review-focus' | 'ops-dashboard' | 'ide-mode' | 'mobile-review'

export type LayoutPreset = {
  id: LayoutPresetId
  name: string
  description: string
}

export type ThemePreferences = {
  skinId: string
  accentColor: string
  density: ThemeDensity
  layoutPresetId: LayoutPresetId
  followSystem: boolean
}

export type WorkspaceThemePreferences = {
  skinId: string
  accentColor: string
  density: ThemeDensity | ''
  layoutPresetId: LayoutPresetId | ''
  followSystem: boolean | null
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  skinId: 'control-tower',
  accentColor: '',
  density: 'comfortable',
  layoutPresetId: 'ops-dashboard',
  followSystem: false,
}
