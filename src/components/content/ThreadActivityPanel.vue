<template>
  <div class="thread-activity-host" :style="workLogHostStyle">
    <button
      class="thread-work-log-float-button"
      type="button"
      :aria-expanded="isWorkLogOpen"
      aria-controls="thread-work-log-panel"
      :aria-label="isWorkLogOpen ? 'Close work log' : 'Open work log'"
      :title="isWorkLogOpen ? 'Close work log' : 'Open work log'"
      @click="onWorkLogFloatClick"
      @pointerdown="onWorkLogDragPointerDown"
    >
      <span class="thread-work-log-float-title">Work log</span>
      <span class="thread-work-log-float-summary">
        {{ workLogFloatSummary }}
      </span>
      <span v-if="workLogBadgeCount > 0" class="thread-work-log-float-badge">
        {{ workLogBadgeCount }}
      </span>
    </button>

    <aside v-if="isWorkLogOpen" id="thread-work-log-panel" class="thread-activity-panel" aria-label="Thread work log">
      <header class="thread-activity-header" @pointerdown="onWorkLogDragPointerDown">
        <div class="thread-activity-header-copy">
          <h2 class="thread-activity-title">Work log</h2>
          <p class="thread-activity-subtitle">{{ statusText }}</p>
          <div class="thread-activity-view-toggle" aria-label="Diff view mode" @pointerdown.stop>
            <button
              class="thread-activity-view-button"
              type="button"
              :data-active="diffViewMode === 'unified'"
              @click="setDiffViewMode('unified')"
            >
              Unified
            </button>
            <button
              class="thread-activity-view-button"
              type="button"
              :data-active="diffViewMode === 'split'"
              @click="setDiffViewMode('split')"
            >
              Split
            </button>
          </div>
        </div>
        <button
          class="thread-activity-close"
          type="button"
          aria-label="Close work log"
          title="Close work log"
          @click="closeWorkLog"
          @pointerdown.stop
        >
          ×
        </button>
      </header>

      <section class="thread-activity-metrics" aria-label="Work log summary">
        <div v-for="metric in workLogMetrics" :key="metric.label" class="thread-activity-metric">
          <span class="thread-activity-metric-value">{{ metric.value }}</span>
          <span class="thread-activity-metric-label">{{ metric.label }}</span>
        </div>
      </section>

      <section class="thread-activity-section thread-activity-section-scroll">
        <h3 class="thread-activity-section-title">Changed files</h3>
        <p v-if="diffReview.files.length === 0" class="thread-activity-empty">No file changes recorded yet.</p>

        <div
          v-for="file in diffReview.files"
          :key="file.filePath"
          class="work-log-card work-log-file-card"
        >
          <details class="work-log-file-details">
            <summary class="work-log-summary">
              <span class="work-log-primary" :title="file.filePath">{{ displayFilePath(file.filePath) }}</span>
              <span class="work-log-status">{{ file.status }}</span>
              <span class="work-log-stat">{{ fileStatLabel(file) }}</span>
              <span class="work-log-summary-spacer" />
            </summary>
            <p v-if="file.oldPath" class="work-log-meta">from {{ file.oldPath }}</p>
            <div v-if="file.hunks.length > 0" class="work-log-diff" aria-label="File diff">
              <section v-for="hunk in file.hunks" :key="`${file.filePath}:${hunk.header}`" class="work-log-hunk">
                <div class="work-log-diff-row work-log-diff-row-hunk">
                  <span class="work-log-line-number" />
                  <span class="work-log-line-number" />
                  <span class="work-log-line-prefix" />
                  <code class="work-log-line-code">{{ hunk.header }}</code>
                </div>
                <template v-if="diffViewMode === 'split'">
                  <div
                    v-for="(row, index) in splitRows(hunk.lines)"
                    :key="`${file.filePath}:${hunk.header}:split:${index}`"
                    class="work-log-split-row"
                  >
                    <span class="work-log-split-line-number" :data-kind="row.old.kind">{{ formatLineNumber(row.old.lineNumber) }}</span>
                    <code class="work-log-split-code" :data-kind="row.old.kind">{{ row.old.content }}</code>
                    <span class="work-log-split-line-number" :data-kind="row.new.kind">{{ formatLineNumber(row.new.lineNumber) }}</span>
                    <code class="work-log-split-code" :data-kind="row.new.kind">{{ row.new.content }}</code>
                  </div>
                </template>
                <template v-else>
                  <div
                    v-for="(line, index) in hunk.lines"
                    :key="`${file.filePath}:${hunk.header}:${index}`"
                    class="work-log-diff-row"
                    :data-kind="line.kind"
                  >
                    <span class="work-log-line-number">{{ formatLineNumber(line.oldLineNumber) }}</span>
                    <span class="work-log-line-number">{{ formatLineNumber(line.newLineNumber) }}</span>
                    <span class="work-log-line-prefix">{{ diffLinePrefix(line.kind) }}</span>
                    <code class="work-log-line-code">{{ line.content }}</code>
                  </div>
                </template>
              </section>
            </div>
            <pre v-else-if="file.patch" class="work-log-output"><code>{{ file.patch }}</code></pre>
          </details>
          <button
            class="work-log-fullscreen-button"
            type="button"
            aria-label="Open diff fullscreen"
            title="Open diff fullscreen"
            @click="openFullscreenDiff(file.filePath)"
          >
            ⛶
          </button>
        </div>

        <h3 class="thread-activity-section-title thread-activity-section-title-spaced">Commands</h3>
        <p v-if="commandEntries.length === 0" class="thread-activity-empty">No commands recorded yet.</p>

        <details
          v-for="entry in commandEntries"
          :key="entry.messageId"
          class="work-log-card"
          :data-tone="toolStatusTone(entry.status)"
        >
          <summary class="work-log-summary">
            <span class="work-log-primary">{{ entry.summary }}</span>
            <span class="work-log-summary-spacer" />
            <span class="work-log-status">{{ formatToolStatus(entry.status) }}</span>
            <span v-if="entry.exitCode !== null" class="work-log-stat">exit {{ entry.exitCode }}</span>
            <span v-else class="work-log-summary-spacer" />
          </summary>
          <dl class="work-log-details">
            <div v-if="entry.cwd">
              <dt>cwd</dt>
              <dd>{{ entry.cwd }}</dd>
            </div>
            <div v-if="entry.duration">
              <dt>duration</dt>
              <dd>{{ entry.duration }}</dd>
            </div>
          </dl>
          <pre v-if="entry.output" class="work-log-output"><code>{{ entry.output }}</code></pre>
          <p v-else class="work-log-meta">No output captured for this command.</p>
        </details>
      </section>
    </aside>

    <section v-if="pendingRequests.length > 0" class="thread-action-required-float" aria-label="Action required">
      <header class="thread-action-required-header">
        <div>
          <h3 class="thread-action-required-title">Action required</h3>
          <p class="thread-action-required-subtitle">
            {{ pendingApprovalSubtitle }}
          </p>
        </div>
      </header>

      <div class="thread-action-required-list">
        <article v-for="card in pendingApprovalCards" :key="card.request.id" class="activity-request-card">
          <p class="activity-request-method">{{ card.summary.title }}</p>
          <p class="activity-request-meta">{{ serverRequestMetaLabel({ request: card.request }) }}</p>
          <p class="activity-request-subject">{{ card.summary.subject }}</p>
          <div class="approval-risk-line">
            <span class="approval-risk-badge" :data-level="card.summary.level">
              {{ card.summary.level }}
            </span>
            <span
              v-for="label in card.summary.riskLabels"
              :key="`${card.request.id}:${label}`"
              class="approval-risk-label"
            >
              {{ label }}
            </span>
          </div>
          <p class="activity-request-reason">{{ card.summary.description }}</p>
          <ul class="approval-impact-list">
            <li v-for="impact in card.summary.impacts" :key="`${card.request.id}:${impact}`">
              {{ impact }}
            </li>
          </ul>
          <div class="approval-scope-line" aria-label="Approval scopes">
            <span
              v-for="scope in approvalScopeOptions"
              :key="`${card.request.id}:${scope.scope}`"
              class="approval-scope"
              :data-enabled="scope.enabled"
              :title="scope.description"
            >
              {{ scope.label }}
            </span>
          </div>
          <p class="approval-recommendation">{{ card.summary.recommendation }}</p>

          <div class="activity-request-actions">
            <template v-if="card.isApprovalRequest">
              <button
                v-for="scope in approvalScopeOptions"
                :key="`${card.request.id}:${serverRequestActionKeyPrefix(card.kind)}:${scope.scope}`"
                class="activity-request-button"
                :class="{ 'activity-request-button-primary': scope.scope === 'single', 'activity-request-button-danger': scope.scope === 'permanent' }"
                type="button"
                @click="onRespondApprovalScope(card.request.id, scope.scope)"
              >
                {{ scope.label }}
              </button>
              <button class="activity-request-button" type="button" @click="onRespondApproval(card.request.id, 'decline')">
                Decline
              </button>
            </template>
            <template v-else>
              <button class="activity-request-button activity-request-button-primary" type="button" @click="onRespondEmptyResult(card.request.id)">
                Empty result
              </button>
              <button class="activity-request-button" type="button" @click="onRejectRequest(card.request.id)">
                Reject
              </button>
            </template>
          </div>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="fullscreenFile"
        class="work-log-fullscreen-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Fullscreen diff"
        @click.self="closeFullscreenDiff"
      >
        <section class="work-log-fullscreen-panel">
          <header class="work-log-fullscreen-header">
            <div class="work-log-fullscreen-copy">
              <h3 :title="fullscreenFile.filePath">{{ displayFilePath(fullscreenFile.filePath) }}</h3>
              <p>
                {{ fullscreenFile.status }} · {{ fileStatLabel(fullscreenFile) }}
              </p>
              <p class="work-log-fullscreen-path">{{ fullscreenFile.filePath }}</p>
            </div>
            <div class="thread-activity-view-toggle work-log-fullscreen-view-toggle" aria-label="Diff view mode">
              <button
                class="thread-activity-view-button"
                type="button"
                :data-active="diffViewMode === 'unified'"
                @click="setDiffViewMode('unified')"
              >
                Unified
              </button>
              <button
                class="thread-activity-view-button"
                type="button"
                :data-active="diffViewMode === 'split'"
                @click="setDiffViewMode('split')"
              >
                Split
              </button>
            </div>
            <button
              class="work-log-fullscreen-close"
              type="button"
              aria-label="Close fullscreen diff"
              title="Close"
              @click="closeFullscreenDiff"
              @pointerdown.stop
            >
              ×
            </button>
          </header>

          <div v-if="fullscreenFile.oldPath" class="work-log-fullscreen-meta">
            from {{ fullscreenFile.oldPath }}
          </div>

          <div v-if="fullscreenFile.hunks.length > 0" class="work-log-diff work-log-diff-fullscreen" aria-label="Fullscreen file diff">
            <section v-for="hunk in fullscreenFile.hunks" :key="`fullscreen:${fullscreenFile.filePath}:${hunk.header}`" class="work-log-hunk">
              <div class="work-log-diff-row work-log-diff-row-hunk">
                <span class="work-log-line-number" />
                <span class="work-log-line-number" />
                <span class="work-log-line-prefix" />
                <code class="work-log-line-code">{{ hunk.header }}</code>
              </div>
              <template v-if="diffViewMode === 'split'">
                <div
                  v-for="(row, index) in splitRows(hunk.lines)"
                  :key="`fullscreen:${fullscreenFile.filePath}:${hunk.header}:split:${index}`"
                  class="work-log-split-row"
                >
                  <span class="work-log-split-line-number" :data-kind="row.old.kind">{{ formatLineNumber(row.old.lineNumber) }}</span>
                  <code class="work-log-split-code" :data-kind="row.old.kind">{{ row.old.content }}</code>
                  <span class="work-log-split-line-number" :data-kind="row.new.kind">{{ formatLineNumber(row.new.lineNumber) }}</span>
                  <code class="work-log-split-code" :data-kind="row.new.kind">{{ row.new.content }}</code>
                </div>
              </template>
              <template v-else>
                <div
                  v-for="(line, index) in hunk.lines"
                  :key="`fullscreen:${fullscreenFile.filePath}:${hunk.header}:${index}`"
                  class="work-log-diff-row"
                  :data-kind="line.kind"
                >
                  <span class="work-log-line-number">{{ formatLineNumber(line.oldLineNumber) }}</span>
                  <span class="work-log-line-number">{{ formatLineNumber(line.newLineNumber) }}</span>
                  <span class="work-log-line-prefix">{{ diffLinePrefix(line.kind) }}</span>
                  <code class="work-log-line-code">{{ line.content }}</code>
                </div>
              </template>
            </section>
          </div>
          <pre v-else-if="fullscreenFile.patch" class="work-log-output work-log-output-fullscreen"><code>{{ fullscreenFile.patch }}</code></pre>
          <p v-else class="work-log-fullscreen-empty">No diff content captured for this file.</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  buildThreadCommandEntries,
  buildThreadActivitySummary,
  buildPendingApprovalSubtitle,
  buildPendingApprovalCards,
  buildWorkLogDisplayPath,
  buildWorkLogStatusText,
  buildWorkLogFileStatLabel,
  buildWorkLogFloatSummary,
  buildWorkLogMetrics,
  formatWorkLogLineNumber,
  shouldCloseWorkLogFullscreenFile,
  workLogBadgeCount as workLogBadgeCountForReview,
  workLogDiffLinePrefix,
  workLogFullscreenFile,
} from '../../composables/useThreadActivity'
import {
  formatToolStatus,
  toolStatusTone,
} from '../../composables/threadToolTimelineRules'
import {
  APPROVAL_SCOPE_OPTIONS,
  type UiApprovalDecision,
} from '../../composables/useApprovalRisk'
import {
  buildApprovalDecisionReply,
  buildApprovalScopeReply,
  buildEmptyServerRequestReply,
  buildRejectedServerRequestReply,
  serverRequestActionKeyPrefix,
  serverRequestMetaLabel,
} from '../../composables/serverRequestRules'
import { buildDiffReview, buildSplitDiffRows } from '../../composables/useDiffReview'
import type { UiDiffLineKind, UiDiffReviewFile, UiDiffReviewLine, UiDiffSplitRow } from '../../composables/useDiffReview'
import type { UiApprovalDecisionScope, UiMessage, UiServerRequest, UiServerRequestReply, UiToolingRollbackFileResult } from '../../types/codex'

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

const commandEntries = computed(() => buildThreadCommandEntries(props.messages))
const diffReview = computed(() => buildDiffReview(props.messages))
const fullscreenFilePath = ref('')
const isWorkLogOpen = ref(false)
const diffViewMode = ref<'unified' | 'split'>('unified')
const workLogPosition = ref({ left: 24, top: 76 })
const fullscreenFile = computed(() => workLogFullscreenFile(diffReview.value, fullscreenFilePath.value))
const workLogBadgeCount = computed(() => workLogBadgeCountForReview(diffReview.value, commandEntries.value.length))
const workLogFloatSummary = computed(() => buildWorkLogFloatSummary({
  fileCount: diffReview.value.summary.fileCount,
  commandCount: commandEntries.value.length,
}))
const workLogMetrics = computed(() => buildWorkLogMetrics({
  fileCount: diffReview.value.summary.fileCount,
  commandCount: commandEntries.value.length,
  addedLines: diffReview.value.summary.addedLines,
  removedLines: diffReview.value.summary.removedLines,
}))
const summary = computed(() => buildThreadActivitySummary(props.messages, props.pendingRequests))
const pendingApprovalSubtitle = computed(() => buildPendingApprovalSubtitle(props.pendingRequests.length))
const pendingApprovalCards = computed(() => buildPendingApprovalCards(props.pendingRequests))
const statusText = computed(() => buildWorkLogStatusText({
  pendingRequestCount: summary.value.pendingRequestCount,
  fileCount: diffReview.value.summary.fileCount,
  commandCount: commandEntries.value.length,
}))
const workLogHostStyle = computed(() => ({
  left: `${String(workLogPosition.value.left)}px`,
  top: `${String(workLogPosition.value.top)}px`,
}))

let dragStart:
  | {
    pointerId: number
    startX: number
    startY: number
    left: number
    top: number
    moved: boolean
  }
  | null = null
let wasWorkLogDragged = false

function workLogPanelWidth(): number {
  if (typeof window === 'undefined') return 288
  const availableWidth = Math.max(window.innerWidth - 48, 160)
  return isWorkLogOpen.value ? Math.min(544, availableWidth) : Math.min(288, window.innerWidth - 32)
}

function clampWorkLogPosition(left: number, top: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left, top }
  const panelWidth = workLogPanelWidth()
  const maxLeft = Math.max(window.innerWidth - panelWidth - 8, 8)
  const maxTop = Math.max(window.innerHeight - 80, 8)
  return {
    left: Math.min(Math.max(left, 8), maxLeft),
    top: Math.min(Math.max(top, 8), maxTop),
  }
}

function onWorkLogDragPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return

  dragStart = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: workLogPosition.value.left,
    top: workLogPosition.value.top,
    moved: false,
  }
  window.addEventListener('pointermove', onWorkLogDragPointerMove)
  window.addEventListener('pointerup', onWorkLogDragPointerUp, { once: true })
}

function onWorkLogDragPointerMove(event: PointerEvent): void {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return
  const deltaX = event.clientX - dragStart.startX
  const deltaY = event.clientY - dragStart.startY
  if (!dragStart.moved && Math.abs(deltaX) + Math.abs(deltaY) > 3) {
    dragStart.moved = true
    wasWorkLogDragged = true
  }
  if (!dragStart.moved) return

  event.preventDefault()
  workLogPosition.value = clampWorkLogPosition(dragStart.left + deltaX, dragStart.top + deltaY)
}

function onWorkLogDragPointerUp(event: PointerEvent): void {
  if (dragStart && event.pointerId === dragStart.pointerId) {
    dragStart = null
  }
  window.removeEventListener('pointermove', onWorkLogDragPointerMove)
}

function onRespondApproval(requestId: number, decision: UiApprovalDecision): void {
  emit('respondServerRequest', buildApprovalDecisionReply(requestId, decision))
}

function onRespondApprovalScope(requestId: number, scope: UiApprovalDecisionScope): void {
  emit('respondServerRequest', buildApprovalScopeReply(requestId, scope))
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', buildEmptyServerRequestReply(requestId))
}

function onRejectRequest(requestId: number): void {
  emit('respondServerRequest', buildRejectedServerRequestReply(
    requestId,
    'Rejected from codex-web-local activity panel.',
  ))
}

function formatLineNumber(value: number | null): string {
  return formatWorkLogLineNumber(value)
}

function diffLinePrefix(kind: UiDiffLineKind): string {
  return workLogDiffLinePrefix(kind)
}

function splitRows(lines: UiDiffReviewLine[]): UiDiffSplitRow[] {
  return buildSplitDiffRows(lines)
}

function setDiffViewMode(mode: 'unified' | 'split'): void {
  diffViewMode.value = mode
}

function fileStatLabel(file: Pick<UiDiffReviewFile, 'addedLines' | 'removedLines'>): string {
  return buildWorkLogFileStatLabel(file)
}

function displayFilePath(filePath: string): string {
  return buildWorkLogDisplayPath(filePath, props.cwd)
}

function openFullscreenDiff(filePath: string): void {
  fullscreenFilePath.value = filePath
}

function closeFullscreenDiff(): void {
  fullscreenFilePath.value = ''
}

function closeWorkLog(): void {
  isWorkLogOpen.value = false
}

function onWorkLogFloatClick(): void {
  if (wasWorkLogDragged) {
    wasWorkLogDragged = false
    return
  }
  isWorkLogOpen.value = !isWorkLogOpen.value
}

watch(diffReview, (review) => {
  if (shouldCloseWorkLogFullscreenFile(review, fullscreenFilePath.value)) {
    fullscreenFilePath.value = ''
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onWorkLogDragPointerMove)
})
</script>

<style scoped>
@reference "tailwindcss";

.thread-activity-host {
  position: fixed;
  z-index: 35;
  margin: 0;
  touch-action: none;
}

.thread-work-log-float-button {
  @apply grid max-w-[calc(100vw-2rem)] cursor-move grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-left text-slate-800 shadow-lg transition hover:border-blue-300 hover:bg-blue-50;
  width: min(18rem, calc(100vw - 2rem));
}

.thread-work-log-float-title {
  @apply min-w-0 text-xs font-semibold uppercase tracking-normal text-slate-600;
}

.thread-work-log-float-summary {
  @apply col-start-1 min-w-0 truncate text-xs text-slate-500;
}

.thread-work-log-float-badge {
  @apply col-start-2 row-span-2 row-start-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-semibold text-white;
}

.thread-activity-panel {
  @apply absolute left-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[min(72vh,48rem)] min-h-0 w-[min(34rem,calc(100vw-3rem))] flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-2xl;
}

.thread-activity-header {
  @apply flex shrink-0 cursor-move items-start justify-between gap-3;
}

.thread-activity-header-copy {
  @apply min-w-0;
}

.thread-activity-close {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-lg leading-none text-slate-600 transition hover:bg-slate-100 hover:text-slate-950;
}

.thread-activity-title {
  @apply m-0 text-sm font-semibold text-slate-900;
}

.thread-activity-subtitle {
  @apply m-0 mt-0.5 text-xs text-slate-500;
}

.thread-activity-view-toggle {
  @apply mt-2 inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5;
}

.thread-activity-view-button {
  @apply rounded px-2 py-1 text-[0.68rem] font-semibold leading-4 text-slate-600 transition hover:bg-white hover:text-slate-950;
}

.thread-activity-view-button[data-active='true'] {
  @apply bg-white text-blue-700 shadow-sm;
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

.thread-activity-section-title-spaced {
  @apply mt-3;
}

.thread-activity-empty {
  @apply m-0 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500;
}

.thread-action-required-float {
  @apply fixed bottom-4 right-4 z-50 flex max-h-[min(72vh,42rem)] w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 overflow-hidden rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-2xl;
}

.thread-action-required-header {
  @apply flex shrink-0 items-start justify-between gap-3 border-b border-amber-200 pb-2;
}

.thread-action-required-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-amber-900;
}

.thread-action-required-subtitle {
  @apply m-0 mt-0.5 text-xs text-amber-800;
}

.thread-action-required-list {
  @apply min-h-0 overflow-y-auto pr-0.5;
}

.thread-action-required-list .activity-request-card + .activity-request-card {
  @apply mt-2;
}

.work-log-card {
  @apply rounded-lg border border-slate-200 bg-slate-50 px-3 py-2;
}

.work-log-card + .work-log-card {
  @apply mt-2;
}

.work-log-card[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.work-log-card[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.work-log-card[data-tone='working'] {
  @apply border-blue-200 bg-blue-50;
}

.work-log-file-card {
  @apply relative;
}

.work-log-file-details {
  @apply block;
}

.work-log-summary {
  @apply grid cursor-pointer grid-cols-[minmax(0,1fr)_2rem_auto_auto] items-center gap-2 text-xs;
}

.work-log-file-card .work-log-summary {
  @apply grid-cols-[minmax(0,1fr)_auto_auto_2rem];
}

.work-log-primary {
  @apply min-w-0 truncate font-mono font-semibold text-slate-900;
}

.work-log-status,
.work-log-stat {
  @apply shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] font-medium leading-4 text-slate-600;
}

.work-log-fullscreen-button {
  @apply absolute right-3 top-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-sm leading-none text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700;
}

.work-log-card[data-tone='success'] .work-log-status {
  @apply border-emerald-200 bg-emerald-100 text-emerald-800;
}

.work-log-card[data-tone='danger'] .work-log-status {
  @apply border-rose-200 bg-rose-100 text-rose-800;
}

.work-log-card[data-tone='working'] .work-log-status {
  @apply border-blue-200 bg-blue-100 text-blue-800;
}

.work-log-meta {
  @apply m-0 mt-2 break-words text-xs leading-4 text-slate-600;
}

.work-log-details {
  @apply m-0 mt-2 grid gap-1;
}

.work-log-details div {
  @apply grid grid-cols-[4rem_minmax(0,1fr)] gap-2;
}

.work-log-details dt {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-slate-500;
}

.work-log-details dd {
  @apply m-0 min-w-0 truncate font-mono text-[0.68rem] leading-4 text-slate-600;
}

.work-log-output {
  @apply m-0 mt-2 max-h-80 overflow-auto rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 text-slate-800;
}

.work-log-output code {
  @apply whitespace-pre font-mono;
}

.work-log-diff {
  @apply mt-2 overflow-auto rounded-md border border-slate-200 bg-white;
}

.work-log-diff-fullscreen {
  @apply m-0 min-h-0 flex-1 rounded-none border-0;
}

.work-log-hunk + .work-log-hunk {
  @apply border-t border-slate-200;
}

.work-log-diff-row {
  @apply grid min-w-max grid-cols-[3.25rem_3.25rem_1.5rem_minmax(34rem,1fr)] border-b border-slate-100 font-mono text-xs leading-5;
}

.work-log-diff-row:last-child {
  @apply border-b-0;
}

.work-log-diff-row[data-kind='add'] {
  background: #e6ffec;
}

.work-log-diff-row[data-kind='remove'] {
  background: #ffebe9;
}

.work-log-diff-row[data-kind='meta'],
.work-log-diff-row-hunk {
  background: #ddf4ff;
}

.work-log-line-number {
  @apply select-none border-r border-slate-200 px-2 text-right text-[0.68rem] text-slate-500;
  background: rgb(248 250 252 / 0.82);
}

.work-log-diff-row[data-kind='add'] .work-log-line-number {
  background: #ccffd8;
}

.work-log-diff-row[data-kind='remove'] .work-log-line-number {
  background: #ffd7d5;
}

.work-log-diff-row-hunk .work-log-line-number,
.work-log-diff-row[data-kind='meta'] .work-log-line-number {
  background: #b6e3ff;
}

.work-log-line-prefix {
  @apply select-none px-2 text-slate-600;
}

.work-log-diff-row[data-kind='add'] .work-log-line-prefix {
  @apply text-emerald-800;
}

.work-log-diff-row[data-kind='remove'] .work-log-line-prefix {
  @apply text-rose-800;
}

.work-log-line-code {
  @apply whitespace-pre px-2 text-slate-900;
}

.work-log-diff-row-hunk .work-log-line-code {
  @apply text-blue-900;
}

.work-log-split-row {
  @apply grid min-w-[54rem] grid-cols-[3.25rem_minmax(22rem,1fr)_3.25rem_minmax(22rem,1fr)] border-b border-slate-100 font-mono text-xs leading-5;
}

.work-log-split-row:last-child {
  @apply border-b-0;
}

.work-log-split-line-number {
  @apply select-none border-r border-slate-200 px-2 text-right text-[0.68rem] text-slate-500;
  background: rgb(248 250 252 / 0.82);
}

.work-log-split-line-number:nth-child(3) {
  @apply border-l;
}

.work-log-split-code {
  @apply whitespace-pre px-2 text-slate-900;
}

.work-log-split-line-number[data-kind='add'],
.work-log-split-code[data-kind='add'] {
  background: #e6ffec;
}

.work-log-split-line-number[data-kind='remove'],
.work-log-split-code[data-kind='remove'] {
  background: #ffebe9;
}

.work-log-split-line-number[data-kind='meta'],
.work-log-split-code[data-kind='meta'] {
  background: #ddf4ff;
}

.work-log-split-line-number[data-kind='empty'],
.work-log-split-code[data-kind='empty'] {
  background: #f8fafc;
}

.work-log-fullscreen-backdrop {
  @apply fixed inset-0 z-[70] flex bg-slate-950/70 p-4 backdrop-blur-sm;
}

.work-log-fullscreen-panel {
  @apply flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl;
}

.work-log-fullscreen-header {
  @apply flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3;
}

.work-log-fullscreen-copy {
  @apply min-w-0;
}

.work-log-fullscreen-view-toggle {
  @apply m-0 ml-auto shrink-0;
}

.work-log-fullscreen-copy h3 {
  @apply m-0 truncate font-mono text-sm font-semibold text-slate-950;
}

.work-log-fullscreen-copy p,
.work-log-fullscreen-meta,
.work-log-fullscreen-empty {
  @apply m-0 mt-1 text-xs text-slate-600;
}

.work-log-fullscreen-path {
  @apply break-all font-mono;
}

.work-log-fullscreen-close {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-lg leading-none text-slate-600 transition hover:bg-slate-100 hover:text-slate-950;
}

.work-log-fullscreen-meta {
  @apply mt-0 shrink-0 border-b border-slate-200 bg-white px-4 py-2 font-mono;
}

.work-log-output-fullscreen {
  @apply m-0 min-h-0 flex-1 rounded-none border-0;
}

.work-log-fullscreen-empty {
  @apply px-4 py-3;
}

.activity-request-card,
.activity-entry-card {
  @apply rounded-lg border border-slate-200 bg-slate-50 px-3 py-2;
}

.thread-action-required-list .activity-request-card {
  @apply border-amber-200 bg-white;
}

:global(.app-dark) .thread-action-required-float {
  border-color: #92400e;
  background: #2f2412;
  color: #fef3c7;
}

:global(.app-dark) .thread-action-required-header {
  border-color: #78350f;
}

:global(.app-dark) .thread-action-required-title,
:global(.app-dark) .thread-action-required-subtitle {
  color: #fde68a;
}

:global(.app-dark) .thread-action-required-list .activity-request-card {
  border-color: #92400e;
  background: #181b22;
}

:global(.app-dark) .thread-work-log-float-button,
:global(.app-dark) .thread-activity-close {
  border-color: #3a4250;
  background: #252b36;
  color: #d1d5db;
}

:global(.app-dark) .thread-work-log-float-button:hover,
:global(.app-dark) .thread-activity-close:hover {
  border-color: #2563eb;
  background: #172c4f;
  color: #bfdbfe;
}

:global(.app-dark) .thread-work-log-float-title,
:global(.app-dark) .thread-work-log-float-summary {
  color: #c7ccd6;
}

:global(.app-dark) .thread-activity-view-toggle {
  border-color: #3a4250;
  background: #181b22;
}

:global(.app-dark) .thread-activity-view-button {
  color: #c7ccd6;
}

:global(.app-dark) .thread-activity-view-button:hover,
:global(.app-dark) .thread-activity-view-button[data-active='true'] {
  background: #252b36;
  color: #93c5fd;
}

:global(.app-dark) .work-log-fullscreen-panel {
  border-color: #303643;
  background: #181b22;
  color: #e5e7eb;
}

:global(.app-dark) .work-log-fullscreen-header,
:global(.app-dark) .work-log-fullscreen-meta {
  border-color: #303643;
  background: #20242c;
}

:global(.app-dark) .work-log-fullscreen-copy h3,
:global(.app-dark) .work-log-fullscreen-copy p,
:global(.app-dark) .work-log-fullscreen-meta,
:global(.app-dark) .work-log-fullscreen-empty {
  color: #c7ccd6;
}

:global(.app-dark) .work-log-fullscreen-close,
:global(.app-dark) .work-log-fullscreen-button {
  border-color: #3a4250;
  background: #252b36;
  color: #d1d5db;
}

:global(.app-dark) .work-log-fullscreen-close:hover,
:global(.app-dark) .work-log-fullscreen-button:hover {
  border-color: #2563eb;
  background: #172c4f;
  color: #bfdbfe;
}

:global(.app-dark) .work-log-split-row {
  border-color: #303643;
}

:global(.app-dark) .work-log-split-line-number {
  border-color: #303643;
  background: #20242c;
  color: #9ca3af;
}

:global(.app-dark) .work-log-split-code {
  color: #e5e7eb;
}

:global(.app-dark) .work-log-split-line-number[data-kind='add'],
:global(.app-dark) .work-log-split-code[data-kind='add'] {
  background: #123524;
}

:global(.app-dark) .work-log-split-line-number[data-kind='remove'],
:global(.app-dark) .work-log-split-code[data-kind='remove'] {
  background: #3b181b;
}

:global(.app-dark) .work-log-split-line-number[data-kind='meta'],
:global(.app-dark) .work-log-split-code[data-kind='meta'] {
  background: #15324a;
}

:global(.app-dark) .work-log-split-line-number[data-kind='empty'],
:global(.app-dark) .work-log-split-code[data-kind='empty'] {
  background: #181b22;
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
