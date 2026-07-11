<template>
  <div class="directory-picker-backdrop" @click.self="$emit('close')">
    <section class="directory-picker" role="dialog" aria-modal="true" aria-label="Choose project folder">
      <header class="directory-picker-header">
        <h2 class="directory-picker-title">Add project</h2>
        <button class="directory-picker-close" type="button" aria-label="Close" @click="$emit('close')">
          <IconTablerX class="directory-picker-icon" />
        </button>
      </header>

      <form class="directory-picker-path-row" @submit.prevent="loadPath(pathDraft)">
        <button
          class="directory-picker-nav-button"
          type="button"
          :disabled="isLoading || !listing"
          title="Parent folder"
          @click="goParent"
        >
          <IconTablerChevronLeft class="directory-picker-icon" />
        </button>
        <input
          ref="pathInputRef"
          v-model="pathDraft"
          class="directory-picker-path-input"
          type="text"
          spellcheck="false"
          placeholder="/path/to/project"
        />
        <button class="directory-picker-go-button" type="submit" :disabled="isLoading">Go</button>
      </form>

      <p v-if="errorText" class="directory-picker-error">{{ errorText }}</p>

      <div class="directory-picker-list" role="listbox" :aria-busy="isLoading">
        <p v-if="isLoading" class="directory-picker-empty">Loading...</p>
        <p v-else-if="directories.length === 0" class="directory-picker-empty">No folders</p>
        <button
          v-for="directory in directories"
          v-else
          :key="directory.path"
          class="directory-picker-row"
          :class="{ 'is-selected': directory.path === selectedPath }"
          type="button"
          @click="selectedPath = directory.path"
          @dblclick="loadPath(directory.path)"
        >
          <IconTablerFolder class="directory-picker-folder-icon" />
          <span class="directory-picker-row-name">{{ directory.name }}</span>
        </button>
      </div>

      <footer class="directory-picker-footer">
        <p class="directory-picker-selected">{{ selectedPath || listing?.path || '' }}</p>
        <button class="directory-picker-cancel" type="button" @click="$emit('close')">Cancel</button>
        <button class="directory-picker-confirm" type="button" :disabled="!confirmPath" @click="confirm">
          Use folder
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { fetchDirectoryListing } from '../../api/codexBridgeClient'
import type { UiDirectoryEntry, UiDirectoryListing } from '../../types/codex'
import IconTablerChevronLeft from '../icons/IconTablerChevronLeft.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerX from '../icons/IconTablerX.vue'

const props = defineProps<{
  initialPath: string
}>()

const emit = defineEmits<{
  close: []
  select: [path: string]
}>()

const pathInputRef = ref<HTMLInputElement | null>(null)
const listing = ref<UiDirectoryListing | null>(null)
const pathDraft = ref(props.initialPath.trim())
const selectedPath = ref('')
const isLoading = ref(false)
const errorText = ref('')

const directories = computed<UiDirectoryEntry[]>(() => listing.value?.directories ?? [])
const confirmPath = computed(() => selectedPath.value || listing.value?.path || '')

async function loadPath(path: string): Promise<void> {
  isLoading.value = true
  errorText.value = ''
  try {
    const nextListing = await fetchDirectoryListing(path)
    listing.value = nextListing
    pathDraft.value = nextListing.path
    selectedPath.value = nextListing.path
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Failed to read folder'
  } finally {
    isLoading.value = false
  }
}

function goParent(): void {
  const parentPath = listing.value?.parentPath
  if (!parentPath) return
  void loadPath(parentPath)
}

function confirm(): void {
  const path = confirmPath.value.trim()
  if (!path) return
  emit('select', path)
}

onMounted(() => {
  void loadPath(pathDraft.value)
  void nextTick(() => {
    pathInputRef.value?.focus()
    pathInputRef.value?.select()
  })
})
</script>

<style scoped>
@reference "../../style.css";

.directory-picker-backdrop {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4;
}

.directory-picker {
  @apply w-full max-w-160 rounded-xl border theme-border theme-bg-panel shadow-xl;
}

.directory-picker-header {
  @apply flex items-center justify-between border-b theme-border px-4 py-3;
}

.directory-picker-title {
  @apply m-0 text-sm font-semibold theme-text;
}

.directory-picker-close {
  @apply h-7 w-7 rounded-md theme-muted flex items-center justify-center hover:theme-bg-control hover:theme-text;
}

.directory-picker-icon {
  @apply h-4 w-4;
}

.directory-picker-path-row {
  @apply flex items-center gap-2 px-4 py-3;
}

.directory-picker-nav-button {
  @apply h-8 w-8 rounded-md border theme-border theme-muted flex items-center justify-center hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-50;
}

.directory-picker-path-input {
  @apply h-8 min-w-0 flex-1 rounded-md border theme-border px-2 text-sm theme-text outline-none focus:border-zinc-600;
}

.directory-picker-go-button {
  @apply h-8 rounded-md border theme-border px-3 text-sm theme-muted hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-50;
}

.directory-picker-error {
  @apply mx-4 mt-0 mb-3 rounded-md border theme-border-danger theme-bg-danger-soft px-3 py-2 text-sm theme-text-danger;
}

.directory-picker-list {
  @apply mx-4 h-80 overflow-y-auto rounded-lg border theme-border theme-bg-subtle p-1;
}

.directory-picker-empty {
  @apply m-0 px-3 py-2 text-sm theme-muted;
}

.directory-picker-row {
  @apply flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm theme-text hover:theme-bg-panel;
}

.directory-picker-row.is-selected {
  @apply theme-bg-panel shadow-sm;
}

.directory-picker-folder-icon {
  @apply h-4 w-4 shrink-0 theme-muted;
}

.directory-picker-row-name {
  @apply min-w-0 truncate;
}

.directory-picker-footer {
  @apply flex items-center gap-2 border-t theme-border px-4 py-3;
}

.directory-picker-selected {
  @apply m-0 min-w-0 flex-1 truncate text-xs theme-muted;
}

.directory-picker-cancel {
  @apply rounded-md border theme-border px-3 py-1.5 text-sm theme-muted hover:theme-bg-subtle;
}

.directory-picker-confirm {
  @apply rounded-md border theme-border theme-bg-accent px-3 py-1.5 text-sm theme-on-accent hover:theme-bg-accent-hover disabled:cursor-not-allowed disabled:theme-border disabled:theme-bg-disabled disabled:theme-muted;
}
</style>
