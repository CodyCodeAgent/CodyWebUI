export const DESKTOP_STORAGE_KEYS = {
  autoRefreshEnabled: 'codex-web-local.auto-refresh-enabled.v1',
  defaultNewThreadCwd: 'codex-web-local.default-new-thread-cwd.v1',
  projectDisplayName: 'codex-web-local.project-display-name.v1',
  projectOrder: 'codex-web-local.project-order.v1',
  locale: 'codex-web-local.locale.v1',
  readState: 'codex-web-local.thread-read-state.v1',
  scrollState: 'codex-web-local.thread-scroll-state.v1',
  selectedThread: 'codex-web-local.selected-thread-id.v1',
  sidebarCollapsed: 'codex-web-local.sidebar-collapsed.v1',
  theme: 'codex-web-local.theme.v1',
  themeImportedSkins: 'codex-web-local.theme.imported-skins.v1',
  turnPreferences: 'codex-web-local.turn-preferences.v1',
} as const

export const DESKTOP_SETTING_KEYS = {
  defaultNewThreadCwd: 'desktop.default-new-thread-cwd.v1',
  locale: 'desktop.locale.v1',
  theme: 'theme.preferences.v1',
  themeImportedSkins: 'theme.imported-skins.v1',
  tokenFlameWidget: 'token-flame.widget.v1',
  turnPreferences: 'desktop.turn-preferences.v1',
} as const

export type DesktopStorageKey = typeof DESKTOP_STORAGE_KEYS[keyof typeof DESKTOP_STORAGE_KEYS]
export type DesktopSettingKey = typeof DESKTOP_SETTING_KEYS[keyof typeof DESKTOP_SETTING_KEYS]
