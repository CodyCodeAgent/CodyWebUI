<template>
  <section class="workspace-mobile-supervision" aria-label="Mobile supervision">
    <header class="workspace-mobile-supervision-header">
      <div>
        <h3 class="workspace-mobile-supervision-title">Mobile Review</h3>
        <p class="workspace-mobile-supervision-subtitle">{{ summary.headline }} · {{ summary.statusText }}</p>
      </div>
      <span class="workspace-mobile-supervision-badge">{{ summary.riskCount }} risks</span>
    </header>

    <article v-if="summary.primaryTask" class="workspace-mobile-supervision-task">
      <div class="workspace-mobile-supervision-task-main">
        <span class="workspace-mobile-supervision-status">{{ summary.primaryTask.statusLabel }}</span>
        <strong>{{ summary.primaryTask.title }}</strong>
        <p>{{ summary.primaryTask.preview || 'No preview available.' }}</p>
      </div>
      <div class="workspace-mobile-supervision-risk-row">
        <span
          v-for="risk in summary.primaryTask.riskLabels"
          :key="risk.label"
          :data-tone="risk.level"
        >
          {{ risk.label }}
        </span>
      </div>
      <dl class="workspace-mobile-supervision-facts">
        <div>
          <dt>approvals</dt>
          <dd>{{ summary.pendingApprovalCount }}</dd>
        </div>
        <div>
          <dt>tests</dt>
          <dd>{{ summary.latestValidationStatus }}</dd>
        </div>
        <div>
          <dt>diff</dt>
          <dd>{{ summary.dirtyFileCount }}</dd>
        </div>
      </dl>

      <form class="workspace-mobile-supervision-follow-up" @submit.prevent="submitFollowUp">
        <input
          v-model="followUpText"
          type="text"
          :disabled="isBusy"
          placeholder="Short follow-up..."
          aria-label="Short follow-up"
        />
        <button type="submit" :disabled="isBusy || !followUpText.trim()">Send</button>
      </form>

      <div class="workspace-mobile-supervision-actions">
        <button type="button" :disabled="isBusy || !summary.canContinue" @click="emitContinue">Continue</button>
        <button type="button" :disabled="isBusy || !summary.canPause" @click="emitPause">Pause</button>
        <button type="button" :disabled="isBusy || !summary.canInterrupt" data-tone="danger" @click="emitInterrupt">Interrupt</button>
        <button type="button" :disabled="isBusy || !summary.canArchive" @click="emitArchive">Archive</button>
      </div>
    </article>

    <p v-else class="workspace-mobile-supervision-empty">No task is ready for mobile supervision yet.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { buildMobileSupervisionSummary } from '../../composables/useMobileSupervision'
import type {
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../../types/codex'

const props = defineProps<{
  threads: UiThread[]
  snapshot: UiWorkspaceSnapshot | null
  validationRuns: UiWorkspaceScriptRun[]
  pendingRequests: UiServerRequest[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
  isBusy: boolean
}>()

const emit = defineEmits<{
  selectThread: [threadId: string]
  followUp: [payload: { threadId: string; text: string }]
  pause: [threadId: string]
  interrupt: [threadId: string]
  archive: [threadId: string]
}>()

const followUpText = ref('')

const summary = computed(() => buildMobileSupervisionSummary({
  threads: props.threads,
  snapshot: props.snapshot,
  validationRuns: props.validationRuns,
  pendingRequests: props.pendingRequests,
  rateLimitSnapshot: props.rateLimitSnapshot,
}))
const primaryThreadId = computed(() => summary.value.primaryTask?.id ?? '')

function emitContinue(): void {
  if (!primaryThreadId.value) return
  emit('selectThread', primaryThreadId.value)
}

function emitPause(): void {
  if (!primaryThreadId.value) return
  emit('pause', primaryThreadId.value)
}

function emitInterrupt(): void {
  if (!primaryThreadId.value) return
  emit('interrupt', primaryThreadId.value)
}

function emitArchive(): void {
  if (!primaryThreadId.value) return
  emit('archive', primaryThreadId.value)
}

function submitFollowUp(): void {
  const threadId = primaryThreadId.value
  const text = followUpText.value.trim()
  if (!threadId || !text) return
  emit('followUp', { threadId, text })
  followUpText.value = ''
}

watch(primaryThreadId, () => {
  followUpText.value = ''
})
</script>

<style scoped>
@reference "../../style.css";

.workspace-mobile-supervision {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-mobile-supervision-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-mobile-supervision-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-mobile-supervision-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-mobile-supervision-badge {
  @apply shrink-0 rounded-full border theme-border theme-bg-subtle px-2 py-0.5 text-[0.68rem] font-semibold theme-muted;
}

.workspace-mobile-supervision-task {
  @apply mt-2 grid gap-2 rounded-md border theme-border theme-bg-subtle p-2;
}

.workspace-mobile-supervision-task-main {
  @apply grid gap-1;
}

.workspace-mobile-supervision-status {
  @apply w-fit rounded-full border theme-border-info theme-bg-info-soft px-2 py-0.5 text-[0.68rem] font-semibold theme-text-info;
}

.workspace-mobile-supervision-task-main strong {
  @apply truncate text-sm font-semibold theme-text;
}

.workspace-mobile-supervision-task-main p {
  @apply m-0 line-clamp-2 text-xs leading-4 theme-muted;
}

.workspace-mobile-supervision-risk-row {
  @apply flex flex-wrap gap-1;
}

.workspace-mobile-supervision-risk-row span {
  @apply rounded-full border theme-border theme-bg-panel px-2 py-0.5 text-[0.68rem] font-medium leading-4 theme-muted;
}

.workspace-mobile-supervision-risk-row span[data-tone='info'] {
  @apply theme-border-info theme-bg-info-soft theme-text-info;
}

.workspace-mobile-supervision-risk-row span[data-tone='warning'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-mobile-supervision-risk-row span[data-tone='danger'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.workspace-mobile-supervision-facts {
  @apply m-0 grid grid-cols-3 gap-1.5;
}

.workspace-mobile-supervision-facts div {
  @apply min-w-0 rounded-md border theme-border theme-bg-panel px-2 py-1;
}

.workspace-mobile-supervision-facts dt {
  @apply text-[0.65rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-mobile-supervision-facts dd {
  @apply m-0 truncate text-xs font-semibold theme-text;
}

.workspace-mobile-supervision-follow-up {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-1.5;
}

.workspace-mobile-supervision-follow-up input {
  @apply h-8 min-w-0 rounded-md border theme-border theme-bg-panel px-2 text-xs theme-text outline-none transition placeholder:theme-muted focus:theme-border-info focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:theme-bg-control;
}

.workspace-mobile-supervision-follow-up button,
.workspace-mobile-supervision-actions button {
  @apply inline-flex h-8 shrink-0 items-center justify-center rounded-md border theme-border theme-bg-panel px-2.5 text-[0.68rem] font-semibold theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-55;
}

.workspace-mobile-supervision-actions {
  @apply grid grid-cols-4 gap-1.5;
}

.workspace-mobile-supervision-actions button[data-tone='danger'] {
  @apply theme-border-danger theme-text-danger hover:theme-bg-danger-soft;
}

.workspace-mobile-supervision-empty {
  @apply m-0 mt-2 rounded-md border border-dashed theme-border px-3 py-2 text-xs theme-muted;
}

@media (max-width: 760px) {
  .workspace-mobile-supervision-actions {
    @apply grid-cols-2;
  }
}
</style>
