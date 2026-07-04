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
import { fetchDirectoryListing } from '../../api/codexRpcClient'
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
@reference "tailwindcss";

.directory-picker-backdrop {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4;
}

.directory-picker {
  @apply w-full max-w-160 rounded-xl border border-zinc-200 bg-white shadow-xl;
}

.directory-picker-header {
  @apply flex items-center justify-between border-b border-zinc-100 px-4 py-3;
}

.directory-picker-title {
  @apply m-0 text-sm font-semibold text-zinc-900;
}

.directory-picker-close {
  @apply h-7 w-7 rounded-md text-zinc-500 flex items-center justify-center hover:bg-zinc-100 hover:text-zinc-900;
}

.directory-picker-icon {
  @apply h-4 w-4;
}

.directory-picker-path-row {
  @apply flex items-center gap-2 px-4 py-3;
}

.directory-picker-nav-button {
  @apply h-8 w-8 rounded-md border border-zinc-200 text-zinc-600 flex items-center justify-center hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.directory-picker-path-input {
  @apply h-8 min-w-0 flex-1 rounded-md border border-zinc-300 px-2 text-sm text-zinc-900 outline-none focus:border-zinc-600;
}

.directory-picker-go-button {
  @apply h-8 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.directory-picker-error {
  @apply mx-4 mt-0 mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.directory-picker-list {
  @apply mx-4 h-80 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-1;
}

.directory-picker-empty {
  @apply m-0 px-3 py-2 text-sm text-zinc-500;
}

.directory-picker-row {
  @apply flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-white;
}

.directory-picker-row.is-selected {
  @apply bg-white shadow-sm;
}

.directory-picker-folder-icon {
  @apply h-4 w-4 shrink-0 text-zinc-500;
}

.directory-picker-row-name {
  @apply min-w-0 truncate;
}

.directory-picker-footer {
  @apply flex items-center gap-2 border-t border-zinc-100 px-4 py-3;
}

.directory-picker-selected {
  @apply m-0 min-w-0 flex-1 truncate text-xs text-zinc-500;
}

.directory-picker-cancel {
  @apply rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50;
}

.directory-picker-confirm {
  @apply rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-black disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-200 disabled:text-zinc-500;
}
</style>
