<template>
  <section class="workspace-worktrees-panel" aria-label="Workspace worktrees">
    <header class="workspace-worktrees-panel-header">
      <div>
        <h3 class="workspace-worktrees-panel-title">Worktrees</h3>
        <p class="workspace-worktrees-panel-subtitle">{{ worktreeSummary }}</p>
      </div>
      <button
        class="workspace-worktrees-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadWorktrees"
      >
        <IconTablerRefresh class="workspace-worktrees-panel-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-worktrees-panel-error">{{ errorMessage }}</p>

    <form class="workspace-worktrees-panel-form" @submit.prevent="createWorktree">
      <label>
        <span>branch</span>
        <input v-model="branchName" type="text" placeholder="codex/my-isolated-task" :disabled="isCreating || !cwd" />
      </label>
      <label>
        <span>base</span>
        <input v-model="baseRef" type="text" placeholder="HEAD" :disabled="isCreating || !cwd" />
      </label>
      <button type="submit" :disabled="isCreating || !cwd || !branchName.trim()">
        {{ isCreating ? 'Creating' : 'Create' }}
      </button>
    </form>

    <p v-if="createMessage" class="workspace-worktrees-panel-message">{{ createMessage }}</p>

    <ul v-if="warnings.length > 0" class="workspace-worktrees-panel-warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <ol v-if="worktrees.length > 0" class="workspace-worktrees-panel-list">
      <li
        v-for="worktree in worktrees"
        :key="worktree.path"
        :data-current="worktree.isCurrent"
        :data-managed="worktree.isManaged"
        :data-prunable="worktree.prunable"
      >
        <div class="workspace-worktrees-panel-worktree-main">
          <span class="workspace-worktrees-panel-branch">{{ worktree.branch || 'detached' }}</span>
          <span class="workspace-worktrees-panel-path">{{ worktree.path }}</span>
        </div>
        <div class="workspace-worktrees-panel-flags">
          <span v-if="worktree.isCurrent">current</span>
          <span v-if="worktree.isManaged">managed</span>
          <span v-if="worktree.detached">detached</span>
          <span v-if="worktree.prunable">prunable</span>
        </div>
        <div v-if="worktree.isManaged && !worktree.isCurrent" class="workspace-worktrees-panel-actions">
          <button
            type="button"
            :disabled="applyingPath === worktree.path || removingPath === worktree.path"
            @click="applyPatch(worktree.path)"
          >
            {{ applyingPath === worktree.path ? 'Applying' : 'Apply diff' }}
          </button>
          <button
            type="button"
            :disabled="removingPath === worktree.path || applyingPath === worktree.path"
            @click="removeWorktree(worktree.path)"
          >
            {{ removingPath === worktree.path ? 'Removing' : 'Remove' }}
          </button>
        </div>
      </li>
    </ol>
    <p v-else class="workspace-worktrees-panel-empty">No git worktrees detected.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  applyWorkspacePatchToWorktree,
  createWorkspaceWorktree,
  fetchWorkspaceWorktrees,
  removeWorkspaceWorktree,
} from '../../api/codexWorkspaceGitClient'
import type { UiWorktree, UiWorktreeSnapshot } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const snapshot = ref<UiWorktreeSnapshot | null>(null)
const isLoading = ref(false)
const isCreating = ref(false)
const removingPath = ref('')
const applyingPath = ref('')
const errorMessage = ref('')
const createMessage = ref('')
const branchName = ref('')
const baseRef = ref('HEAD')

const worktrees = computed<UiWorktree[]>(() => snapshot.value?.worktrees ?? [])
const warnings = computed(() => snapshot.value?.warnings ?? [])
const managedCount = computed(() => worktrees.value.filter((worktree) => worktree.isManaged).length)
const worktreeSummary = computed(() => {
  if (!snapshot.value) return 'Create isolated git worktrees for parallel agent work.'
  return `${String(worktrees.value.length)} total · ${String(managedCount.value)} managed`
})

async function loadWorktrees(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    snapshot.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchWorkspaceWorktrees(cwd)
  } catch (error) {
    snapshot.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load git worktrees.'
  } finally {
    isLoading.value = false
  }
}

async function createWorktree(): Promise<void> {
  const cwd = props.cwd.trim()
  const branch = branchName.value.trim()
  if (!cwd || !branch) return

  isCreating.value = true
  errorMessage.value = ''
  createMessage.value = ''
  try {
    const result = await createWorkspaceWorktree(cwd, branch, baseRef.value.trim() || 'HEAD')
    snapshot.value = result.snapshot
    branchName.value = ''
    createMessage.value = `Created ${result.worktree.branch || branch}.`
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create git worktree.'
  } finally {
    isCreating.value = false
  }
}

async function removeWorktree(path: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  removingPath.value = path
  errorMessage.value = ''
  createMessage.value = ''
  try {
    const result = await removeWorkspaceWorktree(cwd, path)
    snapshot.value = result.snapshot
    createMessage.value = `Removed ${result.removedPath}.`
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to remove git worktree.'
  } finally {
    removingPath.value = ''
  }
}

async function applyPatch(path: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  applyingPath.value = path
  errorMessage.value = ''
  createMessage.value = ''
  try {
    const result = await applyWorkspacePatchToWorktree(cwd, path)
    snapshot.value = result.snapshot
    createMessage.value = `Applied ${formatBytes(result.patchBytes)} to ${result.worktree.branch || result.worktree.path}; ${String(result.targetStatus.files.length)} changed file(s).`
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to apply current diff.'
  } finally {
    applyingPath.value = ''
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

watch(
  () => props.cwd,
  () => {
    createMessage.value = ''
    void loadWorktrees()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.workspace-worktrees-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-worktrees-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-worktrees-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-worktrees-panel-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-worktrees-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-medium theme-muted transition hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-worktrees-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-worktrees-panel-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-3 py-2 text-xs theme-text-danger;
}

.workspace-worktrees-panel-message {
  @apply m-0 mt-2 rounded-md border theme-border-success theme-bg-success-soft px-3 py-2 text-xs theme-text-success;
}

.workspace-worktrees-panel-form {
  @apply mt-3 grid grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto] gap-2;
}

.workspace-worktrees-panel-form label {
  @apply min-w-0;
}

.workspace-worktrees-panel-form span {
  @apply mb-1 block text-[0.65rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-worktrees-panel-form input {
  @apply h-8 w-full rounded-md border theme-border theme-bg-panel px-2 font-mono text-xs theme-text outline-none transition focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-worktrees-panel-form button,
.workspace-worktrees-panel-list button {
  @apply inline-flex h-8 shrink-0 items-center justify-center rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-semibold theme-muted transition hover:theme-bg-control disabled:cursor-wait disabled:opacity-60;
}

.workspace-worktrees-panel-form button {
  @apply self-end;
}

.workspace-worktrees-panel-warning-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-worktrees-panel-warning-list li {
  @apply rounded-md border theme-border-warning theme-bg-warning-soft px-2 py-1.5 text-xs leading-4 theme-text-warning;
}

.workspace-worktrees-panel-list {
  @apply m-0 mt-3 grid list-none gap-1.5 p-0;
}

.workspace-worktrees-panel-list li {
  @apply grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.workspace-worktrees-panel-list li[data-current='true'] {
  @apply theme-border-info theme-bg-info-soft;
}

.workspace-worktrees-panel-list li[data-prunable='true'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-worktrees-panel-worktree-main {
  @apply min-w-0;
}

.workspace-worktrees-panel-branch {
  @apply block truncate font-mono text-xs font-semibold theme-text;
}

.workspace-worktrees-panel-path {
  @apply mt-0.5 block truncate font-mono text-[0.68rem] theme-muted;
}

.workspace-worktrees-panel-flags {
  @apply flex flex-wrap justify-end gap-1;
}

.workspace-worktrees-panel-flags span {
  @apply rounded-full border theme-border theme-bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-worktrees-panel-actions {
  @apply flex flex-wrap justify-end gap-1.5;
}

.workspace-worktrees-panel-empty {
  @apply m-0 mt-2 rounded-md border border-dashed theme-border px-3 py-2 text-xs theme-muted;
}

@media (max-width: 760px) {
  .workspace-worktrees-panel-form,
  .workspace-worktrees-panel-list li {
    @apply grid-cols-1;
  }

  .workspace-worktrees-panel-flags {
    @apply justify-start;
  }

  .workspace-worktrees-panel-actions {
    @apply justify-start;
  }
}
</style>
