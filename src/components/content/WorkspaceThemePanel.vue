<template>
  <section class="workspace-theme-panel" :aria-label="t('theme.aria')">
    <header class="workspace-theme-panel-header">
      <div>
        <h3 class="workspace-theme-panel-title">{{ t('theme.title') }}</h3>
        <p class="workspace-theme-panel-subtitle" data-testid="theme-summary">{{ themeSummary }}</p>
        <p
          v-if="themeDetail"
          class="workspace-theme-panel-detail"
          data-testid="theme-detail"
        >
          {{ themeDetail }}
        </p>
      </div>
      <button class="workspace-theme-panel-reset" type="button" @click="resetTheme">{{ t('theme.reset') }}</button>
    </header>

    <p
      v-if="hasWorkspaceThemeBinding"
      class="workspace-theme-panel-workspace-binding"
      data-testid="theme-workspace-binding"
    >
      {{ t('theme.workspaceBindingActive') }} · {{ workspaceThemeSummary }}
    </p>
    <p
      v-if="themePersistenceError"
      class="workspace-theme-panel-persistence-error"
      data-testid="theme-persistence-error"
      role="alert"
    >
      {{ themePersistenceError }}
    </p>

    <div class="workspace-theme-panel-grid">
      <label>
        <span>{{ t('theme.skin') }}</span>
        <select
          data-testid="theme-skin-select"
          :value="effectivePreferences.skinId"
          :disabled="effectivePreferences.followSystem || hasWorkspaceThemeBinding"
          @change="onSkinSelect"
        >
          <option v-for="skin in availableSkins" :key="skin.id" :value="skin.id">{{ skin.name }}</option>
        </select>
      </label>

      <label>
        <span>{{ t('theme.layout') }}</span>
        <select
          data-testid="theme-layout-select"
          :value="effectivePreferences.layoutPresetId"
          :disabled="hasWorkspaceThemeBinding"
          @change="onLayoutSelect"
        >
          <option v-for="preset in layoutPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
        </select>
      </label>

      <label>
        <span>{{ t('theme.density') }}</span>
        <select
          data-testid="theme-density-select"
          :value="effectivePreferences.density"
          :disabled="hasWorkspaceThemeBinding"
          @change="onDensitySelect"
        >
          <option value="compact">{{ t('theme.density.compact') }}</option>
          <option value="comfortable">{{ t('theme.density.comfortable') }}</option>
          <option value="spacious">{{ t('theme.density.spacious') }}</option>
        </select>
      </label>

      <label>
        <span>{{ t('theme.accent') }}</span>
        <input
          data-testid="theme-accent-input"
          :value="accentDraft"
          :disabled="hasWorkspaceThemeBinding"
          type="color"
          @input="onAccentInput"
        />
      </label>
    </div>

    <label class="workspace-theme-panel-follow">
      <input
        data-testid="theme-follow-system"
        type="checkbox"
        :checked="effectivePreferences.followSystem"
        :disabled="hasWorkspaceThemeBinding"
        @change="onFollowSystemChange"
      />
      <span>{{ t('theme.followSystem') }}</span>
    </label>

    <details class="workspace-theme-panel-advanced">
      <summary>{{ t('theme.skinJson') }}</summary>
      <div class="workspace-theme-panel-json-actions">
        <button type="button" @click="exportSkin">{{ t('theme.export') }}</button>
        <button type="button" @click="importSkinDraft">{{ t('theme.import') }}</button>
      </div>
      <textarea v-model="skinJsonDraft" spellcheck="false" />
      <p v-if="skinJsonMessage" class="workspace-theme-panel-message" :data-tone="skinJsonMessageTone">
        {{ skinJsonMessage }}
      </p>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LAYOUT_PRESETS } from '../../theme/themeRegistry'
import { useTheme } from '../../theme/useTheme'
import type { LayoutPresetId, ThemeDensity } from '../../theme/tokens'
import type { UiWorkspaceConfig } from '../../types/codex'
import { useLocale } from '../../composables/useLocale'

const props = defineProps<{
  workspaceTheme?: UiWorkspaceConfig['theme'] | null
}>()

const {
  effectivePreferences,
  availableSkins,
  activeSkin,
  activeLayoutPreset,
  workspacePreferences,
  themePersistenceError,
  setSkin,
  setAccentColor,
  setDensity,
  setLayoutPreset,
  setFollowSystem,
  setWorkspaceThemePreferences,
  clearWorkspaceThemePreferences,
  resetTheme,
  exportActiveSkin,
  importSkin,
} = useTheme()
const { t } = useLocale()

const layoutPresets = LAYOUT_PRESETS
const skinJsonDraft = ref('')
const skinJsonMessage = ref('')
const skinJsonMessageTone = ref<'success' | 'danger'>('success')
const accentDraft = computed(() => effectivePreferences.value.accentColor || activeSkin.value.tokens.color.accent)
const hasWorkspaceThemeBinding = computed(() => workspacePreferences.value !== null)
const selectedSkinName = computed(() =>
  availableSkins.value.find((skin) => skin.id === effectivePreferences.value.skinId)?.name ?? activeSkin.value.name,
)
const themeSummary = computed(() => {
  const mode = effectivePreferences.value.followSystem ? t('theme.followSystem') : selectedSkinName.value
  return `${mode} · ${activeLayoutPreset.value.name}`
})
const themeDetail = computed(() => {
  if (hasWorkspaceThemeBinding.value) return t('theme.detail.workspaceOverride')
  if (effectivePreferences.value.followSystem) return t('theme.detail.activeSkin', { name: activeSkin.value.name })
  if (effectivePreferences.value.accentColor) {
    return t('theme.detail.accentOverride', { value: effectivePreferences.value.accentColor })
  }
  return ''
})
const workspaceThemeSummary = computed(() => {
  const theme = workspacePreferences.value
  if (!theme) return t('theme.personalDefaults')
  const parts = [
    theme.skinId ? t('theme.summary.skin', { value: theme.skinId }) : '',
    theme.layoutPresetId ? t('theme.summary.layout', { value: theme.layoutPresetId }) : '',
    theme.density ? t('theme.summary.density', { value: theme.density }) : '',
    theme.accentColor ? t('theme.summary.accent', { value: theme.accentColor }) : '',
    theme.followSystem !== null
      ? t('theme.summary.system', { value: theme.followSystem ? t('theme.summary.on') : t('theme.summary.off') })
      : '',
  ].filter(Boolean)
  return parts.join(' · ') || t('theme.workspaceDefaults')
})

function onSkinSelect(event: Event): void {
  setSkin((event.target as HTMLSelectElement).value)
}

function onLayoutSelect(event: Event): void {
  setLayoutPreset((event.target as HTMLSelectElement).value as LayoutPresetId)
}

function onDensitySelect(event: Event): void {
  setDensity((event.target as HTMLSelectElement).value as ThemeDensity)
}

function onAccentInput(event: Event): void {
  setAccentColor((event.target as HTMLInputElement).value)
}

function onFollowSystemChange(event: Event): void {
  setFollowSystem((event.target as HTMLInputElement).checked)
}

function exportSkin(): void {
  skinJsonDraft.value = exportActiveSkin()
  skinJsonMessage.value = t('theme.exported')
  skinJsonMessageTone.value = 'success'
}

function importSkinDraft(): void {
  try {
    const skin = importSkin(skinJsonDraft.value)
    skinJsonMessage.value = t('theme.imported', { name: skin.name })
    skinJsonMessageTone.value = 'success'
  } catch (error) {
    skinJsonMessage.value = error instanceof Error ? error.message : t('theme.importFailed')
    skinJsonMessageTone.value = 'danger'
  }
}

watch(activeSkin, () => {
  skinJsonMessage.value = ''
})

watch(() => props.workspaceTheme, (theme) => {
  if (theme) {
    setWorkspaceThemePreferences(theme)
    return
  }
  clearWorkspaceThemePreferences()
}, { immediate: true, deep: true })
</script>

<style scoped>
@reference "tailwindcss";

.workspace-theme-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
  background: var(--color-surface);
  border-color: var(--color-border);
  box-shadow: var(--shadow-panel);
  color: var(--color-text);
}

.workspace-theme-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-theme-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
  color: var(--color-text-muted);
}

.workspace-theme-panel-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
  color: var(--color-text);
}

.workspace-theme-panel-detail {
  @apply m-0 mt-1 text-xs text-zinc-500;
  color: var(--color-text-muted);
}

.workspace-theme-panel-workspace-binding {
  @apply m-0 mt-3 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 32%, var(--color-border));
  color: var(--color-accent);
}

.workspace-theme-panel-persistence-error {
  @apply m-0 mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700;
  background: color-mix(in srgb, var(--color-danger) 12%, var(--color-panel));
  border-color: color-mix(in srgb, var(--color-danger) 32%, var(--color-border));
  color: color-mix(in srgb, var(--color-danger) 42%, var(--color-text));
}

.workspace-theme-panel-reset,
.workspace-theme-panel-json-actions button {
  @apply inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.workspace-theme-panel-grid {
  @apply mt-3 grid grid-cols-4 gap-2;
}

.workspace-theme-panel-grid label {
  @apply grid gap-1;
}

.workspace-theme-panel-grid span,
.workspace-theme-panel-follow span {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
  color: var(--color-text-muted);
}

.workspace-theme-panel-grid select,
.workspace-theme-panel-grid input {
  @apply h-8 min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-blue-300;
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.workspace-theme-panel-grid input[type='color'] {
  @apply p-1;
  background: var(--color-elevated);
}

.workspace-theme-panel-follow {
  @apply mt-3 flex items-center gap-2;
}

.workspace-theme-panel-follow input {
  @apply h-4 w-4;
  accent-color: var(--color-accent);
}

.workspace-theme-panel-advanced {
  @apply mt-3 border-t border-zinc-200 pt-2;
  border-color: var(--color-border);
}

.workspace-theme-panel-advanced summary {
  @apply cursor-pointer text-xs font-medium text-zinc-700;
  color: var(--color-text);
}

.workspace-theme-panel-json-actions {
  @apply mt-2 flex gap-2;
}

.workspace-theme-panel-advanced textarea {
  @apply mt-2 h-36 w-full resize-y rounded-md border border-zinc-200 bg-zinc-950 p-2 font-mono text-[0.68rem] leading-4 text-zinc-100 outline-none;
  background: var(--color-code-background);
  border-color: var(--color-border);
}

.workspace-theme-panel-message {
  @apply m-0 mt-2 rounded-md border px-2 py-1 text-xs;
}

.workspace-theme-panel-message[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.workspace-theme-panel-message[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

@media (max-width: 920px) {
  .workspace-theme-panel-grid {
    @apply grid-cols-2;
  }
}

@media (max-width: 560px) {
  .workspace-theme-panel-grid {
    @apply grid-cols-1;
  }
}
</style>
