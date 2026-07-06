<template>
  <section class="workspace-security-panel" aria-label="Workspace security scan">
    <header class="workspace-security-panel-header">
      <div>
        <h3 class="workspace-security-panel-title">Security Scan</h3>
        <p class="workspace-security-panel-subtitle">{{ summaryText }}</p>
      </div>
      <button
        class="workspace-security-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadSecurity"
      >
        <IconTablerRefresh class="workspace-security-panel-refresh-icon" />
        <span>{{ isLoading ? 'Scanning' : 'Scan' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-security-panel-error">{{ errorMessage }}</p>

    <div v-if="snapshot" class="workspace-security-panel-metrics">
      <span :data-tone="snapshot.secretFindingCount > 0 ? 'danger' : 'success'">
        {{ snapshot.secretFindingCount }} secrets
      </span>
      <span :data-tone="snapshot.sensitivePathFindingCount > 0 ? 'danger' : 'success'">
        {{ snapshot.sensitivePathFindingCount }} sensitive paths
      </span>
      <span :data-tone="snapshot.highRiskFileCount > 0 ? 'warning' : 'success'">
        {{ snapshot.highRiskFileCount }} high-risk files
      </span>
    </div>

    <ul v-if="snapshot?.warnings.length" class="workspace-security-panel-warning-list">
      <li v-for="warning in snapshot.warnings" :key="warning">{{ warning }}</li>
    </ul>

    <ol v-if="findings.length > 0" class="workspace-security-panel-list">
      <li
        v-for="finding in findings"
        :key="finding.id"
        class="workspace-security-panel-finding"
        :data-severity="finding.severity"
        :data-category="finding.category"
      >
        <div class="workspace-security-panel-finding-header">
          <span class="workspace-security-panel-finding-title">{{ finding.title }}</span>
          <span class="workspace-security-panel-finding-severity">{{ finding.severity }}</span>
        </div>
        <p class="workspace-security-panel-finding-summary">{{ finding.summary }}</p>
        <p class="workspace-security-panel-finding-path">
          {{ finding.path }}<span v-if="finding.lineNumber">:{{ finding.lineNumber }}</span> · {{ finding.source }}
        </p>
        <code v-if="finding.evidence" class="workspace-security-panel-evidence">{{ finding.evidence }}</code>
      </li>
    </ol>
    <p v-else-if="snapshot" class="workspace-security-panel-empty">No secrets or high-risk changed files detected.</p>
    <p v-else class="workspace-security-panel-empty">Run a scan to inspect current workspace changes.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchWorkspaceSecuritySnapshot } from '../../api/codexRpcClient'
import type { UiWorkspaceSecurityFinding, UiWorkspaceSecuritySnapshot } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const snapshot = ref<UiWorkspaceSecuritySnapshot | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const findings = computed<UiWorkspaceSecurityFinding[]>(() => snapshot.value?.findings ?? [])
const summaryText = computed(() => {
  if (isLoading.value) return 'Scanning changed files and diffs.'
  if (!snapshot.value) return 'Detect secrets, sensitive paths, and high-risk file changes.'
  if (findings.value.length === 0) return 'No current security findings.'
  return `${String(findings.value.length)} finding${findings.value.length === 1 ? '' : 's'} need review.`
})

async function loadSecurity(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    snapshot.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchWorkspaceSecuritySnapshot(cwd)
  } catch (error) {
    snapshot.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to scan workspace security.'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.cwd,
  () => {
    void loadSecurity()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-security-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-security-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-security-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-security-panel-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-security-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-security-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-security-panel-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-security-panel-metrics {
  @apply mt-2 grid grid-cols-3 gap-1.5;
}

.workspace-security-panel-metrics span {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[0.68rem] font-semibold text-zinc-700;
}

.workspace-security-panel-metrics span[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-800;
}

.workspace-security-panel-metrics span[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50 text-amber-800;
}

.workspace-security-panel-metrics span[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-800;
}

.workspace-security-panel-warning-list,
.workspace-security-panel-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-security-panel-warning-list {
  @apply rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800;
}

.workspace-security-panel-finding {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-security-panel-finding[data-severity='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-security-panel-finding[data-severity='warning'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-security-panel-finding-header {
  @apply flex items-center justify-between gap-2;
}

.workspace-security-panel-finding-title {
  @apply truncate text-xs font-semibold text-zinc-950;
}

.workspace-security-panel-finding-severity {
  @apply shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-medium uppercase text-zinc-600;
}

.workspace-security-panel-finding-summary {
  @apply m-0 mt-1 text-xs leading-5 text-zinc-700;
}

.workspace-security-panel-finding-path {
  @apply m-0 mt-1 truncate font-mono text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-security-panel-evidence {
  @apply mt-1 block truncate rounded-md border border-zinc-200 bg-white px-1.5 py-1 font-mono text-[0.68rem] text-zinc-700;
}

.workspace-security-panel-empty {
  @apply m-0 mt-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}
</style>
