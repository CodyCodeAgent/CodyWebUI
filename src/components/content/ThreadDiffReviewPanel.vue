<template>
  <section class="thread-diff-review-panel" aria-label="Diff review">
    <header class="thread-diff-review-header">
      <div class="thread-diff-review-heading">
        <h3 class="thread-diff-review-title">Diff review</h3>
        <p class="thread-diff-review-summary">
          {{ review.summary.fileCount }} files · {{ review.summary.hunkCount }} hunks
        </p>
      </div>
      <div class="thread-diff-review-actions">
        <button
          v-if="review.summary.patch"
          class="thread-diff-copy-button"
          type="button"
          :disabled="isCopying"
          @click="onCopyPatch"
        >
          <IconTablerCopy class="thread-diff-copy-icon" />
          <span>{{ copyLabel }}</span>
        </button>
        <button
          class="thread-diff-rollback-all-button"
          type="button"
          :disabled="!canRollback || workspaceRollbackState.status === 'rollingBack'"
          @click="onRollbackWorkspace"
        >
          {{ workspaceRollbackButtonLabel }}
        </button>
      </div>
    </header>

    <p
      v-if="workspaceRollbackState.message"
      class="thread-diff-workspace-rollback-note"
      :data-state="workspaceRollbackState.status"
    >
      {{ workspaceRollbackState.message }}
    </p>
    <p v-if="commentError" class="thread-diff-comment-error">{{ commentError }}</p>

    <div v-if="review.files.length > 0" class="thread-diff-stat-row">
      <span class="thread-diff-stat thread-diff-stat-added">+{{ review.summary.addedLines }}</span>
      <span class="thread-diff-stat thread-diff-stat-removed">-{{ review.summary.removedLines }}</span>
    </div>

    <section class="thread-review-draft-section" aria-label="Review delivery draft">
      <header class="thread-review-draft-header">
        <div>
          <h4 class="thread-review-draft-title">Review Draft</h4>
          <p class="thread-review-draft-summary">{{ reviewDraftSummary }}</p>
        </div>
        <button
          class="thread-review-draft-refresh"
          type="button"
          :disabled="isLoadingReviewDraft || !canRollback"
          @click="loadReviewDraft"
        >
          {{ reviewGenerateButtonLabel(isLoadingReviewDraft) }}
        </button>
      </header>
      <p v-if="reviewDraftError" class="thread-review-draft-error">{{ reviewDraftError }}</p>
      <div v-if="reviewDraft" class="thread-review-draft" :data-has-changes="reviewDraft.hasReviewChanges">
        <template v-if="reviewDraft.hasReviewChanges">
          <div v-if="reviewDraft.warnings.length > 0" class="thread-review-draft-warning-list">
            <p v-for="warning in reviewDraft.warnings" :key="warning">{{ warning }}</p>
          </div>
          <label class="thread-review-draft-field">
            <span>Commit message</span>
            <textarea readonly :value="reviewDraft.commitMessage" />
          </label>
          <button
            class="thread-review-draft-copy"
            type="button"
            :disabled="reviewDraftCopyState === 'copying'"
            @click="copyReviewDraft('commit')"
          >
            {{ reviewDraftCopyLabel('commit') }}
          </button>
          <label class="thread-review-draft-field">
            <span>PR body</span>
            <textarea readonly :value="reviewDraft.prBody" />
          </label>
          <button
            class="thread-review-draft-copy"
            type="button"
            :disabled="reviewDraftCopyState === 'copying'"
            @click="copyReviewDraft('pr')"
          >
            {{ reviewDraftCopyLabel('pr') }}
          </button>
          <div class="thread-review-draft-grid">
            <section>
              <h5>Risk</h5>
              <ul>
                <li v-for="risk in reviewDraft.riskSummary" :key="risk">{{ risk }}</li>
              </ul>
            </section>
            <section>
              <h5>Validation</h5>
              <ul>
                <li v-for="item in reviewDraft.validationPlan" :key="item">{{ item }}</li>
                <li v-if="reviewDraft.validationPlan.length === 0">No validation commands inferred.</li>
              </ul>
            </section>
          </div>
        </template>
        <p v-else class="thread-review-draft-empty">No workspace changes to summarize.</p>
      </div>
    </section>

    <section class="thread-checkpoint-section" aria-label="Rollback checkpoints">
      <header class="thread-checkpoint-header">
        <h4 class="thread-checkpoint-title">Checkpoints</h4>
        <button class="thread-checkpoint-refresh" type="button" :disabled="isLoadingCheckpoints" @click="loadCheckpoints">
          {{ reviewCheckpointRefreshButtonLabel(isLoadingCheckpoints) }}
        </button>
      </header>
      <p v-if="checkpointError" class="thread-checkpoint-empty">{{ checkpointError }}</p>
      <p v-else-if="checkpoints.length === 0" class="thread-checkpoint-empty">
        No rollback checkpoints yet.
      </p>
      <ol v-else class="thread-checkpoint-list">
        <li v-for="checkpoint in checkpoints" :key="checkpoint.id" class="thread-checkpoint-item">
          <div class="thread-checkpoint-main">
            <span class="thread-checkpoint-label">{{ checkpoint.label }}</span>
            <span class="thread-checkpoint-time">{{ formatCheckpointTime(checkpoint.createdAtIso) }}</span>
          </div>
          <p class="thread-checkpoint-paths">{{ formatCheckpointPaths(checkpoint.paths) }}</p>
          <p class="thread-checkpoint-meta">
            {{ checkpoint.id }} · {{ formatBytes(checkpoint.patchBytes) }}
          </p>
          <div class="thread-checkpoint-actions">
            <button
              class="thread-checkpoint-patch-button"
              type="button"
              :disabled="checkpointPatchState(checkpoint.id).status === 'loading'"
              @click="onToggleCheckpointPatch(checkpoint.id)"
            >
              {{ checkpointPatchButtonLabel(checkpoint.id) }}
            </button>
          </div>
          <p
            v-if="checkpointPatchState(checkpoint.id).status === 'failed'"
            class="thread-checkpoint-patch-error"
          >
            {{ checkpointPatchState(checkpoint.id).message }}
          </p>
          <div
            v-if="checkpointPatchState(checkpoint.id).isVisible"
            class="thread-checkpoint-patch"
          >
            <pre v-if="checkpointPatchState(checkpoint.id).patch"><code>{{ checkpointPatchState(checkpoint.id).patch }}</code></pre>
            <p v-else class="thread-checkpoint-patch-empty">Patch is empty.</p>
          </div>
        </li>
      </ol>
    </section>

    <p v-if="review.files.length === 0" class="thread-diff-empty">No file diffs yet.</p>

    <div v-else class="thread-diff-file-list">
      <details
        v-for="(file, fileIndex) in review.files"
        :key="file.filePath"
        class="thread-diff-file"
        :data-rollback-state="rollbackState(file.filePath).status"
        :open="fileIndex === 0"
      >
        <summary class="thread-diff-file-summary">
          <span class="thread-diff-file-path" :title="file.filePath">
            <span class="thread-diff-file-name">{{ displayFilePath(file.filePath).label }}</span>
            <span v-if="displayFilePath(file.filePath).directory" class="thread-diff-file-directory">
              {{ displayFilePath(file.filePath).directory }}
            </span>
          </span>
          <span v-if="file.oldPath" class="thread-diff-file-old-path">{{ file.oldPath }}</span>
          <span class="thread-diff-file-status">{{ fileStatusLabel(file.status, file.filePath) }}</span>
          <span class="thread-diff-file-lines">
            <span class="thread-diff-line-added">+{{ file.addedLines }}</span>
            <span class="thread-diff-line-removed">-{{ file.removedLines }}</span>
          </span>
        </summary>

        <div class="thread-diff-file-actions">
          <p class="thread-diff-rollback-note">{{ rollbackState(file.filePath).message || rollbackHint }}</p>
          <button
            class="thread-diff-rollback-button"
            type="button"
            :disabled="!canRollback || rollbackState(file.filePath).status === 'rollingBack'"
            @click="onRollbackFile(file.filePath)"
          >
            {{ rollbackButtonLabel(file.filePath) }}
          </button>
        </div>

        <div class="thread-diff-hunk-list">
          <section
            v-for="(hunk, hunkIndex) in file.hunks"
            :key="`${file.filePath}:${hunk.header}:${hunkIndex}`"
            class="thread-diff-hunk"
            :data-hunk-state="hunkRollbackState(file.filePath, hunkIndex).status"
            :data-stage-state="hunkStageState(file.filePath, hunkIndex).status"
          >
            <header class="thread-diff-hunk-header">
              <code>{{ hunk.header }}</code>
              <span class="thread-diff-hunk-lines">
                <span class="thread-diff-line-added">+{{ hunk.addedLines }}</span>
                <span class="thread-diff-line-removed">-{{ hunk.removedLines }}</span>
              </span>
              <button
                class="thread-diff-hunk-stage-button"
                type="button"
                :disabled="!canRollback || hunkStageState(file.filePath, hunkIndex).status === 'staging'"
                @click="onStageHunk(file.filePath, hunkIndex)"
              >
                {{ hunkStageButtonLabel(file.filePath, hunkIndex) }}
              </button>
              <button
                class="thread-diff-hunk-rollback-button"
                type="button"
                :disabled="!canRollback || hunkRollbackState(file.filePath, hunkIndex).status === 'rollingBack'"
                @click="onRollbackHunk(file.filePath, hunkIndex)"
              >
                {{ hunkRollbackButtonLabel(file.filePath, hunkIndex) }}
              </button>
            </header>
            <p
              v-if="hunkStatusMessage(file.filePath, hunkIndex)"
              class="thread-diff-hunk-rollback-note"
            >
              {{ hunkStatusMessage(file.filePath, hunkIndex) }}
            </p>

            <pre class="thread-diff-code"><code>
<span
  v-for="(line, lineIndex) in hunk.lines"
  :key="`${hunk.header}:${lineIndex}`"
  class="thread-diff-code-line"
  :data-kind="line.kind"
><span class="thread-diff-line-number">{{ formatLineNumber(line.oldLineNumber) }}</span><span class="thread-diff-line-number">{{ formatLineNumber(line.newLineNumber) }}</span><span class="thread-diff-line-prefix">{{ linePrefix(line.kind) }}</span><span class="thread-diff-line-content">{{ line.content }}</span><button
  class="thread-diff-line-comment-button"
  type="button"
  :disabled="!canRollback"
  @click="openCommentComposer(file.filePath, hunk.header, hunkIndex, line)"
>Comment</button></span>
            </code></pre>
            <div
              v-if="activeCommentTarget && activeCommentTarget.filePath === file.filePath && activeCommentTarget.hunkIndex === hunkIndex"
              class="thread-diff-comment-composer"
            >
              <p>Comment on {{ commentDraftTargetLabel }}</p>
              <textarea v-model="commentDraft" />
              <div>
                <button type="button" :disabled="isSavingComment || !commentDraft.trim()" @click="saveComment">
                  {{ reviewCommentSaveButtonLabel(isSavingComment) }}
                </button>
                <button type="button" :disabled="isSavingComment" @click="cancelComment">Cancel</button>
              </div>
            </div>
            <ol v-if="commentsForHunk(file.filePath, hunk.header).length > 0" class="thread-diff-comment-list">
              <li
                v-for="comment in commentsForHunk(file.filePath, hunk.header)"
                :key="comment.id"
                :data-status="comment.status"
              >
                <header>
                  <span>{{ formatCommentAnchor(comment) }}</span>
                  <small>{{ comment.status }}</small>
                </header>
                <p>{{ comment.body }}</p>
                <div>
                  <button
                    type="button"
                    :disabled="commentActionId === comment.id || comment.status === 'resolved'"
                    @click="createFollowUp(comment.id)"
                  >
                    {{ commentFollowUpButtonLabel(comment) }}
                  </button>
                  <button
                    type="button"
                    :disabled="commentActionId === comment.id || comment.status === 'resolved'"
                    @click="resolveComment(comment.id)"
                  >
                    Resolve
                  </button>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  createWorkspaceReviewComment,
  createWorkspaceReviewFollowUp,
  fetchWorkspaceReviewComments,
  fetchToolingCheckpointPatch,
  fetchToolingCheckpoints,
  rollbackWorkspaceChanges,
  rollbackWorkspaceFile,
  rollbackWorkspaceHunk,
  stageWorkspaceHunk,
  updateWorkspaceReviewCommentStatus,
} from '../../api/codexDiffReviewClient'
import { fetchWorkspaceReviewDraft } from '../../api/codexWorkspaceGitClient'
import {
  buildReviewDraftSummary,
  buildReviewCommentDraftTarget,
  checkpointPatchButtonLabel as checkpointPatchButtonLabelForState,
  commentsForDiffHunk,
  diffCopyPatchButtonLabel,
  diffReviewFileStatusLabel,
  diffLinePrefix,
  formatBytes,
  formatCheckpointPaths,
  formatCheckpointTime,
  formatDiffLineNumber,
  formatReviewCommentAnchor,
  failedCheckpointPatchState,
  fileRollbackSuccessMessage,
  hunkRollbackSuccessMessage,
  loadedCheckpointPatchState,
  loadingCheckpointPatchState,
  reviewCheckpointPatchStateForId,
  reviewCheckpointRefreshButtonLabel,
  reviewCommentDraftTargetLabel,
  reviewCommentFollowUpButtonLabel,
  reviewCommentSaveButtonLabel,
  reviewDraftCopyLabel as reviewDraftCopyLabelForState,
  reviewGenerateButtonLabel,
  reviewHunkRollbackStateForKey,
  reviewHunkStageStateForKey,
  reviewHunkStatusMessage,
  reviewRollbackStateForPath,
  rollbackFileButtonLabel,
  rollbackHunkButtonLabel,
  setReviewCheckpointPatchStateForId,
  setReviewHunkRollbackStateForKey,
  setReviewHunkStageStateForKey,
  setReviewRollbackStateForPath,
  stageHunkButtonLabel,
  toggleLoadedCheckpointPatchVisibility,
  workspaceRollbackSuccessMessage,
  workspaceRollbackButtonLabel as workspaceRollbackButtonLabelForState,
} from '../../composables/threadDiffReviewPanelRules'
import type {
  ReviewCheckpointPatchState,
  ReviewCommentDraftTarget,
  ReviewDraftCopyState,
  ReviewHunkStageState,
  ReviewPatchCopyState,
  ReviewRollbackState,
} from '../../composables/threadDiffReviewPanelRules'
import { buildWorkLogDisplayPathParts } from '../../composables/useThreadActivity'
import { buildDiffReview } from '../../composables/useDiffReview'
import type { UiDiffLineKind, UiDiffReviewLine } from '../../composables/useDiffReview'
import type {
  UiMessage,
  UiReviewComment,
  UiToolingCheckpoint,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiToolingStageHunkResult,
  UiWorkspaceReviewDraft,
} from '../../types/codex'
import IconTablerCopy from '../icons/IconTablerCopy.vue'

const props = defineProps<{
  messages: UiMessage[]
  cwd: string
}>()

const emit = defineEmits<{
  rollbackCompleted: [result: UiToolingRollbackFileResult]
  workspaceRollbackCompleted: [result: UiToolingRollbackWorkspaceResult]
  hunkRollbackCompleted: [result: UiToolingRollbackHunkResult]
  hunkStageCompleted: [result: UiToolingStageHunkResult]
}>()

const copyState = ref<ReviewPatchCopyState>('idle')
const workspaceRollbackState = ref<ReviewRollbackState>({
  status: 'idle',
  message: '',
})
const rollbackByPath = ref<Record<string, ReviewRollbackState>>({})
const hunkRollbackByKey = ref<Record<string, ReviewRollbackState>>({})
const hunkStageByKey = ref<Record<string, ReviewHunkStageState>>({})
const checkpoints = ref<UiToolingCheckpoint[]>([])
const isLoadingCheckpoints = ref(false)
const checkpointError = ref('')
const reviewComments = ref<UiReviewComment[]>([])
const commentError = ref('')
const isSavingComment = ref(false)
const commentActionId = ref('')
const commentDraft = ref('')
const reviewDraft = ref<UiWorkspaceReviewDraft | null>(null)
const isLoadingReviewDraft = ref(false)
const reviewDraftError = ref('')
const reviewDraftCopyState = ref<ReviewDraftCopyState>('idle')
const activeCommentTarget = ref<ReviewCommentDraftTarget | null>(null)
const checkpointPatchById = ref<Record<string, ReviewCheckpointPatchState>>({})
const review = computed(() => buildDiffReview(props.messages))
const isCopying = computed(() => copyState.value === 'copying')
const canRollback = computed(() => props.cwd.trim().length > 0)
const rollbackHint = computed(() =>
  canRollback.value
    ? 'A checkpoint will be saved before this file is restored.'
    : 'Rollback needs a selected workspace.',
)
const copyLabel = computed(() => diffCopyPatchButtonLabel(copyState.value))
const workspaceRollbackButtonLabel = computed(() => workspaceRollbackButtonLabelForState(workspaceRollbackState.value))
const reviewDraftSummary = computed(() => buildReviewDraftSummary({
  canRollback: canRollback.value,
  isLoading: isLoadingReviewDraft.value,
  reviewDraft: reviewDraft.value,
}))
const commentDraftTargetLabel = computed(() =>
  activeCommentTarget.value ? reviewCommentDraftTargetLabel(activeCommentTarget.value) : ''
)

function rollbackState(filePath: string): ReviewRollbackState {
  return reviewRollbackStateForPath(rollbackByPath.value, filePath)
}

function rollbackButtonLabel(filePath: string): string {
  return rollbackFileButtonLabel(rollbackState(filePath))
}

function fileStatusLabel(status: string, filePath: string): string {
  return diffReviewFileStatusLabel({
    status,
    rollbackState: rollbackState(filePath),
  })
}

function displayFilePath(filePath: string) {
  return buildWorkLogDisplayPathParts(filePath, props.cwd)
}

function hunkRollbackState(filePath: string, hunkIndex: number): ReviewRollbackState {
  return reviewHunkRollbackStateForKey(hunkRollbackByKey.value, filePath, hunkIndex)
}

function hunkRollbackButtonLabel(filePath: string, hunkIndex: number): string {
  return rollbackHunkButtonLabel(hunkRollbackState(filePath, hunkIndex))
}

function hunkStageState(filePath: string, hunkIndex: number): ReviewHunkStageState {
  return reviewHunkStageStateForKey(hunkStageByKey.value, filePath, hunkIndex)
}

function hunkStageButtonLabel(filePath: string, hunkIndex: number): string {
  return stageHunkButtonLabel(hunkStageState(filePath, hunkIndex))
}

function hunkStatusMessage(filePath: string, hunkIndex: number): string {
  return reviewHunkStatusMessage(hunkStageState(filePath, hunkIndex), hunkRollbackState(filePath, hunkIndex))
}

function reviewDraftCopyLabel(kind: 'commit' | 'pr'): string {
  return reviewDraftCopyLabelForState(kind, reviewDraftCopyState.value)
}

function commentsForHunk(filePath: string, hunkHeader: string): UiReviewComment[] {
  return commentsForDiffHunk(reviewComments.value, filePath, hunkHeader)
}

function openCommentComposer(
  filePath: string,
  hunkHeader: string,
  hunkIndex: number,
  line: UiDiffReviewLine,
): void {
  if (!canRollback.value) return
  activeCommentTarget.value = buildReviewCommentDraftTarget({
    filePath,
    hunkHeader,
    hunkIndex,
    line,
  })
  commentDraft.value = ''
  commentError.value = ''
}

function cancelComment(): void {
  activeCommentTarget.value = null
  commentDraft.value = ''
}

function formatCommentAnchor(comment: UiReviewComment): string {
  return formatReviewCommentAnchor(comment)
}

function commentFollowUpButtonLabel(comment: UiReviewComment): string {
  return reviewCommentFollowUpButtonLabel(comment)
}

async function loadReviewComments(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    reviewComments.value = []
    commentError.value = ''
    return
  }
  try {
    reviewComments.value = (await fetchWorkspaceReviewComments(cwd)).comments
  } catch (error) {
    reviewComments.value = []
    commentError.value = error instanceof Error ? error.message : 'Failed to load review comments.'
  }
}

async function loadReviewDraft(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    reviewDraft.value = null
    reviewDraftError.value = ''
    return
  }

  isLoadingReviewDraft.value = true
  reviewDraftError.value = ''
  try {
    reviewDraft.value = await fetchWorkspaceReviewDraft(cwd)
  } catch (error) {
    reviewDraft.value = null
    reviewDraftError.value = error instanceof Error ? error.message : 'Failed to generate review draft.'
  } finally {
    isLoadingReviewDraft.value = false
  }
}

async function copyReviewDraft(kind: 'commit' | 'pr'): Promise<void> {
  if (!reviewDraft.value) return
  const value = kind === 'commit' ? reviewDraft.value.commitMessage : reviewDraft.value.prBody
  if (!value.trim()) return
  reviewDraftCopyState.value = 'copying'

  try {
    await writeClipboardText(value)
    reviewDraftCopyState.value = kind === 'commit' ? 'copied_commit' : 'copied_pr'
  } catch {
    reviewDraftCopyState.value = 'failed'
  } finally {
    window.setTimeout(() => {
      if (reviewDraftCopyState.value !== 'copying') reviewDraftCopyState.value = 'idle'
    }, 1600)
  }
}

async function saveComment(): Promise<void> {
  const cwd = props.cwd.trim()
  const target = activeCommentTarget.value
  const body = commentDraft.value.trim()
  if (!cwd || !target || !body) return

  isSavingComment.value = true
  commentError.value = ''
  try {
    const { hunkIndex: _hunkIndex, lineNumber: _lineNumber, ...anchor } = target
    const comment = await createWorkspaceReviewComment(cwd, anchor, body)
    reviewComments.value = [comment, ...reviewComments.value]
    activeCommentTarget.value = null
    commentDraft.value = ''
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : 'Failed to save review comment.'
  } finally {
    isSavingComment.value = false
  }
}

async function createFollowUp(commentId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return
  commentActionId.value = commentId
  commentError.value = ''
  try {
    const result = await createWorkspaceReviewFollowUp(cwd, commentId)
    reviewComments.value = reviewComments.value.map((comment) => (
      comment.id === commentId ? result.comment : comment
    ))
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : 'Failed to create follow-up task.'
  } finally {
    commentActionId.value = ''
  }
}

async function resolveComment(commentId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return
  commentActionId.value = commentId
  commentError.value = ''
  try {
    const comment = await updateWorkspaceReviewCommentStatus(cwd, commentId, 'resolved')
    reviewComments.value = reviewComments.value.map((candidate) => (
      candidate.id === commentId ? comment : candidate
    ))
  } catch (error) {
    commentError.value = error instanceof Error ? error.message : 'Failed to resolve review comment.'
  } finally {
    commentActionId.value = ''
  }
}

function checkpointPatchState(checkpointId: string): ReviewCheckpointPatchState {
  return reviewCheckpointPatchStateForId(checkpointPatchById.value, checkpointId)
}

function checkpointPatchButtonLabel(checkpointId: string): string {
  return checkpointPatchButtonLabelForState(checkpointPatchState(checkpointId))
}

function formatLineNumber(value: number | null): string {
  return formatDiffLineNumber(value)
}

function linePrefix(kind: UiDiffLineKind): string {
  return diffLinePrefix(kind)
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall through to the textarea path for browsers that expose Clipboard API
      // but reject it in embedded or permission-restricted contexts.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const didCopy = document.execCommand('copy')
  textarea.remove()
  if (!didCopy) throw new Error('Clipboard copy failed')
}

async function onCopyPatch(): Promise<void> {
  if (!review.value.summary.patch) return
  copyState.value = 'copying'

  try {
    await writeClipboardText(review.value.summary.patch)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  } finally {
    window.setTimeout(() => {
      if (copyState.value !== 'copying') copyState.value = 'idle'
    }, 1600)
  }
}

async function onRollbackFile(filePath: string): Promise<void> {
  if (!canRollback.value) return
  const didConfirm = window.confirm(`Rollback ${filePath} to the git baseline? A checkpoint patch will be saved first.`)
  if (!didConfirm) return

  rollbackByPath.value = setReviewRollbackStateForPath(
    rollbackByPath.value,
    filePath,
    { status: 'rollingBack', message: 'Saving checkpoint and restoring file...' },
  )

  try {
    const result = await rollbackWorkspaceFile(props.cwd, filePath)
    rollbackByPath.value = setReviewRollbackStateForPath(
      rollbackByPath.value,
      filePath,
      { status: 'rolledBack', message: fileRollbackSuccessMessage(result) },
    )
    emit('rollbackCompleted', result)
    await loadCheckpoints()
    await loadReviewDraft()
  } catch (error) {
    rollbackByPath.value = setReviewRollbackStateForPath(
      rollbackByPath.value,
      filePath,
      {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Rollback failed.',
      },
    )
  }
}

async function onRollbackWorkspace(): Promise<void> {
  if (!canRollback.value) return
  workspaceRollbackState.value = {
    status: 'rollingBack',
    message: 'Saving a checkpoint before restoring all workspace changes...',
  }

  try {
    const result = await rollbackWorkspaceChanges(props.cwd)
    workspaceRollbackState.value = {
      status: 'rolledBack',
      message: workspaceRollbackSuccessMessage(result),
    }
    emit('workspaceRollbackCompleted', result)
    await loadCheckpoints()
    await loadReviewDraft()
  } catch (error) {
    workspaceRollbackState.value = {
      status: 'failed',
      message: error instanceof Error ? error.message : 'Workspace rollback failed.',
    }
  }
}

async function onRollbackHunk(filePath: string, hunkIndex: number): Promise<void> {
  if (!canRollback.value) return
  const didConfirm = window.confirm(`Rollback hunk ${String(hunkIndex + 1)} in ${filePath}? A checkpoint patch will be saved first.`)
  if (!didConfirm) return

  hunkRollbackByKey.value = setReviewHunkRollbackStateForKey(
    hunkRollbackByKey.value,
    filePath,
    hunkIndex,
    { status: 'rollingBack', message: 'Saving checkpoint and reverting hunk...' },
  )

  try {
    const result = await rollbackWorkspaceHunk(props.cwd, filePath, hunkIndex)
    hunkRollbackByKey.value = setReviewHunkRollbackStateForKey(
      hunkRollbackByKey.value,
      filePath,
      hunkIndex,
      {
        status: 'rolledBack',
        message: hunkRollbackSuccessMessage(result),
      },
    )
    emit('hunkRollbackCompleted', result)
    await loadCheckpoints()
    await loadReviewDraft()
  } catch (error) {
    hunkRollbackByKey.value = setReviewHunkRollbackStateForKey(
      hunkRollbackByKey.value,
      filePath,
      hunkIndex,
      {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Hunk rollback failed.',
      },
    )
  }
}

async function onStageHunk(filePath: string, hunkIndex: number): Promise<void> {
  if (!canRollback.value) return
  hunkStageByKey.value = setReviewHunkStageStateForKey(
    hunkStageByKey.value,
    filePath,
    hunkIndex,
    { status: 'staging', message: 'Accepting hunk into the git index...' },
  )

  try {
    const result = await stageWorkspaceHunk(props.cwd, filePath, hunkIndex)
    hunkStageByKey.value = setReviewHunkStageStateForKey(
      hunkStageByKey.value,
      filePath,
      hunkIndex,
      {
        status: 'staged',
        message: `${result.hunkHeader} accepted into the git index.`,
      },
    )
    emit('hunkStageCompleted', result)
    await loadReviewDraft()
  } catch (error) {
    hunkStageByKey.value = setReviewHunkStageStateForKey(
      hunkStageByKey.value,
      filePath,
      hunkIndex,
      {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Hunk stage failed.',
      },
    )
  }
}

async function onToggleCheckpointPatch(checkpointId: string): Promise<void> {
  const current = checkpointPatchState(checkpointId)
  if (current.status === 'loading') return

  if (current.status === 'loaded') {
    checkpointPatchById.value = setReviewCheckpointPatchStateForId(
      checkpointPatchById.value,
      checkpointId,
      toggleLoadedCheckpointPatchVisibility(current),
    )
    return
  }

  checkpointPatchById.value = setReviewCheckpointPatchStateForId(
    checkpointPatchById.value,
    checkpointId,
    loadingCheckpointPatchState(current),
  )

  try {
    const result = await fetchToolingCheckpointPatch(props.cwd, checkpointId)
    checkpointPatchById.value = setReviewCheckpointPatchStateForId(
      checkpointPatchById.value,
      checkpointId,
      loadedCheckpointPatchState(result.patch),
    )
  } catch (error) {
    checkpointPatchById.value = setReviewCheckpointPatchStateForId(
      checkpointPatchById.value,
      checkpointId,
      failedCheckpointPatchState(error instanceof Error ? error.message : 'Failed to load checkpoint patch.'),
    )
  }
}

async function loadCheckpoints(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    checkpoints.value = []
    checkpointError.value = ''
    return
  }

  isLoadingCheckpoints.value = true
  checkpointError.value = ''
  try {
    checkpoints.value = await fetchToolingCheckpoints(cwd, 6)
  } catch (error) {
    checkpoints.value = []
    checkpointError.value = error instanceof Error ? error.message : 'Failed to load checkpoints.'
  } finally {
    isLoadingCheckpoints.value = false
  }
}

watch(
  () => props.cwd,
  () => {
    checkpointPatchById.value = {}
    void loadCheckpoints()
    void loadReviewComments()
    void loadReviewDraft()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.thread-diff-review-panel {
  @apply flex shrink-0 flex-col gap-2 rounded-lg border theme-border theme-bg-panel p-3;
}

.thread-diff-review-header {
  @apply flex items-start justify-between gap-2;
}

.thread-diff-review-heading {
  @apply min-w-0;
}

.thread-diff-review-actions {
  @apply flex shrink-0 flex-wrap justify-end gap-1;
}

.thread-diff-review-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.thread-diff-review-summary {
  @apply m-0 mt-0.5 text-xs theme-muted;
}

.thread-diff-copy-button {
  @apply inline-flex h-7 shrink-0 items-center gap-1 rounded-md border theme-border theme-bg-panel px-2 text-xs font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-70;
}

.thread-diff-rollback-all-button {
  @apply inline-flex h-7 shrink-0 items-center rounded-md border theme-border-danger theme-bg-panel px-2 text-xs font-medium theme-text-danger transition hover:theme-bg-danger-soft disabled:cursor-not-allowed disabled:opacity-70;
}

.thread-diff-copy-icon {
  @apply h-3.5 w-3.5;
}

.thread-diff-workspace-rollback-note {
  @apply m-0 rounded-md border theme-border theme-bg-subtle px-2 py-1.5 text-xs leading-4 theme-muted;
}

.thread-diff-workspace-rollback-note[data-state='rolledBack'] {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
}

.thread-diff-workspace-rollback-note[data-state='failed'] {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.thread-diff-comment-error {
  @apply m-0 rounded-md border theme-border-danger theme-bg-danger-soft px-2 py-1.5 text-xs leading-4 theme-text-danger;
}

.thread-diff-stat-row {
  @apply flex gap-2 text-xs font-semibold;
}

.thread-diff-stat {
  @apply rounded-md border px-2 py-0.5;
}

.thread-diff-stat-added {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
}

.thread-diff-stat-removed {
  @apply theme-border-danger theme-bg-danger-soft theme-text-danger;
}

.thread-diff-empty {
  @apply m-0 rounded-md border border-dashed theme-border px-3 py-2 text-xs theme-muted;
}

.thread-review-draft-section {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-2;
}

.thread-review-draft-header {
  @apply flex items-start justify-between gap-2;
}

.thread-review-draft-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.thread-review-draft-summary {
  @apply m-0 mt-0.5 text-xs leading-4 theme-muted;
}

.thread-review-draft-refresh,
.thread-review-draft-copy {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1 text-xs font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-review-draft-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-2 py-1.5 text-xs leading-4 theme-text-danger;
}

.thread-review-draft {
  @apply mt-2 grid gap-2;
}

.thread-review-draft-warning-list {
  @apply grid gap-1;
}

.thread-review-draft-warning-list p {
  @apply m-0 rounded-md border theme-border-warning theme-bg-warning-soft px-2 py-1.5 text-xs leading-4 theme-text-warning;
}

.thread-review-draft-field {
  @apply grid gap-1 text-xs font-medium theme-muted;
}

.thread-review-draft-field textarea {
  @apply min-h-20 resize-y rounded-md border theme-border theme-bg-panel px-2 py-1.5 font-mono text-[0.68rem] leading-4 theme-text outline-none;
}

.thread-review-draft-grid {
  @apply grid gap-2 md:grid-cols-2;
}

.thread-review-draft-grid section {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1.5;
}

.thread-review-draft-grid h5 {
  @apply m-0 text-xs font-semibold theme-muted;
}

.thread-review-draft-grid ul {
  @apply m-0 mt-1 grid gap-1 pl-4 text-xs leading-4 theme-muted;
}

.thread-review-draft-empty {
  @apply m-0 rounded-md border border-dashed theme-border theme-bg-panel px-2 py-1.5 text-xs theme-muted;
}

.thread-checkpoint-section {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-2;
}

.thread-checkpoint-header {
  @apply flex items-center justify-between gap-2;
}

.thread-checkpoint-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.thread-checkpoint-refresh {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1 text-xs font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-checkpoint-empty {
  @apply m-0 mt-2 rounded-md border border-dashed theme-border px-2 py-1.5 text-xs theme-muted;
}

.thread-checkpoint-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.thread-checkpoint-item {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1.5;
}

.thread-checkpoint-main {
  @apply flex items-start justify-between gap-2;
}

.thread-checkpoint-label {
  @apply min-w-0 break-words text-xs font-semibold theme-text;
}

.thread-checkpoint-time {
  @apply shrink-0 text-[0.68rem] leading-4 theme-muted;
}

.thread-checkpoint-paths,
.thread-checkpoint-meta {
  @apply m-0 mt-1 break-words font-mono text-[0.68rem] leading-4 theme-muted;
}

.thread-checkpoint-actions {
  @apply mt-1 flex justify-end;
}

.thread-checkpoint-patch-button {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1 text-xs font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-checkpoint-patch-error {
  @apply m-0 mt-1 rounded-md border theme-border-danger theme-bg-danger-soft px-2 py-1 text-xs theme-text-danger;
}

.thread-checkpoint-patch {
  @apply mt-2 overflow-hidden rounded-md border theme-border bg-slate-950;
}

.thread-checkpoint-patch pre {
  @apply m-0 max-h-72 overflow-auto p-2 text-[0.68rem] leading-4 text-slate-100;
}

.thread-checkpoint-patch code {
  @apply block min-w-max whitespace-pre font-mono;
}

.thread-checkpoint-patch-empty {
  @apply m-0 px-2 py-1.5 text-xs text-slate-300;
}

.thread-diff-file-list {
  @apply flex max-h-96 flex-col gap-2 overflow-y-auto pr-0.5;
}

.thread-diff-file {
  @apply rounded-md border theme-border theme-bg-subtle;
}

.thread-diff-file-summary {
  @apply grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 px-2 py-2 text-xs;
}

.thread-diff-file-path {
  @apply flex min-w-0 flex-col gap-0.5 font-mono leading-5;
}

.thread-diff-file-name {
  @apply min-w-0 truncate font-semibold theme-text;
}

.thread-diff-file-directory {
  @apply min-w-0 truncate text-[0.68rem] leading-4 theme-muted;
}

.thread-diff-file-old-path {
  @apply col-span-2 min-w-0 break-words font-mono text-[0.68rem] leading-4 theme-muted;
}

.thread-diff-file-status {
  @apply row-start-1 rounded-full border theme-border theme-bg-panel px-2 py-0.5 text-[0.68rem] font-medium uppercase leading-4 theme-muted;
}

.thread-diff-file-lines {
  @apply col-span-2 flex gap-2 font-mono font-semibold;
}

.thread-diff-file-actions {
  @apply flex items-center justify-between gap-2 border-t theme-border px-2 py-2;
}

.thread-diff-rollback-note {
  @apply m-0 min-w-0 flex-1 break-words text-xs leading-4 theme-muted;
}

.thread-diff-rollback-button {
  @apply shrink-0 rounded-md border theme-border-danger theme-bg-panel px-2 py-1 text-xs font-medium theme-text-danger transition hover:theme-bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-diff-file[data-rollback-state='rolledBack'] {
  @apply theme-border-success theme-bg-success-soft;
}

.thread-diff-file[data-rollback-state='failed'] {
  @apply theme-border-danger theme-bg-danger-soft;
}

.thread-diff-line-added {
  @apply theme-text-success;
}

.thread-diff-line-removed {
  @apply theme-text-danger;
}

.thread-diff-hunk-list {
  @apply border-t theme-border;
}

.thread-diff-hunk {
  @apply border-b theme-border last:border-b-0;
}

.thread-diff-hunk[data-hunk-state='rolledBack'] {
  @apply theme-bg-success-soft;
}

.thread-diff-hunk[data-stage-state='staged'] {
  @apply theme-bg-success-soft;
}

.thread-diff-hunk[data-hunk-state='failed'] {
  @apply theme-bg-danger-soft;
}

.thread-diff-hunk[data-stage-state='failed'] {
  @apply theme-bg-danger-soft;
}

.thread-diff-hunk-header {
  @apply flex items-center justify-between gap-2 theme-bg-control px-2 py-1.5 text-[0.68rem] theme-muted;
}

.thread-diff-hunk-header code {
  @apply min-w-0 truncate font-mono;
}

.thread-diff-hunk-lines {
  @apply flex shrink-0 gap-2 font-mono font-semibold;
}

.thread-diff-hunk-rollback-button {
  @apply shrink-0 rounded-md border theme-border-danger theme-bg-panel px-2 py-1 text-[0.68rem] font-medium theme-text-danger transition hover:theme-bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-diff-hunk-stage-button {
  @apply shrink-0 rounded-md border theme-border-success theme-bg-panel px-2 py-1 text-[0.68rem] font-medium theme-text-success transition hover:theme-bg-success-soft disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-diff-hunk-rollback-note {
  @apply m-0 border-t theme-border px-2 py-1 text-[0.68rem] leading-4 theme-muted;
}

.thread-diff-code {
  @apply m-0 max-h-72 overflow-auto theme-bg-panel py-1 text-xs leading-5;
}

.thread-diff-code code {
  @apply block min-w-max font-mono;
}

.thread-diff-code-line {
  @apply grid grid-cols-[3ch_3ch_2ch_minmax(0,1fr)_auto] items-start gap-1 px-2;
}

.thread-diff-code-line[data-kind='add'] {
  @apply theme-bg-success-soft theme-text-success;
}

.thread-diff-code-line[data-kind='remove'] {
  @apply theme-bg-danger-soft theme-text-danger;
}

.thread-diff-code-line[data-kind='meta'] {
  @apply theme-muted;
}

.thread-diff-line-number {
  @apply select-none text-right text-[0.68rem] theme-muted;
}

.thread-diff-line-prefix {
  @apply select-none text-center text-[0.68rem] theme-muted;
}

.thread-diff-line-content {
  @apply whitespace-pre pr-3;
}

.thread-diff-line-comment-button {
  @apply invisible mt-0.5 rounded border theme-border theme-bg-panel px-1.5 py-0.5 text-[0.62rem] font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-50;
}

.thread-diff-code-line:hover .thread-diff-line-comment-button,
.thread-diff-line-comment-button:focus-visible {
  @apply visible;
}

.thread-diff-comment-composer {
  @apply border-t theme-border theme-bg-panel px-2 py-2;
}

.thread-diff-comment-composer p {
  @apply m-0 text-xs font-medium theme-muted;
}

.thread-diff-comment-composer textarea {
  @apply mt-1 min-h-20 w-full resize-y rounded-md border theme-border theme-bg-panel px-2 py-1.5 text-xs leading-5 theme-text outline-none focus:border-slate-400;
}

.thread-diff-comment-composer div,
.thread-diff-comment-list li div {
  @apply mt-1 flex flex-wrap justify-end gap-1.5;
}

.thread-diff-comment-composer button,
.thread-diff-comment-list button {
  @apply rounded-md border theme-border theme-bg-panel px-2 py-1 text-xs font-medium theme-muted transition hover:theme-bg-control disabled:cursor-not-allowed disabled:opacity-60;
}

.thread-diff-comment-list {
  @apply m-0 grid list-none gap-1 border-t theme-border theme-bg-panel px-2 py-2;
}

.thread-diff-comment-list li {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.thread-diff-comment-list li[data-status='follow_up_created'] {
  @apply border-sky-200 bg-sky-50;
}

.thread-diff-comment-list li[data-status='resolved'] {
  @apply theme-border-success theme-bg-success-soft;
}

.thread-diff-comment-list header {
  @apply flex items-center justify-between gap-2;
}

.thread-diff-comment-list header span {
  @apply min-w-0 break-words font-mono text-[0.68rem] font-semibold theme-muted;
}

.thread-diff-comment-list header small {
  @apply shrink-0 text-[0.62rem] uppercase theme-muted;
}

.thread-diff-comment-list p {
  @apply m-0 mt-1 whitespace-pre-wrap break-words text-xs leading-5 theme-muted;
}
</style>
