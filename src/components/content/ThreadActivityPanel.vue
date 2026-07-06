<template>
  <aside class="thread-activity-panel" aria-label="Thread activity and evidence">
    <header class="thread-activity-header">
      <div>
        <h2 class="thread-activity-title">Activity</h2>
        <p class="thread-activity-subtitle">{{ statusText }}</p>
      </div>
    </header>

    <section class="thread-activity-metrics" aria-label="Activity summary">
      <div class="thread-activity-metric">
        <span class="thread-activity-metric-value">{{ summary.toolCount }}</span>
        <span class="thread-activity-metric-label">tools</span>
      </div>
      <div class="thread-activity-metric">
        <span class="thread-activity-metric-value">{{ summary.commandCount }}</span>
        <span class="thread-activity-metric-label">commands</span>
      </div>
      <div class="thread-activity-metric">
        <span class="thread-activity-metric-value">{{ summary.fileChangeCount }}</span>
        <span class="thread-activity-metric-label">diffs</span>
      </div>
      <div class="thread-activity-metric" :data-alert="summary.failedCount > 0">
        <span class="thread-activity-metric-value">{{ summary.failedCount }}</span>
        <span class="thread-activity-metric-label">failed</span>
      </div>
    </section>

    <section v-if="pendingRequests.length > 0" class="thread-activity-section">
      <h3 class="thread-activity-section-title">Pending approvals</h3>
      <article v-for="request in pendingRequests" :key="request.id" class="activity-request-card">
        <p class="activity-request-method">{{ approvalSummary(request).title }}</p>
        <p class="activity-request-meta">#{{ request.id }} · {{ formatIsoTime(request.receivedAtIso) }}</p>
        <p class="activity-request-subject">{{ approvalSummary(request).subject }}</p>
        <div class="approval-risk-line">
          <span class="approval-risk-badge" :data-level="approvalSummary(request).level">
            {{ approvalSummary(request).level }}
          </span>
          <span
            v-for="label in approvalSummary(request).riskLabels"
            :key="`${request.id}:${label}`"
            class="approval-risk-label"
          >
            {{ label }}
          </span>
        </div>
        <p class="activity-request-reason">{{ approvalSummary(request).description }}</p>
        <ul class="approval-impact-list">
          <li v-for="impact in approvalSummary(request).impacts" :key="`${request.id}:${impact}`">
            {{ impact }}
          </li>
        </ul>
        <div class="approval-scope-line" aria-label="Approval scopes">
          <span
            v-for="scope in approvalScopeOptions"
            :key="`${request.id}:${scope.scope}`"
            class="approval-scope"
            :data-enabled="scope.enabled"
            :title="scope.description"
          >
            {{ scope.label }}
          </span>
        </div>
        <p class="approval-recommendation">{{ approvalSummary(request).recommendation }}</p>

        <div class="activity-request-actions">
          <template v-if="isApprovalRequest(request)">
            <button
              v-for="scope in approvalScopeOptions"
              :key="`${request.id}:action:${scope.scope}`"
              class="activity-request-button"
              :class="{ 'activity-request-button-primary': scope.scope === 'single', 'activity-request-button-danger': scope.scope === 'permanent' }"
              type="button"
              @click="onRespondApprovalScope(request.id, scope.scope)"
            >
              {{ scope.label }}
            </button>
            <button class="activity-request-button" type="button" @click="onRespondApproval(request.id, 'decline')">
              Decline
            </button>
          </template>
          <template v-else>
            <button class="activity-request-button activity-request-button-primary" type="button" @click="onRespondEmptyResult(request.id)">
              Empty result
            </button>
            <button class="activity-request-button" type="button" @click="onRejectRequest(request.id)">
              Reject
            </button>
          </template>
        </div>
      </article>
    </section>

    <ThreadValidationPanel :messages="messages" />
    <ThreadSessionReplayPanel :cwd="cwd" :thread-id="threadId" />
    <ThreadDiffReviewPanel :messages="messages" :cwd="cwd" @rollback-completed="onRollbackCompleted" />

    <section class="thread-activity-section thread-activity-section-scroll">
      <h3 class="thread-activity-section-title">Evidence timeline</h3>
      <p v-if="activityEntries.length === 0" class="thread-activity-empty">No tool evidence yet.</p>

      <article
        v-for="entry in activityEntries"
        :key="entry.messageId"
        class="activity-entry-card"
        :data-tone="toolStatusTone(entry.status)"
      >
        <header class="activity-entry-header">
          <span class="activity-entry-kind">{{ entry.title }}</span>
          <span class="activity-entry-status">{{ formatToolStatus(entry.status) }}</span>
        </header>
        <p class="activity-entry-summary">{{ entry.summary }}</p>
        <ul v-if="entry.details.length > 0" class="activity-entry-detail-list">
          <li v-for="detail in entry.details" :key="detail" class="activity-entry-detail">{{ detail }}</li>
        </ul>
        <details v-if="entry.output" class="activity-entry-output">
          <summary>{{ entry.outputLabel || 'Output' }}</summary>
          <pre><code>{{ entry.output }}</code></pre>
        </details>
      </article>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  buildThreadActivityEntries,
  buildThreadActivitySummary,
  isToolFailureStatus,
} from '../../composables/useThreadActivity'
import {
  APPROVAL_SCOPE_OPTIONS,
  approvalDecisionForScope,
  approvalScopeForDecision,
  buildApprovalRiskSummary,
  type UiApprovalDecision,
} from '../../composables/useApprovalRisk'
import type { UiApprovalDecisionScope, UiMessage, UiServerRequest, UiServerRequestReply, UiToolingRollbackFileResult } from '../../types/codex'
import ThreadDiffReviewPanel from './ThreadDiffReviewPanel.vue'
import ThreadSessionReplayPanel from './ThreadSessionReplayPanel.vue'
import ThreadValidationPanel from './ThreadValidationPanel.vue'

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  cwd: string
  threadId: string
}>()

const emit = defineEmits<{
  respondServerRequest: [payload: UiServerRequestReply]
  rollbackCompleted: [result: UiToolingRollbackFileResult]
}>()
const approvalScopeOptions = APPROVAL_SCOPE_OPTIONS

const activityEntries = computed(() => buildThreadActivityEntries(props.messages))
const summary = computed(() => buildThreadActivitySummary(props.messages, props.pendingRequests))
const statusText = computed(() => {
  if (summary.value.pendingRequestCount > 0) return `${summary.value.pendingRequestCount} waiting`
  if (summary.value.failedCount > 0) return `${summary.value.failedCount} failed`
  if (summary.value.toolCount > 0) return `${summary.value.toolCount} recorded`
  return 'No evidence yet'
})

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function approvalSummary(request: UiServerRequest) {
  return buildApprovalRiskSummary(request)
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return (
    request.method === 'item/commandExecution/requestApproval' ||
    request.method === 'item/fileChange/requestApproval'
  )
}

function onRespondApproval(requestId: number, decision: UiApprovalDecision): void {
  emit('respondServerRequest', {
    id: requestId,
    approvalScope: approvalScopeForDecision(decision),
    result: { decision },
  })
}

function onRespondApprovalScope(requestId: number, scope: UiApprovalDecisionScope): void {
  emit('respondServerRequest', {
    id: requestId,
    approvalScope: scope,
    result: { decision: approvalDecisionForScope(scope) },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local activity panel.',
    },
  })
}

function onRollbackCompleted(result: UiToolingRollbackFileResult): void {
  emit('rollbackCompleted', result)
}

function formatToolStatus(status: string): string {
  const normalized = status.trim()
  if (!normalized) return 'unknown'
  return normalized
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
}

function toolStatusTone(status: string): 'success' | 'danger' | 'working' | 'neutral' {
  const normalized = status.trim().toLowerCase()
  if (!normalized) return 'neutral'
  if (isToolFailureStatus(normalized)) return 'danger'
  if (
    normalized.includes('running') ||
    normalized.includes('progress') ||
    normalized.includes('pending') ||
    normalized.includes('started')
  ) {
    return 'working'
  }
  if (
    normalized.includes('success') ||
    normalized.includes('complete') ||
    normalized.includes('done') ||
    normalized.includes('applied')
  ) {
    return 'success'
  }
  return 'neutral'
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-activity-panel {
  @apply flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3;
}

.thread-activity-header {
  @apply flex shrink-0 items-start justify-between gap-3;
}

.thread-activity-title {
  @apply m-0 text-sm font-semibold text-slate-900;
}

.thread-activity-subtitle {
  @apply m-0 mt-0.5 text-xs text-slate-500;
}

.thread-activity-metrics {
  @apply grid shrink-0 grid-cols-4 gap-1.5;
}

.thread-activity-metric {
  @apply min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5;
}

.thread-activity-metric[data-alert='true'] {
  @apply border-rose-200 bg-rose-50;
}

.thread-activity-metric-value {
  @apply block text-sm font-semibold leading-5 text-slate-900;
}

.thread-activity-metric-label {
  @apply block truncate text-[0.68rem] leading-4 text-slate-500;
}

.thread-activity-section {
  @apply flex shrink-0 flex-col gap-2;
}

.thread-activity-section-scroll {
  @apply min-h-0 flex-1 overflow-y-auto pr-0.5;
}

.thread-activity-section-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-slate-500;
}

.thread-activity-empty {
  @apply m-0 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500;
}

.activity-request-card,
.activity-entry-card {
  @apply rounded-lg border border-slate-200 bg-slate-50 px-3 py-2;
}

.activity-request-method {
  @apply m-0 truncate font-mono text-xs font-semibold text-slate-900;
}

.activity-request-meta {
  @apply m-0 mt-0.5 text-xs text-slate-500;
}

.activity-request-subject {
  @apply m-0 mt-1 max-w-full whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-900;
}

.approval-risk-line {
  @apply mt-2 flex flex-wrap items-center gap-1.5;
}

.approval-risk-badge {
  @apply rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase leading-4;
}

.approval-risk-badge[data-level='low'] {
  @apply border-emerald-300 bg-emerald-50 text-emerald-800;
}

.approval-risk-badge[data-level='medium'] {
  @apply border-amber-300 bg-amber-100 text-amber-900;
}

.approval-risk-badge[data-level='high'] {
  @apply border-rose-300 bg-rose-100 text-rose-800;
}

.approval-risk-label {
  @apply rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] leading-4 text-slate-700;
}

.activity-request-reason {
  @apply m-0 mt-2 whitespace-pre-wrap text-xs leading-4 text-slate-700;
}

.approval-impact-list {
  @apply m-0 mt-2 list-disc space-y-1 pl-4 text-xs leading-4 text-slate-700;
}

.approval-scope-line {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.approval-scope {
  @apply rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-normal text-blue-700;
}

.approval-scope[data-enabled='false'] {
  @apply border-slate-200 bg-slate-100 text-slate-500;
}

.approval-recommendation {
  @apply m-0 mt-2 rounded-md border border-slate-200 bg-white/70 px-2 py-1.5 text-xs leading-4 text-slate-800;
}

.activity-request-actions {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.activity-request-button {
  @apply rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 transition hover:bg-amber-100;
}

.activity-request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.activity-request-button-danger {
  @apply border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100;
}

.activity-entry-card {
  @apply mb-2;
}

.activity-entry-card[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.activity-entry-card[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.activity-entry-card[data-tone='working'] {
  @apply border-blue-200 bg-blue-50;
}

.activity-entry-header {
  @apply flex items-center gap-2;
}

.activity-entry-kind {
  @apply min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-normal text-slate-600;
}

.activity-entry-status {
  @apply shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] leading-4 font-medium text-slate-600;
}

.activity-entry-card[data-tone='success'] .activity-entry-status {
  @apply border-emerald-200 bg-emerald-100 text-emerald-800;
}

.activity-entry-card[data-tone='danger'] .activity-entry-status {
  @apply border-rose-200 bg-rose-100 text-rose-800;
}

.activity-entry-card[data-tone='working'] .activity-entry-status {
  @apply border-blue-200 bg-blue-100 text-blue-800;
}

.activity-entry-summary {
  @apply m-0 mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-900;
}

.activity-entry-detail-list {
  @apply m-0 mt-2 grid list-none gap-1 p-0;
}

.activity-entry-detail {
  @apply m-0 truncate font-mono text-xs leading-4 text-slate-600;
}

.activity-entry-output {
  @apply mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600;
}

.activity-entry-output summary {
  @apply cursor-pointer font-medium;
}

.activity-entry-output pre {
  @apply m-0 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 text-slate-800;
}

.activity-entry-output code {
  @apply whitespace-pre font-mono;
}
</style>
