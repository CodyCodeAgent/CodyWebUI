<template>
  <section
    v-if="health && health.status !== 'healthy'"
    class="checkpoint-health-notice"
    :data-status="health.status"
    role="status"
    aria-live="polite"
  >
    <span class="checkpoint-health-notice-rail" aria-hidden="true" />
    <div class="checkpoint-health-notice-copy">
      <p class="checkpoint-health-notice-eyebrow">{{ t('checkpointHealth.eyebrow') }}</p>
      <h3>{{ title }}</h3>
      <p>{{ summary }}</p>
      <p v-if="health.automaticBackoff" class="checkpoint-health-notice-backoff">
        {{ t('checkpointHealth.backoff', {
          count: String(health.automaticBackoff.failureCount),
          time: formatTime(health.automaticBackoff.retryAtIso),
        }) }}
      </p>
      <code :title="health.checkpointRoot">{{ health.checkpointRoot }}</code>
      <p class="checkpoint-health-notice-guidance">{{ t('checkpointHealth.guidance') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../composables/useLocale'
import type { UiCheckpointHealth } from '../../types/codex'

const props = defineProps<{
  health: UiCheckpointHealth | null
}>()

const { locale, t } = useLocale()

const title = computed(() => props.health?.status === 'unhealthy'
  ? t('checkpointHealth.unhealthyTitle')
  : t('checkpointHealth.degradedTitle'))

const summary = computed(() => t('checkpointHealth.summary', {
  blocked: String(props.health?.blockedCheckpointIds.length ?? 0),
  unknown: String(props.health?.unknownSizeCheckpointIds.length ?? 0),
  bytes: formatBytes(props.health?.knownBytes ?? 0),
}))

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}
</script>

<style scoped>
@reference "../../style.css";

.checkpoint-health-notice {
  @apply grid grid-cols-[3px_minmax(0,1fr)] overflow-hidden rounded-lg border theme-border-warning theme-bg-warning-soft;
}

.checkpoint-health-notice[data-status='unhealthy'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.checkpoint-health-notice-rail {
  @apply theme-bg-warning;
}

.checkpoint-health-notice[data-status='unhealthy'] .checkpoint-health-notice-rail {
  @apply theme-bg-danger;
}

.checkpoint-health-notice-copy {
  @apply min-w-0 px-3 py-2.5;
}

.checkpoint-health-notice-eyebrow {
  @apply m-0 font-mono text-[0.65rem] uppercase tracking-wide theme-text-warning;
}

.checkpoint-health-notice[data-status='unhealthy'] .checkpoint-health-notice-eyebrow {
  @apply theme-text-danger;
}

.checkpoint-health-notice h3 {
  @apply m-0 mt-0.5 text-sm font-semibold theme-text;
}

.checkpoint-health-notice p {
  @apply mb-0 mt-1 text-xs leading-5 theme-muted;
}

.checkpoint-health-notice-backoff {
  @apply font-medium theme-text-warning;
}

.checkpoint-health-notice code {
  @apply mt-1.5 block truncate rounded border theme-border bg-black/5 px-2 py-1 font-mono text-[0.68rem] theme-muted;
}

.checkpoint-health-notice-guidance {
  @apply font-medium theme-text;
}
</style>
