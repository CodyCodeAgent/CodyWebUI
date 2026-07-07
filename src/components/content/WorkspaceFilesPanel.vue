<template>
  <section class="workspace-files-panel" aria-label="Workspace files">
    <header class="workspace-files-header">
      <div class="workspace-files-heading">
        <h3 class="workspace-files-title">Files</h3>
        <p class="workspace-files-path">{{ listing?.path || 'workspace root' }}</p>
      </div>
      <div class="workspace-files-actions">
        <button
          class="workspace-files-button"
          type="button"
          :disabled="!canGoUp || isLoadingList"
          @click="goUp"
        >
          Up
        </button>
        <button
          class="workspace-files-button"
          type="button"
          :disabled="!cwd || isLoadingList"
          @click="loadList(currentPath)"
        >
          {{ isLoadingList ? 'Loading' : 'Refresh' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="workspace-files-error">{{ errorMessage }}</p>

    <div class="workspace-files-body">
      <section class="workspace-files-browser" aria-label="Workspace file tree">
        <p v-if="!cwd" class="workspace-files-empty">Choose a workspace to browse files.</p>
        <p v-else-if="entries.length === 0 && !isLoadingList" class="workspace-files-empty">No files in this directory.</p>
        <ol v-else class="workspace-files-list">
          <li v-for="entry in entries" :key="`${entry.kind}:${entry.path}`">
            <button
              class="workspace-files-entry"
              type="button"
              :data-kind="entry.kind"
              :data-selected="selectedFile?.path === entry.path"
              @click="onSelectEntry(entry)"
            >
              <IconTablerFolder v-if="entry.kind === 'directory'" class="workspace-files-entry-icon" />
              <IconTablerFilePencil v-else class="workspace-files-entry-icon" />
              <span class="workspace-files-entry-name">{{ entry.name }}</span>
              <span class="workspace-files-entry-meta">{{ entry.kind === 'file' ? formatBytes(entry.sizeBytes) : '' }}</span>
            </button>
          </li>
        </ol>
        <p v-if="listing?.truncated" class="workspace-files-truncated">Directory truncated to the first entries.</p>
      </section>

      <section class="workspace-file-viewer" aria-label="File preview">
        <template v-if="isLoadingFile">
          <p class="workspace-files-empty">Loading file...</p>
        </template>
        <template v-else-if="selectedFile">
          <header class="workspace-file-viewer-header">
            <div class="workspace-file-viewer-heading">
              <h4 class="workspace-file-viewer-title">{{ selectedFile.name }}</h4>
              <p class="workspace-file-viewer-meta">
                {{ selectedFile.path }} · {{ formatBytes(selectedFile.sizeBytes) }}
              </p>
            </div>
            <div class="workspace-file-editor-actions">
              <button
                v-if="!isEditing"
                class="workspace-files-button"
                type="button"
                :disabled="!canEditSelectedFile"
                @click="startEditing"
              >
                Edit
              </button>
              <template v-else>
                <button
                  class="workspace-files-button"
                  type="button"
                  :disabled="isSavingFile"
                  @click="resetEditor"
                >
                  Reset
                </button>
                <button
                  class="workspace-files-button workspace-files-button-primary"
                  type="button"
                  :disabled="isSavingFile"
                  @click="saveEditor"
                >
                  {{ isSavingFile ? 'Saving' : 'Save' }}
                </button>
              </template>
            </div>
          </header>
          <p v-if="saveMessage" class="workspace-files-save-message">{{ saveMessage }}</p>
          <p v-if="selectedFile.isBinary" class="workspace-files-empty">Binary file preview is not available.</p>
          <p v-else-if="selectedFile.truncated" class="workspace-files-warning">Preview truncated to 512 KiB.</p>
          <WorkspaceMonacoEditor
            v-if="!selectedFile.isBinary"
            v-model="editorContent"
            class="workspace-file-monaco"
            :path="selectedFile.path"
            :read-only="!isEditing"
          />
        </template>
        <template v-else>
          <p class="workspace-files-empty">Select a file to preview it here.</p>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { fetchWorkspaceFile, fetchWorkspaceFiles, saveWorkspaceFile } from '../../api/codexWorkspaceResourcesClient'
import type { UiWorkspaceFileContent, UiWorkspaceFileEntry, UiWorkspaceFileList } from '../../types/codex'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'

const WorkspaceMonacoEditor = defineAsyncComponent(() => import('./WorkspaceMonacoEditor.vue'))

const props = defineProps<{
  cwd: string
}>()

const listing = ref<UiWorkspaceFileList | null>(null)
const selectedFile = ref<UiWorkspaceFileContent | null>(null)
const isLoadingList = ref(false)
const isLoadingFile = ref(false)
const isSavingFile = ref(false)
const isEditing = ref(false)
const editorContent = ref('')
const saveMessage = ref('')
const errorMessage = ref('')

const currentPath = computed(() => listing.value?.path ?? '')
const canGoUp = computed(() => Boolean(listing.value?.path))
const entries = computed(() => listing.value?.entries ?? [])
const canEditSelectedFile = computed(() =>
  Boolean(selectedFile.value && !selectedFile.value.isBinary && !selectedFile.value.truncated),
)

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${String(value)} B`
  const kib = value / 1024
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`
  const mib = kib / 1024
  return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`
}

async function loadList(path = ''): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    listing.value = null
    selectedFile.value = null
    errorMessage.value = ''
    return
  }

  isLoadingList.value = true
  errorMessage.value = ''
  try {
    listing.value = await fetchWorkspaceFiles(cwd, path)
  } catch (error) {
    listing.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load workspace files.'
  } finally {
    isLoadingList.value = false
  }
}

async function loadFile(path: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd || !path) return

  isLoadingFile.value = true
  errorMessage.value = ''
  try {
    selectedFile.value = await fetchWorkspaceFile(cwd, path)
    isEditing.value = false
    editorContent.value = selectedFile.value.content
    saveMessage.value = ''
  } catch (error) {
    selectedFile.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load workspace file.'
  } finally {
    isLoadingFile.value = false
  }
}

function onSelectEntry(entry: UiWorkspaceFileEntry): void {
  if (entry.kind === 'directory') {
    selectedFile.value = null
    isEditing.value = false
    saveMessage.value = ''
    void loadList(entry.path)
    return
  }

  void loadFile(entry.path)
}

function goUp(): void {
  const parentPath = listing.value?.parentPath ?? ''
  selectedFile.value = null
  isEditing.value = false
  saveMessage.value = ''
  void loadList(parentPath)
}

function startEditing(): void {
  if (!selectedFile.value || !canEditSelectedFile.value) return
  editorContent.value = selectedFile.value.content
  saveMessage.value = ''
  isEditing.value = true
}

function resetEditor(): void {
  editorContent.value = selectedFile.value?.content ?? ''
  saveMessage.value = ''
}

async function saveEditor(): Promise<void> {
  const file = selectedFile.value
  const cwd = props.cwd.trim()
  if (!cwd || !file || !canEditSelectedFile.value) return

  isSavingFile.value = true
  errorMessage.value = ''
  saveMessage.value = ''
  try {
    const result = await saveWorkspaceFile(cwd, file.path, editorContent.value)
    selectedFile.value = result.file
    editorContent.value = result.file.content
    isEditing.value = false
    saveMessage.value = `Saved with checkpoint ${result.checkpoint.id}.`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save workspace file.'
  } finally {
    isSavingFile.value = false
  }
}

watch(
  () => props.cwd,
  () => {
    void loadList('')
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-files-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-files-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-files-heading {
  @apply min-w-0;
}

.workspace-files-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-files-path {
  @apply m-0 mt-0.5 truncate font-mono text-xs text-zinc-500;
}

.workspace-files-actions {
  @apply flex shrink-0 gap-1.5;
}

.workspace-files-button {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-files-button-primary {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700;
}

.workspace-files-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-files-save-message {
  @apply m-2 mb-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700;
}

.workspace-files-body {
  @apply mt-3 grid min-h-0 grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] gap-3;
}

.workspace-files-browser,
.workspace-file-viewer {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50;
}

.workspace-files-browser {
  @apply max-h-96 overflow-y-auto p-1.5;
}

.workspace-files-list {
  @apply m-0 grid list-none gap-1 p-0;
}

.workspace-files-entry {
  @apply grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-zinc-100;
}

.workspace-files-entry[data-selected='true'] {
  @apply bg-zinc-200;
}

.workspace-files-entry-icon {
  @apply h-3.5 w-3.5 text-zinc-500;
}

.workspace-files-entry-name {
  @apply truncate font-medium text-zinc-900;
}

.workspace-files-entry-meta {
  @apply shrink-0 font-mono text-[0.68rem] text-zinc-500;
}

.workspace-files-truncated,
.workspace-files-warning,
.workspace-files-empty {
  @apply m-0 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}

.workspace-files-truncated {
  @apply mt-2;
}

.workspace-files-warning {
  @apply mx-2 mt-2 border-amber-200 bg-amber-50 text-amber-800;
}

.workspace-file-viewer {
  @apply flex max-h-96 min-h-64 flex-col overflow-hidden;
}

.workspace-file-viewer-header {
  @apply flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-3 py-2;
}

.workspace-file-viewer-heading {
  @apply min-w-0;
}

.workspace-file-editor-actions {
  @apply flex shrink-0 gap-1.5;
}

.workspace-file-viewer-title {
  @apply m-0 truncate text-xs font-semibold text-zinc-900;
}

.workspace-file-viewer-meta {
  @apply m-0 mt-0.5 truncate font-mono text-[0.68rem] text-zinc-500;
}

.workspace-file-code {
  @apply m-0 flex-1 overflow-auto bg-white p-3 text-xs leading-5 text-zinc-900;
}

.workspace-file-code code {
  @apply block min-w-max whitespace-pre font-mono;
}

.workspace-file-editor {
  @apply min-h-0 flex-1 resize-none border-0 bg-white p-3 font-mono text-xs leading-5 text-zinc-900 outline-none;
  tab-size: 2;
}

.workspace-file-monaco {
  @apply min-h-0 flex-1;
}

@media (max-width: 920px) {
  .workspace-files-body {
    @apply grid-cols-1;
  }
}
</style>
