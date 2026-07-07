<template>
  <section class="workspace-recent-sessions" aria-label="Recent Codex sessions">
    <header class="workspace-recent-sessions-header">
      <div>
        <h3 class="workspace-recent-sessions-title">Recent Sessions</h3>
        <p class="workspace-recent-sessions-subtitle">{{ summaryText }}</p>
      </div>
      <button
        class="workspace-recent-sessions-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadSessions"
      >
        <IconTablerRefresh class="workspace-recent-sessions-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-recent-sessions-error">{{ errorMessage }}</p>

    <ul v-if="sessions.length > 0" class="workspace-recent-sessions-list">
      <li
        v-for="session in sessions"
        :key="session.threadId"
        class="workspace-recent-sessions-item"
        :data-status="session.status"
      >
        <button type="button" @click="$emit('selectThread', session.threadId)">
          <span class="workspace-recent-sessions-item-main">
            <span class="workspace-recent-sessions-thread">{{ session.title }}</span>
            <span class="workspace-recent-sessions-status">{{ formatStatus(session.status) }}</span>
          </span>
          <span class="workspace-recent-sessions-summary">{{ session.latestSummary }}</span>
          <span class="workspace-recent-sessions-meta">
            {{ formatEventTime(session.updatedAtIso) }} · {{ session.eventCount }} events · {{ session.latestEventKind.replace(/_/gu, ' ') }}
          </span>
          <span v-if="session.tokenUsageEventCount > 0" class="workspace-recent-sessions-meta">
            {{ formatTokenCount(session.totalTokens) }} tokens · {{ formatTokenCount(session.inputTokens) }} in · {{ formatTokenCount(session.outputTokens) }} out
          </span>
        </button>
        <dl class="workspace-recent-sessions-counts">
          <div>
            <dt>approvals</dt>
            <dd>{{ session.approvalCount }}</dd>
          </div>
          <div>
            <dt>failures</dt>
            <dd>{{ session.failedCount }}</dd>
          </div>
          <div>
            <dt>plans</dt>
            <dd>{{ session.planUpdateCount }}</dd>
          </div>
        </dl>
      </li>
    </ul>

    <p v-else class="workspace-recent-sessions-empty">
      {{ emptyText }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchWorkspaceRecentSessions } from '../../api/codexSessionClient'
import type { UiWorkspaceSessionSummary, UiWorkspaceSessionSummaryTrail, UiWorkspaceSessionStatus } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

defineEmits<{
  selectThread: [threadId: string]
}>()

const trail = ref<UiWorkspaceSessionSummaryTrail | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const sessions = computed<UiWorkspaceSessionSummary[]>(() => trail.value?.sessions ?? [])
const summaryText = computed(() => {
  if (!props.cwd.trim()) return 'Choose a workspace to inspect persisted Codex activity.'
  if (isLoading.value) return 'Loading workspace session history...'
  if (sessions.value.length === 0) return 'Persisted starts, approvals, plans, completions, and failures by thread.'
  const activeCount = sessions.value.filter((session) => session.status === 'running' || session.status === 'active').length
  const approvalCount = sessions.value.filter((session) => session.status === 'waiting_for_approval').length
  return `${String(sessions.value.length)} session${sessions.value.length === 1 ? '' : 's'} · ${String(activeCount)} active · ${String(approvalCount)} waiting`
})
const emptyText = computed(() => {
  if (!props.cwd.trim()) return 'No workspace selected.'
  if (isLoading.value) return 'Loading recent sessions...'
  return 'No persisted Codex sessions for this workspace yet.'
})

async function loadSessions(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    trail.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    trail.value = await fetchWorkspaceRecentSessions(cwd, 12)
  } catch (error) {
    trail.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load recent sessions.'
  } finally {
    isLoading.value = false
  }
}

function formatStatus(status: UiWorkspaceSessionStatus): string {
  return status.replace(/_/gu, ' ')
}

function formatEventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

watch(
  () => props.cwd,
  () => {
    void loadSessions()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-recent-sessions {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-recent-sessions-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-recent-sessions-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-recent-sessions-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-recent-sessions-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-recent-sessions-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-recent-sessions-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-recent-sessions-list {
  @apply m-0 mt-2 grid list-none gap-2 p-0;
}

.workspace-recent-sessions-item {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-recent-sessions-item[data-status='running'],
.workspace-recent-sessions-item[data-status='active'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-recent-sessions-item[data-status='waiting_for_approval'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-recent-sessions-item[data-status='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-recent-sessions-item[data-status='completed'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-recent-sessions-item button {
  @apply min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left;
}

.workspace-recent-sessions-item-main {
  @apply flex min-w-0 items-center gap-2;
}

.workspace-recent-sessions-thread {
  @apply truncate text-xs font-semibold text-zinc-900;
}

.workspace-recent-sessions-status {
  @apply shrink-0 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-recent-sessions-summary {
  @apply mt-1 block truncate text-xs text-zinc-700;
}

.workspace-recent-sessions-meta {
  @apply mt-1 block truncate font-mono text-[0.68rem] text-zinc-500;
}

.workspace-recent-sessions-counts {
  @apply m-0 grid grid-cols-3 gap-1.5;
}

.workspace-recent-sessions-counts div {
  @apply min-w-14 rounded-md border border-white/70 bg-white/70 px-2 py-1 text-center;
}

.workspace-recent-sessions-counts dt {
  @apply text-[0.62rem] uppercase tracking-normal text-zinc-500;
}

.workspace-recent-sessions-counts dd {
  @apply m-0 text-xs font-semibold text-zinc-900;
}

.workspace-recent-sessions-empty {
  @apply m-0 mt-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}

@media (max-width: 760px) {
  .workspace-recent-sessions-item {
    @apply grid-cols-1;
  }

  .workspace-recent-sessions-counts {
    @apply grid-cols-3;
  }
}
</style>
