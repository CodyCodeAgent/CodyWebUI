<template>
  <form class="thread-composer" @submit.prevent="onSubmit">
    <div
      class="thread-composer-shell"
      :data-drag-active="isDraggingImages"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <ul v-if="attachedImages.length > 0" class="thread-composer-image-list">
        <li v-for="image in attachedImages" :key="image.id" class="thread-composer-image-item">
          <img class="thread-composer-image-preview" :src="image.url" :alt="image.name" />
          <button
            class="thread-composer-image-remove"
            type="button"
            aria-label="Remove image"
            :disabled="disabled"
            @click="removeImage(image.id)"
          >
            <IconTablerX class="thread-composer-image-remove-icon" />
          </button>
        </li>
      </ul>

      <ul v-if="selectedSkills.length > 0" class="thread-composer-skill-list">
        <li v-for="skill in selectedSkills" :key="`${skill.name}:${skill.path}`" class="thread-composer-skill-item">
          <span class="thread-composer-skill-name">${{ skill.displayName }}</span>
          <button
            class="thread-composer-skill-remove"
            type="button"
            aria-label="Remove skill"
            :disabled="disabled"
            @click="removeSkill(skill)"
          >
            <IconTablerX class="thread-composer-skill-remove-icon" />
          </button>
        </li>
      </ul>

      <textarea
        ref="draftInputRef"
        v-model="draft"
        class="thread-composer-input"
        rows="1"
        :placeholder="placeholderText"
        :disabled="disabled || !activeThreadId"
        @input="onDraftInput"
        @click="onDraftCursorChange"
        @keyup="onDraftCursorChange"
        @paste="onPaste"
        @keydown="onDraftKeydown"
      />

      <div v-if="isSkillMenuOpen" class="thread-composer-skill-menu">
        <p v-if="isLoadingSkills" class="thread-composer-skill-status">Loading skills...</p>
        <p v-else-if="skillError" class="thread-composer-skill-status thread-composer-skill-status-error">
          {{ skillError }}
        </p>
        <p v-else-if="filteredSkills.length === 0" class="thread-composer-skill-status">No matching skills</p>
        <template v-else>
          <button
            v-for="skill in filteredSkills"
            :key="`${skill.name}:${skill.path}`"
            class="thread-composer-skill-option"
            type="button"
            @mousedown.prevent="onSelectSkill(skill)"
          >
            <span class="thread-composer-skill-option-name">${{ skill.displayName }}</span>
            <span v-if="skill.description" class="thread-composer-skill-option-description">
              {{ skill.description }}
            </span>
          </button>
        </template>
      </div>

      <div class="thread-composer-controls">
        <input
          ref="fileInputRef"
          class="thread-composer-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          @change="onFileInputChange"
        />

        <button
          class="thread-composer-attach"
          type="button"
          aria-label="Attach images"
          title="Attach images"
          :disabled="disabled || !activeThreadId || isUploadingImage"
          @click="openFilePicker"
        >
          <IconTablerPhoto class="thread-composer-attach-icon" />
        </button>

        <ComposerDropdown
          class="thread-composer-control"
          :model-value="selectedModel"
          :options="modelOptions"
          placeholder="Model"
          open-direction="up"
          :disabled="disabled || !activeThreadId || models.length === 0 || isTurnInProgress"
          @update:model-value="onModelSelect"
        />

        <ComposerDropdown
          class="thread-composer-control"
          :model-value="selectedReasoningEffort"
          :options="reasoningOptions"
          placeholder="Thinking"
          open-direction="up"
          :disabled="disabled || !activeThreadId || isTurnInProgress"
          @update:model-value="onReasoningEffortSelect"
        />

        <span v-if="isUploadingImage" class="thread-composer-uploading">Uploading...</span>
        <span v-else-if="uploadError" class="thread-composer-upload-error">{{ uploadError }}</span>

        <button
          v-if="isTurnInProgress"
          class="thread-composer-stop"
          type="button"
          aria-label="Стоп"
          :disabled="disabled || !activeThreadId || isInterruptingTurn"
          @click="onInterrupt"
        >
          <IconTablerPlayerStopFilled class="thread-composer-stop-icon" />
        </button>
        <button
          class="thread-composer-submit"
          type="submit"
          :aria-label="isTurnInProgress ? 'Steer current response with Control Enter' : 'Send message with Control Enter'"
          :title="isTurnInProgress ? 'Steer with Control Enter' : 'Send with Control Enter'"
          :disabled="!canSubmit"
        >
          <IconTablerArrowUp class="thread-composer-submit-icon" />
        </button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { hasImageFile, useComposerImages } from '../../composables/useComposerImages'
import { useComposerSkills } from '../../composables/useComposerSkills'
import type { ReasoningEffort, UiComposerSkill, UiComposerSubmitPayload } from '../../types/codex'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerPhoto from '../icons/IconTablerPhoto.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import ComposerDropdown from './ComposerDropdown.vue'

const props = defineProps<{
  activeThreadId: string
  models: string[]
  selectedModel: string
  selectedReasoningEffort: ReasoningEffort | ''
  cwd: string
  isTurnInProgress?: boolean
  isInterruptingTurn?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: UiComposerSubmitPayload]
  interrupt: []
  'update:selected-model': [modelId: string]
  'update:selected-reasoning-effort': [effort: ReasoningEffort | '']
}>()

const draft = ref('')
const draftInputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const dragDepth = ref(0)
const {
  attachedImages,
  isUploadingImage,
  uploadError,
  attachFiles,
  removeImage,
  resetImages,
} = useComposerImages()
const {
  selectedSkills,
  filteredSkills,
  isSkillMenuOpen,
  isLoadingSkills,
  skillError,
  updateSkillTrigger,
  selectSkill,
  removeSkill,
  closeSkillMenu,
  resetSkills,
} = useComposerSkills()
const reasoningOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
]
const modelOptions = computed(() =>
  props.models.map((modelId) => ({ value: modelId, label: modelId })),
)

const canSubmit = computed(() => {
  if (props.disabled) return false
  if (!props.activeThreadId) return false
  if (isUploadingImage.value) return false
  return draft.value.trim().length > 0 || attachedImages.value.length > 0 || selectedSkills.value.length > 0
})

const placeholderText = computed(() =>
  props.activeThreadId
    ? props.isTurnInProgress
      ? 'Guide the current response...'
      : 'Type a message...'
    : 'Select a thread to send a message',
)
const canAttachImages = computed(() => !props.disabled && Boolean(props.activeThreadId))
const isDraggingImages = computed(() => canAttachImages.value && dragDepth.value > 0)

function onSubmit(): void {
  const text = draft.value.trim()
  if (!canSubmit.value) return
  emit('submit', {
    text,
    images: attachedImages.value,
    skills: selectedSkills.value,
  })
  draft.value = ''
  resetImages()
  resetSkills()
  void nextTick(resizeDraftInput)
}

function getDraftCursor(): number {
  return draftInputRef.value?.selectionStart ?? draft.value.length
}

function onDraftInput(): void {
  resizeDraftInput()
  void updateSkillTrigger(draft.value, getDraftCursor(), props.cwd)
}

function onDraftCursorChange(): void {
  void updateSkillTrigger(draft.value, getDraftCursor(), props.cwd)
}

function onDraftKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isSkillMenuOpen.value) {
    closeSkillMenu()
    return
  }

  if (event.key !== 'Enter') return
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  onSubmit()
}

function onSelectSkill(skill: UiComposerSkill): void {
  const selected = selectSkill(skill, draft.value)
  draft.value = selected.text
  void nextTick(() => {
    const input = draftInputRef.value
    if (!input) return
    input.focus()
    input.setSelectionRange(selected.cursor, selected.cursor)
    resizeDraftInput()
  })
}

function onInterrupt(): void {
  emit('interrupt')
}

function onModelSelect(value: string): void {
  emit('update:selected-model', value)
}

function onReasoningEffortSelect(value: string): void {
  emit('update:selected-reasoning-effort', value as ReasoningEffort)
}

function openFilePicker(): void {
  fileInputRef.value?.click()
}

function resizeDraftInput(): void {
  const input = draftInputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${String(Math.min(input.scrollHeight, 140))}px`
}

function onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files) {
    void attachFiles(input.files)
  }
  input.value = ''
}

function onPaste(event: ClipboardEvent): void {
  const files = event.clipboardData?.files
  if (!files || files.length === 0) return

  if (!hasImageFile(event.clipboardData?.items)) return

  event.preventDefault()
  void attachFiles(files)
}

function onDragEnter(event: DragEvent): void {
  if (!canAttachImages.value || !hasImageFile(event.dataTransfer?.items)) return
  event.preventDefault()
  dragDepth.value += 1
}

function onDragOver(event: DragEvent): void {
  if (!canAttachImages.value || !hasImageFile(event.dataTransfer?.items)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDragLeave(event: DragEvent): void {
  if (!canAttachImages.value || dragDepth.value === 0) return
  event.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent): void {
  if (!canAttachImages.value || !event.dataTransfer?.files.length) return
  event.preventDefault()
  dragDepth.value = 0
  void attachFiles(event.dataTransfer.files)
}

watch(
  () => props.activeThreadId,
  () => {
    draft.value = ''
    resetImages()
    resetSkills()
    dragDepth.value = 0
    void nextTick(resizeDraftInput)
  },
)

watch(
  () => props.cwd,
  () => {
    resetSkills()
  },
)
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer {
  @apply w-full max-w-175 mx-auto px-6;
}

.thread-composer-shell {
  @apply rounded-2xl border border-zinc-300 bg-white p-3 shadow-sm transition;
}

.thread-composer-shell[data-drag-active='true'] {
  @apply border-zinc-700 bg-zinc-50 ring-2 ring-zinc-300;
}

.thread-composer-image-list {
  @apply mb-2 flex gap-2 overflow-x-auto pb-1;
}

.thread-composer-image-item {
  @apply relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50;
}

.thread-composer-image-preview {
  @apply h-full w-full object-cover;
}

.thread-composer-image-remove {
  @apply absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-zinc-900/75 text-white transition hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-50;
}

.thread-composer-image-remove-icon {
  @apply h-3.5 w-3.5;
}

.thread-composer-skill-list {
  @apply mb-2 flex flex-wrap gap-2;
}

.thread-composer-skill-item {
  @apply flex max-w-full items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800;
}

.thread-composer-skill-name {
  @apply min-w-0 truncate font-mono;
}

.thread-composer-skill-remove {
  @apply flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50;
}

.thread-composer-skill-remove-icon {
  @apply h-3 w-3;
}

.thread-composer-input {
  @apply block w-full min-w-0 max-h-35 min-h-11 resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-1 py-3 text-sm leading-5 text-zinc-900 outline-none transition;
}

.thread-composer-input:focus {
  @apply ring-0;
}

.thread-composer-input:disabled {
  @apply bg-zinc-100 text-zinc-500 cursor-not-allowed;
}

.thread-composer-skill-menu {
  @apply mb-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg;
}

.thread-composer-skill-status {
  @apply m-0 px-3 py-2 text-xs text-slate-500;
}

.thread-composer-skill-status-error {
  @apply text-rose-600;
}

.thread-composer-skill-option {
  @apply flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition hover:bg-slate-100;
}

.thread-composer-skill-option-name {
  @apply text-sm font-medium text-slate-900;
}

.thread-composer-skill-option-description {
  @apply line-clamp-2 text-xs leading-4 text-slate-500;
}

.thread-composer-controls {
  @apply mt-3 flex items-center gap-4;
}

.thread-composer-file-input {
  @apply hidden;
}

.thread-composer-attach {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400;
}

.thread-composer-attach-icon {
  @apply h-4.5 w-4.5;
}

.thread-composer-control {
  @apply shrink-0;
}

.thread-composer-uploading {
  @apply text-xs text-zinc-500;
}

.thread-composer-upload-error {
  @apply min-w-0 flex-1 truncate text-xs text-rose-600;
}

.thread-composer-submit {
  @apply ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-submit-icon {
  @apply h-5 w-5;
}

.thread-composer-stop {
  @apply ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-stop-icon {
  @apply h-5 w-5;
}
</style>
