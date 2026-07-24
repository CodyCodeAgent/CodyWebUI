<template>
  <section
    v-if="presentation"
    class="thread-context-dock"
    data-testid="thread-context-usage"
    :data-tone="presentation.tone"
    role="status"
    aria-live="polite"
  >
    <div class="thread-context-dock-copy">
      <span class="thread-context-dock-label">{{ t('composer.contextUsage.label') }}</span>
      <strong>{{ status }}</strong>
    </div>
    <span
      v-if="presentation.tone !== 'compacting' && presentation.tone !== 'compacted'"
      class="thread-context-dock-count"
    >
      {{ presentation.usedLabel }}
    </span>
    <div
      v-if="presentation.usedPercent !== null"
      class="thread-context-dock-track"
      role="progressbar"
      :aria-label="t('composer.contextUsage.aria')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="presentation.usedPercent"
    >
      <span class="thread-context-dock-fill" :style="{ width: `${String(presentation.usedPercent)}%` }" />
      <span
        v-if="presentation.autoCompactPercent !== null"
        class="thread-context-dock-threshold"
        :style="{ left: `${String(presentation.autoCompactPercent)}%` }"
        :title="t('composer.contextUsage.threshold')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildThreadContextUsagePresentation } from '../../composables/threadContextUsageRules'
import { useLocale } from '../../composables/useLocale'
import type { UiThreadContextUsage } from '../../types/codex'

const props = defineProps<{
  usage: UiThreadContextUsage | null
}>()

const { t } = useLocale()
const presentation = computed(() =>
  props.usage ? buildThreadContextUsagePresentation(props.usage) : null,
)
const status = computed(() => {
  const value = presentation.value
  if (!value) return ''
  if (value.tone === 'compacting') return t('composer.contextUsage.compacting')
  if (value.tone === 'compacted') return t('composer.contextUsage.compacted')
  const replacements = { percent: String(value.usedPercent ?? 0) }
  if (value.tone === 'critical') return t('composer.contextUsage.critical', replacements)
  if (value.tone === 'warning') return t('composer.contextUsage.warning', replacements)
  return value.usedPercent === null
    ? t('composer.contextUsage.current')
    : t('composer.contextUsage.percent', replacements)
})
</script>

<style scoped>
@reference "../../style.css";

.thread-context-dock {
  position: relative;
  z-index: 6;
  display: flex;
  min-height: 2rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.75rem;
  overflow: hidden;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  padding: 0.32rem var(--ui-content-gutter) 0.38rem;
  color: var(--color-text-muted);
  backdrop-filter: blur(18px);
}

.thread-context-dock-copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.68rem;
}

.thread-context-dock-label {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--color-text-muted) 72%, transparent);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.thread-context-dock-copy strong {
  overflow: hidden;
  color: var(--color-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-context-dock-count {
  margin-left: auto;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-variant-numeric: tabular-nums;
}

.thread-context-dock-track {
  position: absolute;
  right: var(--ui-content-gutter);
  bottom: 0;
  left: var(--ui-content-gutter);
  height: 2px;
  overflow: visible;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}

.thread-context-dock-fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  min-width: 2px;
  background: var(--color-success);
  transition: width 220ms ease, background-color 180ms ease;
}

.thread-context-dock-threshold {
  position: absolute;
  inset-block: -2px;
  width: 1px;
  background: color-mix(in srgb, var(--color-text-muted) 64%, transparent);
}

.thread-context-dock[data-tone='warning'] .thread-context-dock-fill {
  background: var(--color-warning);
}

.thread-context-dock[data-tone='critical'] .thread-context-dock-fill {
  background: var(--color-danger);
}

.thread-context-dock[data-tone='warning'] .thread-context-dock-copy strong {
  color: color-mix(in srgb, var(--color-warning) 68%, var(--color-text));
}

.thread-context-dock[data-tone='critical'] .thread-context-dock-copy strong {
  color: var(--color-danger);
}

.thread-context-dock[data-tone='compacting'] .thread-context-dock-fill {
  background: var(--color-info);
  animation: thread-context-dock-pulse 1.1s ease-in-out infinite;
}

.thread-context-dock[data-tone='compacted'] .thread-context-dock-fill {
  background: var(--color-success);
}

@keyframes thread-context-dock-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (max-width: 700px) {
  .thread-context-dock {
    min-height: 2.25rem;
    padding-inline: 0.75rem;
  }

  .thread-context-dock-track {
    right: 0.75rem;
    left: 0.75rem;
  }

  .thread-context-dock-copy strong {
    max-width: 65vw;
  }

  .thread-context-dock-count {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thread-context-dock-fill {
    transition: none;
    animation: none !important;
  }
}
</style>
