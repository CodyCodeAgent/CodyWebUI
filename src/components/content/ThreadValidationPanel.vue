<template>
  <section class="thread-validation-panel" aria-label="Validation evidence">
    <header class="thread-validation-header">
      <div>
        <h3 class="thread-validation-title">Validation</h3>
        <p class="thread-validation-summary">{{ summaryText }}</p>
      </div>
    </header>

    <div v-if="summary.hasEvidence" class="thread-validation-metrics" aria-label="Validation summary">
      <span class="thread-validation-pill" data-tone="success">{{ summary.passedCount }} passed</span>
      <span class="thread-validation-pill" :data-tone="summary.failedCount > 0 ? 'danger' : 'neutral'">
        {{ summary.failedCount }} failed
      </span>
      <span class="thread-validation-pill" data-tone="working">{{ summary.runningCount }} running</span>
      <span class="thread-validation-pill" data-tone="neutral">{{ summary.unknownCount }} unknown</span>
    </div>

    <p v-if="evidence.length === 0" class="thread-validation-empty">
      No test, lint, typecheck, build, or preview command evidence yet.
    </p>

    <div v-else class="thread-validation-list">
      <article
        v-for="entry in evidence"
        :key="entry.messageId"
        class="thread-validation-card"
        :data-tone="entry.status"
      >
        <header class="thread-validation-card-header">
          <span class="thread-validation-kind">{{ entry.label }}</span>
          <span class="thread-validation-status">{{ formatStatus(entry.status) }}</span>
        </header>

        <p class="thread-validation-command">{{ entry.command }}</p>

        <dl class="thread-validation-meta">
          <div v-if="entry.cwd">
            <dt>cwd</dt>
            <dd>{{ entry.cwd }}</dd>
          </div>
          <div v-if="entry.exitCode !== null">
            <dt>exit</dt>
            <dd>{{ entry.exitCode }}</dd>
          </div>
          <div v-if="entry.duration">
            <dt>duration</dt>
            <dd>{{ entry.duration }}</dd>
          </div>
        </dl>

        <div
          v-if="entry.testSummary || entry.coverageSummary"
          class="thread-validation-evidence-summary"
          aria-label="Parsed validation evidence"
        >
          <span v-if="entry.testSummary">{{ formatTestSummary(entry.testSummary) }}</span>
          <span v-if="entry.coverageSummary">{{ formatCoverageSummary(entry.coverageSummary) }}</span>
        </div>

        <ul v-if="entry.failureSummary.length > 0" class="thread-validation-failure-list">
          <li v-for="line in entry.failureSummary" :key="`${entry.messageId}:${line}`">{{ line }}</li>
        </ul>

        <details v-if="entry.output" class="thread-validation-output">
          <summary>Output</summary>
          <pre><code>{{ entry.output }}</code></pre>
        </details>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  buildValidationEvidence,
  buildValidationSummary,
  type UiValidationStatus,
} from '../../composables/useValidationEvidence'
import type { ValidationCoverageSummary, ValidationTestSummary } from '../../utils/validationSummary'
import type { UiMessage } from '../../types/codex'

const props = defineProps<{
  messages: UiMessage[]
}>()

const evidence = computed(() => buildValidationEvidence(props.messages))
const summary = computed(() => buildValidationSummary(props.messages))
const summaryText = computed(() => {
  if (!summary.value.hasEvidence) return 'No command proof yet'
  if (summary.value.failedCount > 0) return `${summary.value.failedCount} failing validation command`
  if (summary.value.runningCount > 0) return `${summary.value.runningCount} validation command running`
  return `${summary.value.passedCount} validation command passed`
})

function formatStatus(status: UiValidationStatus): string {
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'running'
  return 'unknown'
}

function formatTestSummary(summary: ValidationTestSummary): string {
  const parts = [
    summary.passed !== null ? `${String(summary.passed)} passed` : '',
    summary.failed !== null ? `${String(summary.failed)} failed` : '',
    summary.skipped !== null ? `${String(summary.skipped)} skipped` : '',
  ].filter(Boolean)
  if (summary.total !== null) parts.push(`${String(summary.total)} total`)
  return `tests ${parts.join(' · ')}`
}

function formatCoverageSummary(summary: ValidationCoverageSummary): string {
  const parts = [
    summary.statements !== null ? `stmt ${summary.statements.toFixed(1)}%` : '',
    summary.branches !== null ? `branch ${summary.branches.toFixed(1)}%` : '',
    summary.functions !== null ? `func ${summary.functions.toFixed(1)}%` : '',
    summary.lines !== null ? `line ${summary.lines.toFixed(1)}%` : '',
  ].filter(Boolean)
  return `coverage ${parts.join(' · ')}`
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-validation-panel {
  @apply flex shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3;
}

.thread-validation-header {
  @apply flex items-start justify-between gap-2;
}

.thread-validation-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-slate-500;
}

.thread-validation-summary {
  @apply m-0 mt-0.5 text-xs text-slate-500;
}

.thread-validation-metrics {
  @apply grid grid-cols-2 gap-1.5;
}

.thread-validation-pill {
  @apply rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600;
}

.thread-validation-pill[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.thread-validation-pill[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.thread-validation-pill[data-tone='working'] {
  @apply border-blue-200 bg-blue-50 text-blue-700;
}

.thread-validation-empty {
  @apply m-0 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500;
}

.thread-validation-list {
  @apply flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5;
}

.thread-validation-card {
  @apply rounded-md border border-slate-200 bg-slate-50 px-2 py-2;
}

.thread-validation-card[data-tone='passed'] {
  @apply border-emerald-200 bg-emerald-50;
}

.thread-validation-card[data-tone='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.thread-validation-card[data-tone='running'] {
  @apply border-blue-200 bg-blue-50;
}

.thread-validation-card-header {
  @apply flex items-center justify-between gap-2;
}

.thread-validation-kind {
  @apply min-w-0 truncate text-xs font-semibold uppercase tracking-normal text-slate-600;
}

.thread-validation-status {
  @apply shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] font-medium leading-4 text-slate-600;
}

.thread-validation-command {
  @apply m-0 mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-900;
}

.thread-validation-meta {
  @apply m-0 mt-2 grid gap-1;
}

.thread-validation-meta div {
  @apply grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2;
}

.thread-validation-meta dt {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-slate-500;
}

.thread-validation-meta dd {
  @apply m-0 min-w-0 truncate font-mono text-[0.68rem] leading-4 text-slate-600;
}

.thread-validation-evidence-summary {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.thread-validation-evidence-summary span {
  @apply rounded-md border border-slate-200 bg-white/80 px-2 py-1 font-mono text-[0.68rem] leading-4 text-slate-700;
}

.thread-validation-failure-list {
  @apply m-0 mt-2 grid list-none gap-1 rounded-md border border-rose-200 bg-white/70 px-2 py-1.5 text-xs leading-4 text-rose-800;
}

.thread-validation-output {
  @apply mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600;
}

.thread-validation-output summary {
  @apply cursor-pointer font-medium;
}

.thread-validation-output pre {
  @apply m-0 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 text-slate-800;
}

.thread-validation-output code {
  @apply whitespace-pre font-mono;
}
</style>
