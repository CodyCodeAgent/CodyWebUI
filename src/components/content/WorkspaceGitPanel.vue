<template>
  <section class="workspace-git-panel" aria-label="Git panel">
    <header class="workspace-git-panel-header">
      <div>
        <h3 class="workspace-git-panel-title">Git</h3>
        <p class="workspace-git-panel-subtitle">
          {{ status?.branch || 'detached' }}
          <span v-if="status?.upstream">-> {{ status.upstream }}</span>
        </p>
      </div>
      <button
        class="workspace-git-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadStatus"
      >
        <IconTablerRefresh class="workspace-git-panel-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-git-panel-error">{{ errorMessage }}</p>

    <div class="workspace-git-panel-metrics">
      <div class="workspace-git-panel-metric" :data-tone="status?.stagedFileCount ? 'working' : 'neutral'">
        <span>{{ status?.stagedFileCount ?? '-' }}</span>
        <small>staged</small>
      </div>
      <div class="workspace-git-panel-metric" :data-tone="status?.unstagedFileCount ? 'warning' : 'neutral'">
        <span>{{ status?.unstagedFileCount ?? '-' }}</span>
        <small>unstaged</small>
      </div>
      <div class="workspace-git-panel-metric" :data-tone="status?.untrackedFileCount ? 'warning' : 'neutral'">
        <span>{{ status?.untrackedFileCount ?? '-' }}</span>
        <small>untracked</small>
      </div>
      <div class="workspace-git-panel-metric" :data-tone="status?.conflictedFileCount ? 'danger' : 'neutral'">
        <span>{{ status?.conflictedFileCount ?? '-' }}</span>
        <small>conflicts</small>
      </div>
    </div>

    <div class="workspace-git-panel-columns">
      <section class="workspace-git-panel-column" aria-label="Staged changes">
        <h4>Staged</h4>
        <ul v-if="stagedFiles.length > 0" class="workspace-git-panel-file-list">
          <li v-for="file in stagedFiles" :key="`staged:${file.path}`" :data-git-path="file.path">
            <span class="workspace-git-panel-file-status">{{ file.indexStatus || file.status }}</span>
            <span class="workspace-git-panel-file-path">{{ file.path }}</span>
            <button
              type="button"
              :disabled="isActionPending('unstage', file.path)"
              @click="runPathAction('unstage', file.path)"
            >
              {{ isActionPending('unstage', file.path) ? 'Unstaging' : 'Unstage' }}
            </button>
          </li>
        </ul>
        <p v-else class="workspace-git-panel-empty">No staged changes.</p>
      </section>

      <section class="workspace-git-panel-column" aria-label="Unstaged and untracked changes">
        <h4>Working Tree</h4>
        <ul v-if="workingTreeFiles.length > 0" class="workspace-git-panel-file-list">
          <li v-for="file in workingTreeFiles" :key="`working:${file.path}`" :data-git-path="file.path">
            <span class="workspace-git-panel-file-status">{{ file.status === '??' ? '??' : file.worktreeStatus }}</span>
            <span class="workspace-git-panel-file-path">{{ file.path }}</span>
            <button
              type="button"
              :disabled="isActionPending('stage', file.path)"
              @click="runPathAction('stage', file.path)"
            >
              {{ isActionPending('stage', file.path) ? 'Staging' : 'Stage' }}
            </button>
          </li>
        </ul>
        <p v-else class="workspace-git-panel-empty">Working tree has no unstaged changes.</p>
      </section>
    </div>

    <section class="workspace-git-panel-delivery" aria-label="Delivery draft">
      <div class="workspace-git-panel-delivery-header">
        <div>
          <h4>Delivery Draft</h4>
          <p>{{ draftSummary }}</p>
        </div>
        <button
          class="workspace-git-panel-draft-button"
          type="button"
          :disabled="isDraftLoading || !cwd"
          @click="loadDraft"
        >
          {{ isDraftLoading ? 'Generating' : 'Generate draft' }}
        </button>
      </div>

      <p v-if="draftErrorMessage" class="workspace-git-panel-error">{{ draftErrorMessage }}</p>
      <p v-if="commitErrorMessage" class="workspace-git-panel-error">{{ commitErrorMessage }}</p>
      <p v-if="commitResult" class="workspace-git-panel-success">
        Created commit {{ commitResult.commitHash.slice(0, 12) }} on {{ commitResult.branch || 'detached' }}.
      </p>

      <div v-if="draft" class="workspace-git-panel-draft" :data-has-staged="draft.hasStagedChanges">
        <template v-if="draft.hasStagedChanges">
          <label>
            <span>Commit message</span>
            <textarea v-model="commitMessageDraft" />
          </label>
          <button
            class="workspace-git-panel-commit-button"
            type="button"
            :disabled="isCommitting || !draft.hasStagedChanges || !commitMessageDraft.trim()"
            @click="commitDraft"
          >
            {{ isCommitting ? 'Committing' : 'Commit staged changes' }}
          </button>
          <label>
            <span>PR body</span>
            <textarea readonly :value="draft.prBody" />
          </label>
          <div class="workspace-git-panel-draft-grid">
            <div>
              <h5>Risk</h5>
              <ul>
                <li v-for="risk in draft.riskSummary" :key="risk">{{ risk }}</li>
              </ul>
            </div>
            <div>
              <h5>Validation</h5>
              <ul>
                <li v-for="item in draft.validationPlan" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </template>
        <p v-else class="workspace-git-panel-empty">Stage files to generate a commit and PR draft.</p>
      </div>
    </section>

    <section class="workspace-git-panel-pr" aria-label="Pull request draft">
      <div class="workspace-git-panel-delivery-header">
        <div>
          <h4>Pull Request</h4>
          <p>{{ prSummary }}</p>
        </div>
        <button
          class="workspace-git-panel-draft-button"
          type="button"
          :disabled="isPrDraftLoading || !cwd"
          @click="loadPullRequestDraft"
        >
          {{ isPrDraftLoading ? 'Generating' : 'Generate PR' }}
        </button>
      </div>

      <p v-if="prErrorMessage" class="workspace-git-panel-error">{{ prErrorMessage }}</p>
      <p v-if="prResult" class="workspace-git-panel-success">
        <template v-if="prResult.dryRun">
          Dry run prepared: {{ prResult.command.join(' ') }}
        </template>
        <template v-else>
          Created PR
          <a v-if="prResult.url" :href="prResult.url" target="_blank" rel="noreferrer">{{ prResult.url }}</a>
          <span v-else>for {{ prResult.branch }}.</span>
        </template>
      </p>

      <div v-if="prDraft" class="workspace-git-panel-draft">
        <div class="workspace-git-panel-pr-grid">
          <label>
            <span>Base branch</span>
            <input v-model="prBaseBranchDraft" />
          </label>
          <label>
            <span>Title</span>
            <input v-model="prTitleDraft" />
          </label>
        </div>
        <label>
          <span>Body</span>
          <textarea v-model="prBodyDraft" />
        </label>
        <div class="workspace-git-panel-pr-actions">
          <button
            type="button"
            :disabled="isPrActionPending || !canSubmitPr"
            @click="runPullRequest(true)"
          >
            {{ isPrActionPending ? 'Running' : 'Dry run' }}
          </button>
          <button
            type="button"
            data-tone="primary"
            :disabled="isPrActionPending || !canSubmitPr"
            @click="runPullRequest(false)"
          >
            {{ isPrActionPending ? 'Creating' : 'Create draft PR' }}
          </button>
        </div>
        <div class="workspace-git-panel-draft-grid">
          <div>
            <h5>Commits</h5>
            <ul>
              <li v-for="commit in prDraft.commits.slice(0, 6)" :key="commit">{{ commit }}</li>
              <li v-if="prDraft.commits.length === 0">No commits found.</li>
            </ul>
          </div>
          <div>
            <h5>Warnings</h5>
            <ul>
              <li v-for="warning in prDraft.warnings" :key="warning">{{ warning }}</li>
              <li v-if="prDraft.warnings.length === 0">No warnings.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  commitStagedChanges,
  createPullRequest,
  fetchGitDeliveryDraft,
  fetchGitStatus,
  fetchPullRequestDraft,
  stageGitPaths,
  unstageGitPaths,
} from '../../api/codexWorkspaceGitClient'
import {
  canSubmitWorkspacePullRequestDraft,
  isWorkspaceGitActionPending,
  stagedWorkspaceFiles,
  workspaceGitActionKey,
  workspaceGitDraftSummary,
  workingTreeWorkspaceFiles,
  workspacePullRequestSummary,
} from '../../composables/workspaceGitPanelRules'
import type { WorkspaceGitPathAction } from '../../composables/workspaceGitPanelRules'
import type {
  UiGitCommitResult,
  UiGitDeliveryDraft,
  UiGitStatusSnapshot,
  UiPullRequestCreateResult,
  UiPullRequestDraft,
  UiWorkspaceStatusFile,
} from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const status = ref<UiGitStatusSnapshot | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const pendingActionKey = ref('')
const draft = ref<UiGitDeliveryDraft | null>(null)
const isDraftLoading = ref(false)
const draftErrorMessage = ref('')
const commitMessageDraft = ref('')
const isCommitting = ref(false)
const commitErrorMessage = ref('')
const commitResult = ref<UiGitCommitResult | null>(null)
const prDraft = ref<UiPullRequestDraft | null>(null)
const isPrDraftLoading = ref(false)
const prErrorMessage = ref('')
const prBaseBranchDraft = ref('')
const prTitleDraft = ref('')
const prBodyDraft = ref('')
const isPrActionPending = ref(false)
const prResult = ref<UiPullRequestCreateResult | null>(null)

const stagedFiles = computed<UiWorkspaceStatusFile[]>(() => stagedWorkspaceFiles(status.value))
const workingTreeFiles = computed<UiWorkspaceStatusFile[]>(() => workingTreeWorkspaceFiles(status.value))
const draftSummary = computed(() => workspaceGitDraftSummary(draft.value))
const prSummary = computed(() => workspacePullRequestSummary(prDraft.value))
const canSubmitPr = computed(() => canSubmitWorkspacePullRequestDraft({
  cwd: props.cwd,
  title: prTitleDraft.value,
  body: prBodyDraft.value,
  baseBranch: prBaseBranchDraft.value,
}))

function actionKey(action: WorkspaceGitPathAction, path: string): string {
  return workspaceGitActionKey(action, path)
}

function isActionPending(action: WorkspaceGitPathAction, path: string): boolean {
  return isWorkspaceGitActionPending(pendingActionKey.value, action, path)
}

async function loadStatus(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    status.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    status.value = await fetchGitStatus(cwd)
    draft.value = null
    commitMessageDraft.value = ''
    commitResult.value = null
    draftErrorMessage.value = ''
    commitErrorMessage.value = ''
    prDraft.value = null
    prErrorMessage.value = ''
    prBaseBranchDraft.value = ''
    prTitleDraft.value = ''
    prBodyDraft.value = ''
    prResult.value = null
  } catch (error) {
    status.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load git status.'
  } finally {
    isLoading.value = false
  }
}

async function loadDraft(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  isDraftLoading.value = true
  draftErrorMessage.value = ''
  try {
    draft.value = await fetchGitDeliveryDraft(cwd)
    commitMessageDraft.value = draft.value.commitMessage
    commitResult.value = null
    commitErrorMessage.value = ''
  } catch (error) {
    draftErrorMessage.value = error instanceof Error ? error.message : 'Failed to generate delivery draft.'
  } finally {
    isDraftLoading.value = false
  }
}

async function commitDraft(): Promise<void> {
  const cwd = props.cwd.trim()
  const message = commitMessageDraft.value.trim()
  if (!cwd || !message || !draft.value?.hasStagedChanges) return

  isCommitting.value = true
  commitErrorMessage.value = ''
  commitResult.value = null
  try {
    const result = await commitStagedChanges(cwd, message)
    commitResult.value = result
    status.value = result.status
    draft.value = null
    commitMessageDraft.value = ''
    emit('changed')
  } catch (error) {
    commitErrorMessage.value = error instanceof Error ? error.message : 'Failed to commit staged changes.'
  } finally {
    isCommitting.value = false
  }
}

async function loadPullRequestDraft(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  isPrDraftLoading.value = true
  prErrorMessage.value = ''
  prResult.value = null
  try {
    const result = await fetchPullRequestDraft(cwd, prBaseBranchDraft.value)
    prDraft.value = result
    prBaseBranchDraft.value = result.baseBranch
    prTitleDraft.value = result.title
    prBodyDraft.value = result.body
  } catch (error) {
    prErrorMessage.value = error instanceof Error ? error.message : 'Failed to generate pull request draft.'
  } finally {
    isPrDraftLoading.value = false
  }
}

async function runPullRequest(dryRun: boolean): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd || !canSubmitPr.value) return

  isPrActionPending.value = true
  prErrorMessage.value = ''
  prResult.value = null
  try {
    prResult.value = await createPullRequest({
      cwd,
      title: prTitleDraft.value.trim(),
      body: prBodyDraft.value.trim(),
      baseBranch: prBaseBranchDraft.value.trim(),
      draft: true,
      dryRun,
    })
    emit('changed')
  } catch (error) {
    prErrorMessage.value = error instanceof Error ? error.message : 'Failed to create pull request.'
  } finally {
    isPrActionPending.value = false
  }
}

async function runPathAction(action: 'stage' | 'unstage', path: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  pendingActionKey.value = actionKey(action, path)
  errorMessage.value = ''
  try {
    const result = action === 'stage'
      ? await stageGitPaths(cwd, [path])
      : await unstageGitPaths(cwd, [path])
    status.value = result.status
    draft.value = null
    commitMessageDraft.value = ''
    commitResult.value = null
    commitErrorMessage.value = ''
    prDraft.value = null
    prResult.value = null
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : `Failed to ${action} ${path}.`
  } finally {
    pendingActionKey.value = ''
  }
}

watch(
  () => props.cwd,
  () => {
    draft.value = null
    commitMessageDraft.value = ''
    commitResult.value = null
    draftErrorMessage.value = ''
    commitErrorMessage.value = ''
    prDraft.value = null
    prErrorMessage.value = ''
    prBaseBranchDraft.value = ''
    prTitleDraft.value = ''
    prBodyDraft.value = ''
    prResult.value = null
    void loadStatus()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.workspace-git-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-git-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-git-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-git-panel-subtitle {
  @apply m-0 mt-1 truncate font-mono text-xs theme-muted;
}

.workspace-git-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-medium theme-muted transition hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-git-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-git-panel-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-3 py-2 text-xs theme-text-danger;
}

.workspace-git-panel-success {
  @apply m-0 mt-2 rounded-md border theme-border-success theme-bg-success-soft px-3 py-2 text-xs theme-text-success;
}

.workspace-git-panel-metrics {
  @apply mt-2 grid grid-cols-4 gap-1.5;
}

.workspace-git-panel-metric {
  @apply min-w-0 rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.workspace-git-panel-metric[data-tone='working'] {
  @apply theme-border-info theme-bg-info-soft;
}

.workspace-git-panel-metric[data-tone='warning'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-git-panel-metric[data-tone='danger'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.workspace-git-panel-metric span {
  @apply block truncate text-sm font-semibold leading-5 theme-text;
}

.workspace-git-panel-metric small {
  @apply block truncate text-[0.68rem] leading-4 theme-muted;
}

.workspace-git-panel-columns {
  @apply mt-2 grid grid-cols-2 gap-2;
}

.workspace-git-panel-column {
  @apply min-w-0;
}

.workspace-git-panel-column h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-git-panel-file-list {
  @apply m-0 mt-1.5 grid max-h-64 list-none gap-1.5 overflow-auto p-0;
}

.workspace-git-panel-file-list li {
  @apply grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border theme-border theme-bg-subtle px-2 py-1;
}

.workspace-git-panel-file-status {
  @apply font-mono text-[0.68rem] leading-4 theme-muted;
}

.workspace-git-panel-file-path {
  @apply truncate font-mono text-[0.68rem] leading-4 theme-muted;
}

.workspace-git-panel-file-list button {
  @apply inline-flex h-6 shrink-0 items-center rounded-md border theme-border theme-bg-panel px-2 text-[0.68rem] font-semibold theme-muted transition hover:theme-bg-control disabled:cursor-wait disabled:opacity-60;
}

.workspace-git-panel-empty {
  @apply m-0 mt-1.5 rounded-md border border-dashed theme-border px-3 py-2 text-xs theme-muted;
}

.workspace-git-panel-delivery {
  @apply mt-3 rounded-md border theme-border theme-bg-subtle p-2;
}

.workspace-git-panel-pr {
  @apply mt-3 rounded-md border theme-border-info theme-bg-info-soft p-2;
}

.workspace-git-panel-delivery-header {
  @apply flex items-start justify-between gap-2;
}

.workspace-git-panel-delivery h4,
.workspace-git-panel-pr h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-git-panel-delivery p,
.workspace-git-panel-pr p {
  @apply m-0 mt-0.5 text-xs theme-muted;
}

.workspace-git-panel-delivery .workspace-git-panel-success,
.workspace-git-panel-pr .workspace-git-panel-success {
  @apply mt-2 theme-text-success;
}

.workspace-git-panel-pr .workspace-git-panel-success {
  @apply break-words;
}

.workspace-git-panel-pr .workspace-git-panel-success a {
  @apply font-semibold underline underline-offset-2;
}

.workspace-git-panel-draft-button {
  @apply inline-flex h-7 shrink-0 items-center rounded-md border theme-border theme-bg-panel px-2 text-[0.68rem] font-semibold theme-muted transition hover:theme-bg-control disabled:cursor-wait disabled:opacity-60;
}

.workspace-git-panel-commit-button {
  @apply inline-flex h-8 w-fit items-center rounded-md border theme-border-success bg-emerald-600 px-3 text-xs font-semibold theme-on-success transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:theme-border disabled:theme-bg-disabled disabled:theme-muted;
}

.workspace-git-panel-draft {
  @apply mt-2 grid gap-2;
}

.workspace-git-panel-draft label {
  @apply grid gap-1;
}

.workspace-git-panel-draft label span,
.workspace-git-panel-draft h5 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal theme-muted;
}

.workspace-git-panel-draft textarea {
  @apply min-h-24 resize-y rounded-md border theme-border theme-bg-panel p-2 font-mono text-[0.68rem] leading-4 theme-text outline-none;
}

.workspace-git-panel-draft input {
  @apply h-8 min-w-0 rounded-md border theme-border theme-bg-panel px-2 font-mono text-xs theme-text outline-none;
}

.workspace-git-panel-draft label:nth-of-type(2) textarea {
  @apply min-h-44;
}

.workspace-git-panel-pr-grid {
  @apply grid grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] gap-2;
}

.workspace-git-panel-pr-actions {
  @apply flex flex-wrap gap-2;
}

.workspace-git-panel-pr-actions button {
  @apply inline-flex h-8 items-center rounded-md border theme-border theme-bg-panel px-3 text-xs font-semibold theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-git-panel-pr-actions button[data-tone='primary'] {
  @apply theme-border-info theme-bg-accent theme-on-accent hover:bg-blue-700 disabled:theme-border disabled:theme-bg-disabled disabled:theme-muted;
}

.workspace-git-panel-draft-grid {
  @apply grid grid-cols-2 gap-2;
}

.workspace-git-panel-draft-grid > div {
  @apply rounded-md border theme-border theme-bg-panel p-2;
}

.workspace-git-panel-draft-grid ul {
  @apply m-0 mt-1 grid list-none gap-1 p-0;
}

.workspace-git-panel-draft-grid li {
  @apply text-xs leading-4 theme-muted;
}

@media (max-width: 760px) {
  .workspace-git-panel-metrics,
  .workspace-git-panel-columns,
  .workspace-git-panel-pr-grid,
  .workspace-git-panel-draft-grid {
    @apply grid-cols-1;
  }
}
</style>
