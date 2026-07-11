<template>
  <section class="workspace-task-board" aria-label="Agent task board">
    <header class="workspace-task-board-header">
      <div>
        <h3 class="workspace-task-board-title">Agent Task Board</h3>
        <p class="workspace-task-board-subtitle">{{ summaryText }}</p>
      </div>
      <div class="workspace-task-board-metrics" aria-label="Task board summary">
        <span data-tone="working">{{ board.summary.codingCount }} coding</span>
        <span :data-tone="board.summary.waitingApprovalCount > 0 ? 'review' : 'neutral'">
          {{ board.summary.waitingApprovalCount }} approvals
        </span>
        <span :data-tone="board.summary.testingCount > 0 ? 'review' : 'neutral'">
          {{ board.summary.testingCount }} testing
        </span>
        <span :data-tone="board.summary.failedCount > 0 ? 'danger' : 'neutral'">
          {{ board.summary.failedCount }} failed
        </span>
        <span data-tone="review">{{ board.summary.readyForReviewCount }} ready</span>
        <span :data-tone="board.summary.failedValidationCount > 0 ? 'danger' : 'neutral'">
          {{ board.summary.failedValidationCount }} validation risks
        </span>
      </div>
    </header>

    <div class="workspace-task-board-lanes">
      <section
        v-for="lane in board.lanes"
        :key="lane.status"
        class="workspace-task-board-lane"
        :data-status="lane.status"
      >
        <header class="workspace-task-board-lane-header">
          <span>{{ lane.label }}</span>
          <span>{{ lane.cards.length }}</span>
        </header>

        <ol v-if="lane.cards.length > 0" class="workspace-task-board-card-list">
          <li v-for="card in lane.cards" :key="card.id" class="workspace-task-board-card">
            <button type="button" @click="$emit('selectThread', card.id)">
              <span class="workspace-task-board-card-title">{{ card.title }}</span>
              <span class="workspace-task-board-card-time">{{ formatThreadTime(card.updatedAtIso) }}</span>
              <span v-if="card.preview" class="workspace-task-board-card-preview">{{ card.preview }}</span>
              <span class="workspace-task-board-gate-row" :data-status="card.validationGate.status">
                {{ validationGateLabel(card.validationGate) }}
              </span>
              <span class="workspace-task-board-risk-row">
                <span
                  v-for="risk in card.risks"
                  :key="`${card.id}:${risk.label}`"
                  class="workspace-task-board-risk"
                  :data-tone="risk.level"
                >
                  {{ risk.label }}
                </span>
              </span>
            </button>
          </li>
        </ol>

        <p v-else class="workspace-task-board-empty">No tasks in this lane.</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildWorkspaceTaskBoard } from '../../composables/useWorkspaceTaskBoard'
import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../../types/codex'
import type { UiWorkspaceValidationGate } from '../../composables/useWorkspaceTaskBoard'

const props = defineProps<{
  threads: UiThread[]
  snapshot: UiWorkspaceSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
  pendingRequests: UiServerRequest[]
}>()

defineEmits<{
  selectThread: [threadId: string]
}>()

const board = computed(() =>
  buildWorkspaceTaskBoard({
    threads: props.threads,
    snapshot: props.snapshot,
    validationRuns: props.validationRuns,
    rateLimitSnapshot: props.rateLimitSnapshot,
    pendingRequests: props.pendingRequests,
  }),
)
const summaryText = computed(() => {
  if (board.value.summary.totalCount === 0) return 'No recent tasks for this workspace yet.'
  return `${String(board.value.summary.totalCount)} recent tasks monitored for execution, review, and validation risk.`
})

function formatThreadTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function validationGateLabel(gate: UiWorkspaceValidationGate): string {
  if (gate.status === 'clear') return `Required validation covered ${String(gate.coveredRequiredCount)}/${String(gate.requiredCount)}`
  if (gate.status === 'failed_required') return `${String(gate.failedRequiredCount)} required validation failed`
  if (gate.status === 'missing_required') return `${String(gate.missingRequiredCount)} required validation missing`
  if (gate.status === 'manual_required') return `${String(gate.manualRequiredCount)} required manual validation`
  return 'No required validation gate configured'
}
</script>

<style scoped>
@reference "../../style.css";

.workspace-task-board {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-task-board-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-task-board-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-task-board-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-task-board-metrics {
  @apply flex shrink-0 flex-wrap justify-end gap-1.5;
}

.workspace-task-board-metrics span,
.workspace-task-board-risk {
  @apply rounded-full border theme-border theme-bg-subtle px-2 py-0.5 text-[0.68rem] font-medium leading-4 theme-muted;
}

.workspace-task-board-metrics span[data-tone='working'],
.workspace-task-board-risk[data-tone='info'] {
  @apply theme-border-info theme-bg-info-soft theme-text-info;
}

.workspace-task-board-metrics span[data-tone='review'],
.workspace-task-board-risk[data-tone='warning'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-task-board-metrics span[data-tone='danger'],
.workspace-task-board-risk[data-tone='danger'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.workspace-task-board-lanes {
  @apply mt-3 grid grid-cols-3 gap-2;
}

.workspace-task-board-lane {
  @apply min-w-0 rounded-lg border theme-border theme-bg-subtle p-2;
}

.workspace-task-board-lane[data-status='coding'] {
  @apply theme-border-info theme-bg-info-soft;
}

.workspace-task-board-lane[data-status='waiting_for_approval'],
.workspace-task-board-lane[data-status='testing'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-task-board-lane[data-status='failed'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.workspace-task-board-lane[data-status='ready_for_review'] {
  @apply theme-border-success theme-bg-success-soft;
}

.workspace-task-board-lane-header {
  @apply flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-task-board-card-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-task-board-card button {
  @apply grid w-full gap-1 rounded-md border theme-border theme-bg-panel px-2 py-2 text-left transition hover:theme-border hover:theme-bg-subtle;
}

.workspace-task-board-card-title {
  @apply truncate text-xs font-semibold theme-text;
}

.workspace-task-board-card-time {
  @apply truncate text-[0.68rem] leading-4 theme-muted;
}

.workspace-task-board-card-preview {
  @apply line-clamp-2 text-xs leading-4 theme-muted;
}

.workspace-task-board-gate-row {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-1 text-[0.68rem] font-medium leading-4 theme-muted;
}

.workspace-task-board-gate-row[data-status='clear'] {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
}

.workspace-task-board-gate-row[data-status='missing_required'],
.workspace-task-board-gate-row[data-status='manual_required'],
.workspace-task-board-gate-row[data-status='not_configured'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-task-board-gate-row[data-status='failed_required'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.workspace-task-board-risk-row {
  @apply flex flex-wrap gap-1;
}

.workspace-task-board-empty {
  @apply m-0 mt-2 rounded-md border border-dashed theme-border bg-white/70 px-2 py-2 text-xs theme-muted;
}

@media (max-width: 920px) {
  .workspace-task-board-lanes {
    @apply grid-cols-1;
  }
}

@media (max-width: 760px) {
  .workspace-task-board-header {
    @apply flex-col;
  }

  .workspace-task-board-metrics {
    @apply justify-start;
  }
}
</style>
