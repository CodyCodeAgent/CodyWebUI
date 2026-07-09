<template>
  <main class="app-settings-page" aria-label="Application settings">
    <section class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">Appearance</h2>
          <p class="app-settings-subtitle">Theme, density, accent, and imported skins.</p>
        </div>
      </header>
      <WorkspaceThemePanel />
    </section>

    <section class="app-settings-section">
      <header class="app-settings-section-header">
        <div>
          <h2 class="app-settings-title">Token Flame</h2>
          <p class="app-settings-subtitle">A tiny usage charm that grows from spark to blaze as daily token volume rises.</p>
        </div>
        <label class="app-settings-switch">
          <input v-model="flameSettings.enabled" type="checkbox" />
          <span>{{ flameSettings.enabled ? 'Enabled' : 'Disabled' }}</span>
        </label>
      </header>

      <div class="flame-settings-card">
        <div class="flame-preview" :data-level="previewLevel">
          <span class="flame-preview-ember" />
          <span class="flame-preview-core" />
          <span class="flame-preview-tip" />
        </div>

        <div class="flame-settings-copy">
          <h3>Daily token firepower</h3>
          <p>
            The widget will map today's token volume onto a logarithmic fire level, so small days still move and heavy days can roar.
          </p>
          <div class="flame-settings-controls">
            <label>
              <span>Default position</span>
              <select v-model="flameSettings.defaultCorner">
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </select>
            </label>
            <label class="flame-settings-checkbox">
              <input v-model="flameSettings.reducedMotion" type="checkbox" />
              <span>Calm animation</span>
            </label>
            <button class="flame-settings-reset-position" type="button" @click="resetFlamePosition">
              Reset position
            </button>
          </div>
          <p v-if="saveMessage" class="flame-settings-message" :data-tone="saveTone">{{ saveMessage }}</p>
        </div>
      </div>

      <ol class="flame-level-list" aria-label="Token flame levels">
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

const FLAME_SETTING_KEY = 'token-flame.widget.v1'
const DEFAULT_FLAME_SETTINGS: FlameSettings = {
  enabled: true,
  defaultCorner: 'bottom-right',
  reducedMotion: false,
  position: null,
}

const flameLevels = [
  { level: 'spark', name: 'Spark', range: '< 20k tokens' },
  { level: 'campfire', name: 'Campfire', range: '20k - 80k' },
  { level: 'steady', name: 'Steady burn', range: '80k - 200k' },
  { level: 'bonfire', name: 'Bonfire', range: '200k - 500k' },
  { level: 'blaze', name: 'Blaze', range: '500k - 1M' },
  { level: 'inferno', name: 'Inferno', range: '1M+ tokens' },
] as const

const flameSettings = ref<FlameSettings>({ ...DEFAULT_FLAME_SETTINGS })
const saveMessage = ref('')
const saveTone = ref<'success' | 'danger'>('success')
const hasHydrated = ref(false)
const previewLevel = computed(() => flameSettings.value.enabled ? 'bonfire' : 'spark')

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
    const setting = await fetchUserSetting<unknown>(FLAME_SETTING_KEY)
    flameSettings.value = normalizeFlameSettings(setting?.value ?? DEFAULT_FLAME_SETTINGS)
  } catch {
    flameSettings.value = { ...DEFAULT_FLAME_SETTINGS }
  } finally {
    hasHydrated.value = true
  }
}

watch(flameSettings, (nextSettings) => {
  if (!hasHydrated.value) return
  void writeUserSetting(FLAME_SETTING_KEY, nextSettings)
    .then(() => {
      saveTone.value = 'success'
      saveMessage.value = 'Saved to local settings.'
    })
    .catch(() => {
      saveTone.value = 'danger'
      saveMessage.value = 'Could not save settings; this browser session will keep the current value.'
    })
}, { deep: true })

onMounted(() => {
  void loadFlameSettings()
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
}

.flame-settings-message[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
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
</style>
