<template>
  <section class="workspace-problems-panel" aria-label="Problems panel">
    <header class="workspace-problems-panel-header">
      <div>
        <h3 class="workspace-problems-panel-title">Problems</h3>
        <p class="workspace-problems-panel-subtitle">{{ summaryText }}</p>
      </div>
    </header>

    <div v-if="runs.length > 0" class="workspace-problems-panel-metrics" aria-label="Problem summary">
      <span :data-tone="errorCount > 0 ? 'danger' : 'neutral'">{{ errorCount }} errors</span>
      <span :data-tone="warningCount > 0 ? 'warning' : 'neutral'">{{ warningCount }} warnings</span>
      <span data-tone="neutral">{{ runs.length }} runs</span>
    </div>

    <ol v-if="problems.length > 0" class="workspace-problems-panel-list">
      <li
        v-for="problem in problems"
        :key="problem.id"
        class="workspace-problems-panel-item"
        :data-severity="problem.severity"
      >
        <div class="workspace-problems-panel-item-main">
          <span class="workspace-problems-panel-location">{{ problemLocation(problem) }}</span>
          <span class="workspace-problems-panel-source">{{ problem.source }}</span>
        </div>
        <p class="workspace-problems-panel-message">{{ problem.message }}</p>
        <p class="workspace-problems-panel-command">{{ problem.command }}</p>
      </li>
    </ol>

    <p v-else class="workspace-problems-panel-empty">
      {{ runs.length > 0 ? 'No parsed problems in the latest validation outputs.' : 'Run test, lint, typecheck, or build scripts to populate problems.' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiWorkspaceProblem, UiWorkspaceScriptRun } from '../../types/codex'

const props = defineProps<{
  runs: UiWorkspaceScriptRun[]
}>()

const runs = computed(() => props.runs)
const problems = computed<UiWorkspaceProblem[]>(() => {
  const seen = new Set<string>()
  const rows: UiWorkspaceProblem[] = []
  for (const run of props.runs) {
    for (const problem of run.problems ?? []) {
      if (seen.has(problem.id)) continue
      seen.add(problem.id)
      rows.push(problem)
    }
  }
  return rows.slice(0, 50)
})
const errorCount = computed(() => problems.value.filter((problem) => problem.severity === 'error').length)
const warningCount = computed(() => problems.value.filter((problem) => problem.severity === 'warning').length)
const summaryText = computed(() => {
  if (problems.value.length > 0) {
    return `${String(problems.value.length)} parsed problem${problems.value.length === 1 ? '' : 's'} from validation output.`
  }
  if (runs.value.length > 0) return 'Validation ran without parsed diagnostics.'
  return 'No validation diagnostics captured yet.'
})

function problemLocation(problem: UiWorkspaceProblem): string {
  if (!problem.filePath) return 'command output'
  const line = problem.line === null ? '' : `:${String(problem.line)}`
  const column = problem.column === null ? '' : `:${String(problem.column)}`
  return `${problem.filePath}${line}${column}`
}
</script>

<style scoped>
@reference "../../style.css";

.workspace-problems-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-problems-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-problems-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-problems-panel-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-problems-panel-metrics {
  @apply mt-2 grid grid-cols-3 gap-1.5;
}

.workspace-problems-panel-metrics span {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-1 text-xs font-medium theme-muted;
}

.workspace-problems-panel-metrics span[data-tone='danger'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.workspace-problems-panel-metrics span[data-tone='warning'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-problems-panel-list {
  @apply m-0 mt-2 grid max-h-96 list-none gap-1.5 overflow-auto p-0;
}

.workspace-problems-panel-item {
  @apply rounded-md border theme-border theme-bg-subtle px-2.5 py-2;
}

.workspace-problems-panel-item[data-severity='error'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.workspace-problems-panel-item[data-severity='warning'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-problems-panel-item-main {
  @apply flex items-center justify-between gap-2;
}

.workspace-problems-panel-location {
  @apply min-w-0 truncate font-mono text-xs font-semibold theme-text;
}

.workspace-problems-panel-source {
  @apply shrink-0 rounded-full border theme-border theme-bg-panel px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-normal theme-muted;
}

.workspace-problems-panel-message {
  @apply m-0 mt-1 break-words text-xs leading-4 theme-muted;
}

.workspace-problems-panel-command,
.workspace-problems-panel-empty {
  @apply m-0 mt-1 break-words text-xs leading-4 theme-muted;
}

.workspace-problems-panel-command {
  @apply font-mono text-[0.68rem];
}
</style>
