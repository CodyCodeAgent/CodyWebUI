<template>
  <div class="new-thread-modal-backdrop" @click.self="$emit('close')">
    <section class="new-thread-modal" role="dialog" aria-modal="true" aria-label="New thread">
      <header class="new-thread-modal-header">
        <h2 class="new-thread-modal-title">New thread</h2>
        <button class="new-thread-modal-close" type="button" aria-label="Close" @click="$emit('close')">
          <IconTablerX class="new-thread-modal-icon" />
        </button>
      </header>

      <div class="new-thread-modal-body">
        <label class="new-thread-modal-field">
          <span class="new-thread-modal-label">Project</span>
          <select v-model="selectedCwd" class="new-thread-modal-select" @change="onProjectSelect">
            <option v-for="project in projectOptions" :key="project.cwd" :value="project.cwd">
              {{ project.label }} ({{ project.cwd }})
            </option>
          </select>
        </label>

        <button class="new-thread-modal-add-project" type="button" @click="isDirectoryPickerOpen = true">
          <IconTablerFolder class="new-thread-modal-icon" />
          Add project
        </button>

        <label class="new-thread-modal-field">
          <span class="new-thread-modal-label">Project name</span>
          <input
            v-model="projectName"
            class="new-thread-modal-input"
            type="text"
            placeholder="Display name"
          />
        </label>

        <label class="new-thread-modal-field">
          <span class="new-thread-modal-label">Thread name</span>
          <input
            ref="threadNameInputRef"
            v-model="threadName"
            class="new-thread-modal-input"
            type="text"
            placeholder="Optional"
            @keydown.enter.prevent="confirm"
          />
        </label>
      </div>

      <footer class="new-thread-modal-footer">
        <p class="new-thread-modal-cwd">{{ selectedCwd }}</p>
        <button class="new-thread-modal-cancel" type="button" @click="$emit('close')">Cancel</button>
        <button class="new-thread-modal-confirm" type="button" :disabled="!selectedCwd" @click="confirm">
          Create
        </button>
      </footer>
    </section>

    <DirectoryPickerModal
      v-if="isDirectoryPickerOpen"
      :initial-path="selectedCwd"
      @close="isDirectoryPickerOpen = false"
      @select="onDirectorySelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import DirectoryPickerModal from './DirectoryPickerModal.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerX from '../icons/IconTablerX.vue'

export type NewThreadProjectOption = {
  cwd: string
  label: string
}

const props = defineProps<{
  projects: NewThreadProjectOption[]
  initialCwd: string
}>()

const emit = defineEmits<{
  close: []
  create: [payload: { cwd: string; projectName: string; threadName: string }]
}>()

const threadNameInputRef = ref<HTMLInputElement | null>(null)
const customProject = ref<NewThreadProjectOption | null>(null)
const selectedCwd = ref(props.initialCwd.trim())
const projectName = ref('')
const threadName = ref('')
const isDirectoryPickerOpen = ref(false)

const projectOptions = computed(() => {
  const byCwd = new Map<string, NewThreadProjectOption>()
  if (customProject.value) {
    byCwd.set(customProject.value.cwd, customProject.value)
  }
  for (const project of props.projects) {
    byCwd.set(project.cwd, project)
  }
  return Array.from(byCwd.values())
})

watch(
  () => props.initialCwd,
  (cwd) => {
    const normalizedCwd = cwd.trim()
    if (!selectedCwd.value) {
      selectedCwd.value = normalizedCwd
      ensureCustomProject(normalizedCwd)
      syncProjectName()
    }
  },
)

watch(
  projectOptions,
  (options) => {
    if (!selectedCwd.value && options[0]) {
      selectedCwd.value = options[0].cwd
    }
    syncProjectName()
  },
  { immediate: true },
)

function basenameFromPath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) ?? value
}

function ensureCustomProject(cwd: string): void {
  if (!cwd) return
  if (props.projects.some((project) => project.cwd === cwd)) return
  customProject.value = {
    cwd,
    label: basenameFromPath(cwd),
  }
}

function syncProjectName(): void {
  const selected = projectOptions.value.find((project) => project.cwd === selectedCwd.value)
  projectName.value = selected?.label || basenameFromPath(selectedCwd.value)
}

function onProjectSelect(): void {
  syncProjectName()
}

function onDirectorySelect(path: string): void {
  const cwd = path.trim()
  if (!cwd) return

  customProject.value = {
    cwd,
    label: basenameFromPath(cwd),
  }
  selectedCwd.value = cwd
  projectName.value = customProject.value.label
  isDirectoryPickerOpen.value = false
}

function confirm(): void {
  const cwd = selectedCwd.value.trim()
  if (!cwd) return
  emit('create', {
    cwd,
    projectName: projectName.value.trim(),
    threadName: threadName.value.trim(),
  })
}

onMounted(() => {
  ensureCustomProject(selectedCwd.value)
  syncProjectName()
  void nextTick(() => {
    threadNameInputRef.value?.focus()
  })
})
</script>

<style scoped>
@reference "../../style.css";

.new-thread-modal-backdrop {
  @apply fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4;
}

.new-thread-modal {
  @apply w-full max-w-130 rounded-xl border theme-border theme-bg-panel shadow-xl;
}

.new-thread-modal-header {
  @apply flex items-center justify-between border-b theme-border px-4 py-3;
}

.new-thread-modal-title {
  @apply m-0 text-sm font-semibold theme-text;
}

.new-thread-modal-close {
  @apply h-7 w-7 rounded-md theme-muted flex items-center justify-center hover:theme-bg-control hover:theme-text;
}

.new-thread-modal-icon {
  @apply h-4 w-4;
}

.new-thread-modal-body {
  @apply flex flex-col gap-3 px-4 py-4;
}

.new-thread-modal-field {
  @apply flex flex-col gap-1.5;
}

.new-thread-modal-label {
  @apply text-xs font-medium theme-muted;
}

.new-thread-modal-select,
.new-thread-modal-input {
  @apply h-9 w-full min-w-0 rounded-md border theme-border theme-bg-panel px-2 text-sm theme-text outline-none focus:border-zinc-600;
}

.new-thread-modal-add-project {
  @apply inline-flex h-8 w-fit items-center gap-2 rounded-md border theme-border theme-bg-panel px-3 text-sm theme-muted hover:theme-bg-subtle;
}

.new-thread-modal-footer {
  @apply flex items-center gap-2 border-t theme-border px-4 py-3;
}

.new-thread-modal-cwd {
  @apply m-0 min-w-0 flex-1 truncate text-xs theme-muted;
}

.new-thread-modal-cancel {
  @apply rounded-md border theme-border px-3 py-1.5 text-sm theme-muted hover:theme-bg-subtle;
}

.new-thread-modal-confirm {
  @apply rounded-md border theme-border theme-bg-accent px-3 py-1.5 text-sm theme-on-accent hover:theme-bg-accent-hover disabled:cursor-not-allowed disabled:theme-border disabled:theme-bg-disabled disabled:theme-muted;
}
</style>
