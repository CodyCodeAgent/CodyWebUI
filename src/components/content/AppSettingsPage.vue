<template>
  <main class="app-settings-page" :aria-label="t('settings.aria')">
    <aside class="app-settings-nav" aria-label="Settings sections">
      <label class="app-settings-search">
        <span>{{ t('settings.search.label') }}</span>
        <input v-model="settingsQuery" type="search" :placeholder="t('settings.search.placeholder')" />
      </label>
      <nav>
        <a v-for="item in visibleNavItems" :key="item.id" :href="`#${item.id}`">{{ item.label }}</a>
      </nav>
      <p class="app-settings-save-state" :data-tone="saveTone">{{ unifiedSaveState }}</p>
    </aside>

    <div class="app-settings-content">
    <section v-show="matchesSettings('about')" id="settings-about" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.about.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.about.subtitle') }}</p>
        </div>
      </header>
      <dl class="app-version-details">
        <div>
          <dt>{{ t('settings.about.version') }}</dt>
          <dd>{{ BUILD_INFO.version }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.about.buildId') }}</dt>
          <dd>{{ BUILD_INFO.buildId }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.about.gitSha') }}</dt>
          <dd>{{ BUILD_INFO.gitSha }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.about.builtAt') }}</dt>
          <dd>{{ buildTimeLabel }}</dd>
        </div>
      </dl>
    </section>

    <section v-show="matchesSettings('language')" id="settings-language" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.language.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.language.subtitle') }}</p>
        </div>
        <label class="app-settings-language-select">
          <span>{{ t('settings.language.current') }}</span>
          <select :value="locale" @change="onLocaleSelect">
            <option v-for="option in localeOptions" :key="option.value" :value="option.value">
              {{ option.value === 'zh-CN' ? t('settings.language.chinese') : t('settings.language.english') }}
            </option>
          </select>
        </label>
      </header>
    </section>

    <section v-show="matchesSettings('catalog')" id="settings-catalog" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.catalog.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.catalog.subtitle') }}</p>
        </div>
        <button class="catalog-sync-button" type="button" :disabled="isCatalogSyncing" @click="runCatalogSync">
          {{ t('settings.catalog.syncNow') }}
        </button>
      </header>
      <dl class="catalog-sync-status" :data-tone="catalogStatusTone">
        <div>
          <dt>{{ catalogStatusLabel }}</dt>
          <dd>{{ catalogStatus?.lastError || catalogStatusError }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.catalog.lastSuccess') }}</dt>
          <dd>{{ formatCatalogTime(catalogStatus?.lastSuccessAtIso) }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.catalog.nextRun') }}</dt>
          <dd>{{ formatCatalogTime(catalogStatus?.nextRunAtIso) }}</dd>
        </div>
      </dl>
    </section>

    <section v-show="matchesSettings('feishu')" id="settings-feishu" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.feishu.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.feishu.subtitle') }}</p>
        </div>
      </header>
      <FeishuBotPanel />
    </section>

    <section v-show="matchesSettings('tasks')" id="settings-tasks" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.tasks.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.tasks.subtitle') }}</p>
        </div>
      </header>
      <AgentTasksPanel :projects="projects" @select-thread="$emit('selectThread', $event)" />
      <BackgroundTasksPanel />
    </section>

    <section v-show="matchesSettings('appearance')" id="settings-appearance" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.appearance.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.appearance.subtitle') }}</p>
        </div>
      </header>
      <WorkspaceThemePanel />
    </section>

    <section v-show="matchesSettings('usage')" id="settings-usage" class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.tokenFlame.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.tokenFlame.subtitle') }}</p>
        </div>
        <label class="app-settings-switch">
          <input v-model="flameSettings.enabled" type="checkbox" />
          <span>{{ flameSettings.enabled ? t('settings.tokenFlame.enabled') : t('settings.tokenFlame.disabled') }}</span>
        </label>
      </header>

      <div class="flame-settings-card">
        <div class="flame-preview" :data-level="previewLevel">
          <span class="flame-preview-ember" />
          <span class="flame-preview-core" />
          <span class="flame-preview-tip" />
        </div>

        <div class="flame-settings-copy">
          <h3>{{ t('settings.tokenFlame.firepowerTitle') }}</h3>
          <p>{{ t('settings.tokenFlame.firepowerBody') }}</p>
          <div class="flame-settings-controls">
            <label>
              <span>{{ t('settings.tokenFlame.defaultPosition') }}</span>
              <select v-model="flameSettings.defaultCorner">
                <option value="bottom-right">{{ t('settings.tokenFlame.bottomRight') }}</option>
                <option value="bottom-left">{{ t('settings.tokenFlame.bottomLeft') }}</option>
                <option value="top-right">{{ t('settings.tokenFlame.topRight') }}</option>
                <option value="top-left">{{ t('settings.tokenFlame.topLeft') }}</option>
              </select>
            </label>
            <label class="flame-settings-checkbox">
              <input v-model="flameSettings.reducedMotion" type="checkbox" />
              <span>{{ t('settings.tokenFlame.calmAnimation') }}</span>
            </label>
            <button class="flame-settings-reset-position" type="button" @click="resetFlamePosition">
              {{ t('settings.tokenFlame.resetPosition') }}
            </button>
          </div>
          <p v-if="saveMessage" class="flame-settings-message" :data-tone="saveTone">{{ saveMessage }}</p>
        </div>
      </div>

      <ol class="flame-level-list" :aria-label="t('settings.tokenFlame.levelsAria')">
        <li v-for="level in flameLevels" :key="level.name">
          <span class="flame-level-dot" :data-level="level.level" />
          <span class="flame-level-name">{{ level.name }}</span>
          <span class="flame-level-range">{{ level.range }}</span>
        </li>
      </ol>
    </section>
    <p v-if="visibleNavItems.length === 0" class="app-settings-no-results">{{ t('settings.search.noResults', { query: settingsQuery }) }}</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { fetchUserSetting, writeUserSetting } from '../../api/codexSettingsClient'
import { fetchCatalogStatus, syncCatalogNow, type CatalogSyncStatus } from '../../api/codexCatalogClient'
import { DESKTOP_SETTING_KEYS } from '../../composables/desktopSettingsKeys'
import { useLocale, type AppLocale } from '../../composables/useLocale'
import { BUILD_INFO } from '../../buildInfo'
const WorkspaceThemePanel = defineAsyncComponent(() => import('./WorkspaceThemePanel.vue'))
const BackgroundTasksPanel = defineAsyncComponent(() => import('./BackgroundTasksPanel.vue'))
const AgentTasksPanel = defineAsyncComponent(() => import('./AgentTasksPanel.vue'))
const FeishuBotPanel = defineAsyncComponent(() => import('./FeishuBotPanel.vue'))

withDefaults(defineProps<{ projects?: Array<{ cwd: string; label: string }> }>(), { projects: () => [] })
defineEmits<{ selectThread: [threadId: string] }>()

type FlameCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

type FlameSettings = {
  enabled: boolean
  defaultCorner: FlameCorner
  reducedMotion: boolean
  position: {
    x: number
    y: number
  } | null
}

const DEFAULT_FLAME_SETTINGS: FlameSettings = {
  enabled: true,
  defaultCorner: 'bottom-right',
  reducedMotion: false,
  position: null,
}

const { locale, localeOptions, setLocale, t } = useLocale()

const flameSettings = ref<FlameSettings>({ ...DEFAULT_FLAME_SETTINGS })
const catalogStatus = ref<CatalogSyncStatus | null>(null)
const catalogStatusError = ref('')
const isCatalogSyncing = ref(false)
const saveMessage = ref('')
const saveTone = ref<'success' | 'danger'>('success')
const hasHydrated = ref(false)
const settingsQuery = ref('')
const settingsNavItems = computed(() => [
  { id: 'settings-about', key: 'about', label: t('settings.nav.about'), terms: 'about version build git sha commit 关于 版本 构建 提交' },
  { id: 'settings-language', key: 'language', label: t('settings.nav.language'), terms: 'language locale chinese english 语言 中文 英文' },
  { id: 'settings-catalog', key: 'catalog', label: t('settings.nav.catalog'), terms: 'catalog sync projects conversations 目录 同步 项目 会话' },
  { id: 'settings-feishu', key: 'feishu', label: t('settings.nav.feishu'), terms: 'feishu lark bot app id secret bindings sessions 飞书 机器人 凭据 会话 绑定' },
  { id: 'settings-tasks', key: 'tasks', label: t('settings.nav.tasks'), terms: 'background tasks sync token diagnostics jobs 后台 任务 校准' },
  { id: 'settings-appearance', key: 'appearance', label: t('settings.nav.appearance'), terms: 'appearance theme skin layout density accent 外观 主题' },
  { id: 'settings-usage', key: 'usage', label: t('settings.nav.usage'), terms: 'usage token flame position motion 用量 火焰' },
] as const)
const visibleNavItems = computed(() => settingsNavItems.value.filter((item) => matchesSettings(item.key)))
const unifiedSaveState = computed(() => {
  if (!hasHydrated.value) return t('settings.save.loading')
  if (saveTone.value === 'danger') return t('settings.save.failed')
  if (saveMessage.value) return t('settings.save.saved')
  return t('settings.save.auto')
})
const previewLevel = computed(() => flameSettings.value.enabled ? 'bonfire' : 'spark')
const flameLevels = computed(() => [
  { level: 'spark', name: t('settings.tokenFlame.level.spark'), range: t('settings.tokenFlame.range.less20k') },
  { level: 'campfire', name: t('settings.tokenFlame.level.campfire'), range: t('settings.tokenFlame.range.20k80k') },
  { level: 'steady', name: t('settings.tokenFlame.level.steady'), range: t('settings.tokenFlame.range.80k200k') },
  { level: 'bonfire', name: t('settings.tokenFlame.level.bonfire'), range: t('settings.tokenFlame.range.200k500k') },
  { level: 'blaze', name: t('settings.tokenFlame.level.blaze'), range: t('settings.tokenFlame.range.500k1m') },
  { level: 'inferno', name: t('settings.tokenFlame.level.inferno'), range: t('settings.tokenFlame.range.1mPlus') },
] as const)
const catalogStatusTone = computed(() => {
  if (catalogStatusError.value || catalogStatus.value?.lastError) return 'danger'
  if (isCatalogSyncing.value || catalogStatus.value?.running) return 'working'
  return 'success'
})
const catalogStatusLabel = computed(() => {
  if (catalogStatusTone.value === 'danger') return t('settings.catalog.status.error')
  if (catalogStatusTone.value === 'working') return t('settings.catalog.status.running')
  return t('settings.catalog.status.ready')
})
const buildTimeLabel = computed(() => formatCatalogTime(BUILD_INFO.builtAt))

function matchesSettings(key: string): boolean {
  const query = settingsQuery.value.trim().toLowerCase()
  if (!query) return true
  const item = settingsNavItems.value.find((candidate) => candidate.key === key)
  return Boolean(item && `${item.label} ${item.terms}`.toLowerCase().includes(query))
}

function formatCatalogTime(value: string | null | undefined): string {
  if (!value) return t('settings.catalog.never')
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp))
}

async function loadCatalogStatus(): Promise<void> {
  try {
    catalogStatus.value = await fetchCatalogStatus()
    catalogStatusError.value = ''
  } catch (error) {
    catalogStatusError.value = error instanceof Error ? error.message : t('settings.catalog.failed')
  }
}

async function runCatalogSync(): Promise<void> {
  if (isCatalogSyncing.value) return
  isCatalogSyncing.value = true
  catalogStatusError.value = ''
  try {
    catalogStatus.value = await syncCatalogNow()
  } catch (error) {
    catalogStatusError.value = error instanceof Error ? error.message : t('settings.catalog.failed')
  } finally {
    isCatalogSyncing.value = false
  }
}

function onLocaleSelect(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as AppLocale)
}

function normalizeFlameSettings(value: unknown): FlameSettings {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const defaultCorner = (
    row.defaultCorner === 'bottom-left' ||
    row.defaultCorner === 'top-right' ||
    row.defaultCorner === 'top-left' ||
    row.defaultCorner === 'bottom-right'
  )
    ? row.defaultCorner
    : DEFAULT_FLAME_SETTINGS.defaultCorner

  return {
    enabled: row.enabled !== false,
    defaultCorner,
    reducedMotion: row.reducedMotion === true,
    position: normalizePosition(row.position),
  }
}

function normalizePosition(value: unknown): FlameSettings['position'] {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (!row || typeof row.x !== 'number' || typeof row.y !== 'number') return null
  if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return null
  return {
    x: row.x,
    y: row.y,
  }
}

function resetFlamePosition(): void {
  flameSettings.value = {
    ...flameSettings.value,
    position: null,
  }
}

async function loadFlameSettings(): Promise<void> {
  try {
    const setting = await fetchUserSetting<unknown>(DESKTOP_SETTING_KEYS.tokenFlameWidget)
    flameSettings.value = normalizeFlameSettings(setting?.value ?? DEFAULT_FLAME_SETTINGS)
  } catch {
    flameSettings.value = { ...DEFAULT_FLAME_SETTINGS }
  } finally {
    hasHydrated.value = true
  }
}

watch(flameSettings, (nextSettings) => {
  if (!hasHydrated.value) return
  void writeUserSetting(DESKTOP_SETTING_KEYS.tokenFlameWidget, nextSettings)
    .then(() => {
      saveTone.value = 'success'
      saveMessage.value = t('settings.tokenFlame.saved')
    })
    .catch(() => {
      saveTone.value = 'danger'
      saveMessage.value = t('settings.tokenFlame.saveFailed')
    })
}, { deep: true })

onMounted(() => {
  void loadFlameSettings()
  void loadCatalogStatus()
})
</script>

<style scoped>
@reference "../../style.css";

.app-settings-page {
  @apply mx-auto grid h-full min-h-0 w-full gap-5 overflow-y-auto px-6 pb-8 pt-4;
  grid-template-columns: 13rem minmax(0, 1fr);
  background: var(--color-background);
  color: var(--color-text);
}

.app-settings-nav {
  position: sticky;
  top: 0;
  align-self: start;
  display: grid;
  gap: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-panel);
  padding: 0.8rem;
  box-shadow: var(--shadow-panel);
}

.app-settings-search {
  display: grid;
  gap: 0.35rem;
}

.app-settings-search span {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.63rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-settings-search input {
  min-width: 0;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  padding: 0.55rem 0.65rem;
  color: var(--color-text);
  font-size: 0.78rem;
}

.app-settings-nav nav {
  display: grid;
  gap: 0.2rem;
}

.app-settings-nav a {
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.6rem;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  text-decoration: none;
}

.app-settings-nav a:hover {
  background: var(--color-elevated);
  color: var(--color-text);
}

.app-settings-save-state {
  margin: 0;
  border-top: 1px solid var(--color-border);
  padding: 0.7rem 0.25rem 0;
  color: var(--color-text-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}

.app-settings-save-state[data-tone='danger'] {
  color: var(--color-danger);
}

.app-settings-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
}

.app-settings-no-results {
  margin: 0;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: 2rem;
  color: var(--color-text-muted);
  text-align: center;
}

.app-settings-section {
  @apply rounded-lg border theme-border theme-bg-subtle p-4;
  background: var(--color-panel);
  border-color: var(--color-border);
  box-shadow: var(--shadow-panel);
}

.app-settings-section-header {
  @apply mb-3 flex items-start justify-between gap-4;
}

.catalog-sync-button {
  @apply inline-flex h-9 shrink-0 items-center justify-center rounded-md border theme-border theme-bg-panel px-3 text-sm font-medium theme-muted transition hover:theme-bg-control disabled:cursor-wait disabled:opacity-60;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.catalog-sync-status {
  @apply m-0 grid grid-cols-3 gap-3 border-t theme-border pt-3;
  border-color: var(--color-border);
}

.app-version-details {
  @apply m-0 grid gap-3 border-t theme-border pt-3 md:grid-cols-3;
  border-color: var(--color-border);
}

.app-version-details div {
  @apply min-w-0;
}

.app-version-details dt {
  @apply text-xs font-semibold theme-muted;
  color: var(--color-text-muted);
}

.app-version-details dd {
  @apply m-0 mt-1 truncate font-mono text-sm theme-text;
  color: var(--color-text);
}

.catalog-sync-status div {
  @apply min-w-0;
}

.catalog-sync-status dt {
  @apply text-xs font-semibold theme-muted;
  color: var(--color-text-muted);
}

.catalog-sync-status dd {
  @apply m-0 mt-1 truncate text-sm theme-text;
  color: var(--color-text);
}

.catalog-sync-status[data-tone='danger'] div:first-child dd,
.catalog-sync-status[data-tone='danger'] div:first-child dt {
  color: var(--color-danger);
}

.app-settings-title {
  @apply m-0 text-base font-semibold theme-text;
  color: var(--color-text);
}

.app-settings-subtitle {
  @apply m-0 mt-1 text-sm theme-muted;
  color: var(--color-text-muted);
}

.app-settings-switch {
  @apply inline-flex shrink-0 items-center gap-2 rounded-md border theme-border theme-bg-panel px-3 py-2 text-sm font-medium theme-muted;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.app-settings-switch input {
  @apply h-4 w-4;
  accent-color: var(--color-accent);
}

.app-settings-language-select {
  @apply grid shrink-0 gap-1;
}

.app-settings-language-select span {
  @apply text-xs font-semibold uppercase tracking-normal theme-muted;
  color: var(--color-text-muted);
}

.app-settings-language-select select {
  @apply h-9 min-w-40 rounded-md border theme-border theme-bg-panel px-2 text-sm theme-text outline-none transition focus:theme-border-info;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-card {
  @apply grid grid-cols-[7rem_minmax(0,1fr)] gap-4 rounded-lg border theme-border theme-bg-panel p-4;
  background: var(--color-surface);
  border-color: var(--color-border);
}

.flame-preview {
  @apply relative flex h-28 w-24 items-end justify-center justify-self-center overflow-hidden rounded-lg bg-zinc-950;
}

.flame-preview-ember,
.flame-preview-core,
.flame-preview-tip {
  @apply absolute bottom-4 block rounded-full;
  transform-origin: 50% 100%;
}

.flame-preview-ember {
  @apply h-14 w-16 bg-orange-600;
  filter: blur(1px);
}

.flame-preview-core {
  @apply h-20 w-12 bg-amber-300;
  clip-path: ellipse(45% 50% at 50% 60%);
}

.flame-preview-tip {
  @apply h-24 w-8 theme-bg-danger;
  clip-path: polygon(50% 0, 82% 48%, 68% 100%, 30% 100%, 18% 48%);
}

.flame-preview[data-level='spark'] .flame-preview-ember,
.flame-preview[data-level='spark'] .flame-preview-core,
.flame-preview[data-level='spark'] .flame-preview-tip {
  transform: scale(0.55);
  opacity: 0.72;
}

.flame-settings-copy h3 {
  @apply m-0 text-sm font-semibold theme-text;
  color: var(--color-text);
}

.flame-settings-copy p {
  @apply m-0 mt-1 text-sm leading-5 theme-muted;
  color: var(--color-text-muted);
}

.flame-settings-controls {
  @apply mt-3 flex flex-wrap items-end gap-3;
}

.flame-settings-controls label {
  @apply grid gap-1;
}

.flame-settings-controls label > span {
  @apply text-xs font-semibold uppercase tracking-normal theme-muted;
  color: var(--color-text-muted);
}

.flame-settings-controls select {
  @apply h-9 rounded-md border theme-border theme-bg-panel px-2 text-sm theme-text outline-none transition focus:theme-border-info;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-checkbox {
  @apply flex h-9 grid-flow-col items-center gap-2 rounded-md border theme-border px-2;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

.flame-settings-checkbox input {
  @apply h-4 w-4;
  accent-color: var(--color-accent);
}

.flame-settings-reset-position {
  @apply h-9 rounded-md border theme-border theme-bg-panel px-3 text-sm font-medium theme-muted transition hover:theme-bg-subtle;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-message {
  @apply mt-3 rounded-md border px-2 py-1 text-xs;
}

.flame-settings-message[data-tone='success'] {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
  background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-success) 34%, var(--color-border));
  color: color-mix(in srgb, var(--color-success) 48%, var(--color-text));
}

.flame-settings-message[data-tone='danger'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
  background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-danger) 34%, var(--color-border));
  color: color-mix(in srgb, var(--color-danger) 48%, var(--color-text));
}

.flame-level-list {
  @apply mt-3 grid list-none gap-2 p-0 md:grid-cols-2;
}

.flame-level-list li {
  @apply grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border theme-border theme-bg-panel px-3 py-2 text-sm;
  background: var(--color-surface);
  border-color: var(--color-border);
}

.flame-level-dot {
  @apply h-3 w-3 rounded-full bg-orange-400;
}

.flame-level-dot[data-level='spark'] {
  @apply bg-amber-300;
}

.flame-level-dot[data-level='campfire'],
.flame-level-dot[data-level='steady'] {
  @apply theme-bg-warning;
}

.flame-level-dot[data-level='bonfire'],
.flame-level-dot[data-level='blaze'] {
  @apply theme-bg-danger;
}

.flame-level-dot[data-level='inferno'] {
  @apply bg-fuchsia-500;
}

.flame-level-name {
  @apply min-w-0 font-medium theme-text;
  color: var(--color-text);
}

.flame-level-range {
  @apply shrink-0 text-xs theme-muted;
  color: var(--color-text-muted);
}

@media (max-width: 1000px) {
  .app-settings-page {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 0.75rem;
  }

  .app-settings-nav {
    position: relative;
  }

  .app-settings-nav nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .app-settings-save-state {
    display: none;
  }

  .app-settings-nav a {
    text-align: center;
  }

  .app-settings-section-header {
    flex-wrap: wrap;
  }

  .app-settings-language-select {
    width: 100%;
  }

  .app-settings-language-select select {
    width: 100%;
  }

  .catalog-sync-status {
    @apply grid-cols-1;
  }
}

@media (max-width: 520px) {
  .app-settings-nav nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
