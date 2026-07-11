<template>
  <section class="thread-session-replay-panel" aria-label="Session replay">
    <header class="thread-session-replay-header">
      <div>
        <h3 class="thread-session-replay-title">Session Replay</h3>
        <p class="thread-session-replay-subtitle">{{ replaySummary }}</p>
      </div>
      <button
        class="thread-session-replay-refresh"
        type="button"
        :disabled="isLoading || !canLoad"
        @click="loadEvents"
      >
        <IconTablerRefresh class="thread-session-replay-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="thread-session-replay-error">{{ errorMessage }}</p>

    <ol v-if="events.length > 0" class="thread-session-replay-list">
      <li
        v-for="event in events"
        :key="event.id"
        class="thread-session-replay-event"
        :data-severity="event.severity"
      >
        <div class="thread-session-replay-event-main">
          <span class="thread-session-replay-event-kind">{{ formatKind(event.kind) }}</span>
          <span class="thread-session-replay-event-time">{{ formatEventTime(event.createdAtIso) }}</span>
        </div>
        <p class="thread-session-replay-event-title">{{ event.title }}</p>
        <p class="thread-session-replay-event-summary">{{ event.summary }}</p>
        <p v-if="metadataSummary(event)" class="thread-session-replay-event-meta">
          {{ metadataSummary(event) }}
        </p>
      </li>
    </ol>

    <p v-else class="thread-session-replay-empty">
      {{ emptyText }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchCodexSessionEvents } from '../../api/codexSessionClient'
import type { UiCodexSessionEvent, UiCodexSessionEventTrail } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
  threadId: string
}>()

const trail = ref<UiCodexSessionEventTrail | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const canLoad = computed(() => props.cwd.trim().length > 0 && props.threadId.trim().length > 0)
const events = computed(() => trail.value?.events ?? [])
const replaySummary = computed(() => {
  if (!props.cwd.trim()) return 'Choose a workspace to inspect live Codex session events.'
  if (!props.threadId.trim()) return 'Choose a thread to inspect persisted runtime events.'
  if (isLoading.value) return 'Loading persisted Codex notifications...'
  if (events.value.length === 0) return 'Persistent record of starts, approvals, plans, completions, and compaction.'
  return `${String(events.value.length)} recent event${events.value.length === 1 ? '' : 's'}${trail.value?.truncated ? ' shown' : ''}`
})
const emptyText = computed(() => {
  if (!props.threadId.trim()) return 'No thread selected.'
  if (isLoading.value) return 'Loading session events...'
  return 'No persisted session events for this thread yet.'
})

async function loadEvents(): Promise<void> {
  const cwd = props.cwd.trim()
  const threadId = props.threadId.trim()
  if (!cwd || !threadId) {
    trail.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    trail.value = await fetchCodexSessionEvents(cwd, threadId, 80)
  } catch (error) {
    trail.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load session replay.'
  } finally {
    isLoading.value = false
  }
}

function formatEventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatKind(value: string): string {
  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
}

function metadataSummary(event: UiCodexSessionEvent): string {
  const metadata = event.metadata
  const method = event.method ? `method ${event.method}` : ''
  const turnId = typeof metadata.turnId === 'string' && metadata.turnId ? `turn ${metadata.turnId}` : ''
  const requestMethod = typeof metadata.requestMethod === 'string' && metadata.requestMethod
    ? metadata.requestMethod
    : ''
  const usedPercent = typeof metadata.usedPercent === 'number'
    ? `usage ${String(Math.round(metadata.usedPercent))}%`
    : ''
  const beforeCheckpoint = typeof metadata.beforeCheckpointId === 'string' && metadata.beforeCheckpointId
    ? `before checkpoint ${metadata.beforeCheckpointId}`
    : ''
  const afterCheckpoint = typeof metadata.afterCheckpointId === 'string' && metadata.afterCheckpointId
    ? `after checkpoint ${metadata.afterCheckpointId}`
    : ''
  return [method, requestMethod, turnId, usedPercent, beforeCheckpoint, afterCheckpoint].filter(Boolean).join(' · ')
}

watch(
  () => [props.cwd, props.threadId],
  () => {
    void loadEvents()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.thread-session-replay-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.thread-session-replay-header {
  @apply flex items-start justify-between gap-3;
}

.thread-session-replay-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.thread-session-replay-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.thread-session-replay-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-medium theme-muted transition hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-session-replay-refresh-icon {
  @apply h-3.5 w-3.5;
}

.thread-session-replay-error {
  @apply mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-2 py-1.5 text-xs theme-text-danger;
}

.thread-session-replay-list {
  @apply mt-2 flex max-h-64 flex-col gap-2 overflow-auto p-0;
  list-style: none;
}

.thread-session-replay-event {
  @apply rounded-md border theme-border theme-bg-subtle p-2;
}

.thread-session-replay-event[data-severity='success'] {
  @apply theme-border-success theme-bg-success-soft;
}

.thread-session-replay-event[data-severity='warning'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.thread-session-replay-event[data-severity='danger'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.thread-session-replay-event-main {
  @apply flex items-center justify-between gap-2;
}

.thread-session-replay-event-kind {
  @apply truncate text-[0.68rem] font-semibold uppercase tracking-normal theme-muted;
}

.thread-session-replay-event-time {
  @apply shrink-0 text-[0.68rem] theme-muted;
}

.thread-session-replay-event-title {
  @apply m-0 mt-1 text-xs font-semibold theme-text;
}

.thread-session-replay-event-summary,
.thread-session-replay-event-meta,
.thread-session-replay-empty {
  @apply m-0 mt-1 break-words text-xs leading-4 theme-muted;
}

.thread-session-replay-event-meta {
  @apply font-mono text-[0.68rem] theme-muted;
}
</style>
