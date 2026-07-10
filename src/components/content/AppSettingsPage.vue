<template>
  <main class="app-settings-page" :aria-label="t('settings.aria')">
    <section class="app-settings-section">
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

    <section class="app-settings-section">
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

    <section class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">{{ t('settings.appearance.title') }}</h2>
          <p class="app-settings-subtitle">{{ t('settings.appearance.subtitle') }}</p>
        </div>
      </header>
      <WorkspaceThemePanel />
    </section>

    <section class="app-settings-section">
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
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchUserSetting, writeUserSetting } from '../../api/codexSettingsClient'
import { fetchCatalogStatus, syncCatalogNow, type CatalogSyncStatus } from '../../api/codexCatalogClient'
import { DESKTOP_SETTING_KEYS } from '../../composables/desktopSettingsKeys'
import { useLocale, type AppLocale } from '../../composables/useLocale'
import WorkspaceThemePanel from './WorkspaceThemePanel.vue'

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
@reference "tailwindcss";

.app-settings-page {
  @apply mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-y-auto px-6 pb-8 pt-4;
  background: var(--color-background);
  color: var(--color-text);
}

.app-settings-section {
  @apply rounded-lg border border-zinc-200 bg-zinc-50 p-4;
  background: var(--color-panel);
  border-color: var(--color-border);
  box-shadow: var(--shadow-panel);
}

.app-settings-section-header {
  @apply mb-3 flex items-start justify-between gap-4;
}

.catalog-sync-button {
  @apply inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.catalog-sync-status {
  @apply m-0 grid grid-cols-3 gap-3 border-t border-zinc-200 pt-3;
  border-color: var(--color-border);
}

.catalog-sync-status div {
  @apply min-w-0;
}

.catalog-sync-status dt {
  @apply text-xs font-semibold text-zinc-500;
  color: var(--color-text-muted);
}

.catalog-sync-status dd {
  @apply m-0 mt-1 truncate text-sm text-zinc-900;
  color: var(--color-text);
}

.catalog-sync-status[data-tone='danger'] div:first-child dd,
.catalog-sync-status[data-tone='danger'] div:first-child dt {
  color: var(--color-danger);
}

.app-settings-title {
  @apply m-0 text-base font-semibold text-zinc-950;
  color: var(--color-text);
}

.app-settings-subtitle {
  @apply m-0 mt-1 text-sm text-zinc-500;
  color: var(--color-text-muted);
}

.app-settings-switch {
  @apply inline-flex shrink-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700;
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
  @apply text-xs font-semibold uppercase tracking-normal text-zinc-500;
  color: var(--color-text-muted);
}

.app-settings-language-select select {
  @apply h-9 min-w-40 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none transition focus:border-blue-300;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-card {
  @apply grid grid-cols-[7rem_minmax(0,1fr)] gap-4 rounded-lg border border-zinc-200 bg-white p-4;
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
  @apply h-24 w-8 bg-rose-500;
  clip-path: polygon(50% 0, 82% 48%, 68% 100%, 30% 100%, 18% 48%);
}

.flame-preview[data-level='spark'] .flame-preview-ember,
.flame-preview[data-level='spark'] .flame-preview-core,
.flame-preview[data-level='spark'] .flame-preview-tip {
  transform: scale(0.55);
  opacity: 0.72;
}

.flame-settings-copy h3 {
  @apply m-0 text-sm font-semibold text-zinc-900;
  color: var(--color-text);
}

.flame-settings-copy p {
  @apply m-0 mt-1 text-sm leading-5 text-zinc-600;
  color: var(--color-text-muted);
}

.flame-settings-controls {
  @apply mt-3 flex flex-wrap items-end gap-3;
}

.flame-settings-controls label {
  @apply grid gap-1;
}

.flame-settings-controls label > span {
  @apply text-xs font-semibold uppercase tracking-normal text-zinc-500;
  color: var(--color-text-muted);
}

.flame-settings-controls select {
  @apply h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none transition focus:border-blue-300;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-checkbox {
  @apply flex h-9 grid-flow-col items-center gap-2 rounded-md border border-zinc-200 px-2;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

.flame-settings-checkbox input {
  @apply h-4 w-4;
  accent-color: var(--color-accent);
}

.flame-settings-reset-position {
  @apply h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.flame-settings-message {
  @apply mt-3 rounded-md border px-2 py-1 text-xs;
}

.flame-settings-message[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
  background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-success) 34%, var(--color-border));
  color: color-mix(in srgb, var(--color-success) 48%, var(--color-text));
}

.flame-settings-message[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
  background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-danger) 34%, var(--color-border));
  color: color-mix(in srgb, var(--color-danger) 48%, var(--color-text));
}

.flame-level-list {
  @apply mt-3 grid list-none gap-2 p-0 md:grid-cols-2;
}

.flame-level-list li {
  @apply grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm;
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
  @apply bg-orange-500;
}

.flame-level-dot[data-level='bonfire'],
.flame-level-dot[data-level='blaze'] {
  @apply bg-rose-500;
}

.flame-level-dot[data-level='inferno'] {
  @apply bg-fuchsia-500;
}

.flame-level-name {
  @apply min-w-0 font-medium text-zinc-900;
  color: var(--color-text);
}

.flame-level-range {
  @apply shrink-0 text-xs text-zinc-500;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .catalog-sync-status {
    @apply grid-cols-1;
  }
}
</style>
