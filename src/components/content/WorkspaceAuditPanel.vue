<template>
  <section class="workspace-audit-panel" aria-label="Workspace audit trail">
    <header class="workspace-audit-panel-header">
      <div>
        <h3 class="workspace-audit-panel-title">Audit Trail</h3>
        <p class="workspace-audit-panel-subtitle">{{ auditSummary }}</p>
      </div>
      <button
        class="workspace-audit-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadAuditEvents"
      >
        <IconTablerRefresh class="workspace-audit-panel-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-audit-panel-error">{{ errorMessage }}</p>

    <ol v-if="events.length > 0" class="workspace-audit-panel-list">
      <li
        v-for="event in events"
        :key="event.id"
        class="workspace-audit-panel-event"
        :data-severity="event.severity"
      >
        <div class="workspace-audit-panel-event-main">
          <span class="workspace-audit-panel-event-kind">{{ event.kind }}</span>
          <span class="workspace-audit-panel-event-time">{{ formatEventTime(event.createdAtIso) }}</span>
        </div>
        <p class="workspace-audit-panel-event-title">{{ event.title }}</p>
        <p class="workspace-audit-panel-event-summary">{{ event.summary }}</p>
        <p v-if="metadataSummary(event)" class="workspace-audit-panel-event-meta">
          {{ metadataSummary(event) }}
        </p>
      </li>
    </ol>
    <p v-else class="workspace-audit-panel-empty">
      No audited workspace actions yet.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchWorkspaceAuditEvents } from '../../api/codexSessionClient'
import type { UiAuditEvent, UiAuditTrail } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const trail = ref<UiAuditTrail | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const events = computed(() => trail.value?.events ?? [])
const auditSummary = computed(() => {
  if (!props.cwd) return 'Choose a workspace to inspect local audit events.'
  if (isLoading.value) return 'Loading recent workspace actions...'
  if (events.value.length === 0) return 'Persistent record of checkpoints, commands, git actions, and rollbacks.'
  return `${String(events.value.length)} recent event${events.value.length === 1 ? '' : 's'}${trail.value?.truncated ? ' shown' : ''}`
})

async function loadAuditEvents(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    trail.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    trail.value = await fetchWorkspaceAuditEvents(cwd, 30)
  } catch (error) {
    trail.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load audit trail.'
  } finally {
    isLoading.value = false
  }
}

function formatEventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function metadataSummary(event: UiAuditEvent): string {
  const metadata = event.metadata
  const checkpointId = typeof metadata.checkpointId === 'string' ? metadata.checkpointId : ''
  const paths = Array.isArray(metadata.paths)
    ? metadata.paths.filter((path): path is string => typeof path === 'string')
    : []
  const path = typeof metadata.path === 'string' ? metadata.path : ''
  const status = typeof metadata.status === 'string' ? metadata.status : ''
  const parts = [
    checkpointId ? `checkpoint ${checkpointId}` : '',
    path || (paths.length > 0 ? paths.slice(0, 3).join(', ') : ''),
    status,
  ].filter(Boolean)
  return parts.join(' · ')
}

watch(
  () => props.cwd,
  () => {
    void loadAuditEvents()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.workspace-audit-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-audit-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-audit-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-audit-panel-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-audit-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-medium theme-muted transition hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-audit-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-audit-panel-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-3 py-2 text-xs theme-text-danger;
}

.workspace-audit-panel-list {
  @apply m-0 mt-2 grid max-h-96 list-none gap-1.5 overflow-auto p-0;
}

.workspace-audit-panel-event {
  @apply rounded-md border theme-border theme-bg-subtle px-2.5 py-2;
}

.workspace-audit-panel-event[data-severity='success'] {
  @apply theme-border-success theme-bg-success-soft;
}

.workspace-audit-panel-event[data-severity='warning'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-audit-panel-event[data-severity='danger'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.workspace-audit-panel-event-main {
  @apply flex items-center justify-between gap-2;
}

.workspace-audit-panel-event-kind {
  @apply min-w-0 truncate font-mono text-[0.68rem] uppercase tracking-normal theme-muted;
}

.workspace-audit-panel-event-time {
  @apply shrink-0 text-[0.68rem] theme-muted;
}

.workspace-audit-panel-event-title {
  @apply m-0 mt-1 text-xs font-semibold theme-text;
}

.workspace-audit-panel-event-summary,
.workspace-audit-panel-event-meta,
.workspace-audit-panel-empty {
  @apply m-0 mt-1 break-words text-xs leading-4 theme-muted;
}

.workspace-audit-panel-event-meta {
  @apply font-mono text-[0.68rem] theme-muted;
}
</style>
