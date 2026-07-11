<template>
  <Teleport to="body">
    <div v-if="open" class="prompt-library-layer" @click.self="emit('close')">
      <aside class="prompt-library" role="dialog" aria-modal="true" aria-label="Prompt library" :data-editing="isEditing">
        <header class="prompt-library-header">
          <div>
            <span class="prompt-library-eyebrow">Prompt library</span>
            <h2>Reusable briefs</h2>
            <p>Choose a prompt to place it in the composer. Nothing sends automatically.</p>
          </div>
          <button class="prompt-library-close" type="button" aria-label="Close prompt library" @click="emit('close')">
            <IconTablerX />
          </button>
        </header>

        <div v-if="!isEditing" class="prompt-library-toolbar">
          <label class="prompt-library-search">
            <IconTablerSearch />
            <input v-model="query" type="search" placeholder="Search prompts" autofocus />
          </label>
          <button class="prompt-library-new" type="button" @click="startCreate">+ New prompt</button>
        </div>

        <template v-if="isEditing">
          <form class="prompt-library-editor" @submit.prevent="saveEditor">
            <div class="prompt-library-editor-heading">
              <div><span>{{ editor.id ? 'Edit prompt' : 'New prompt' }}</span><h3>Shape the reusable brief</h3></div>
              <button type="button" @click="cancelEditor">Cancel</button>
            </div>
            <label>Title<input v-model="editor.title" required maxlength="80" placeholder="Review the API migration" /></label>
            <label>Description<input v-model="editor.description" maxlength="160" placeholder="What this prompt helps accomplish" /></label>
            <div class="prompt-library-editor-grid">
              <label>Category<input v-model="editor.category" maxlength="32" placeholder="Review" /></label>
              <label>Availability
                <select v-model="editor.scope">
                  <option value="global">All workspaces</option>
                  <option value="workspace" :disabled="!cwd.trim()">Current workspace</option>
                </select>
              </label>
            </div>
            <label>Prompt<textarea v-model="editor.content" required rows="12" placeholder="Write the complete reusable prompt…" /></label>
            <p v-if="editorError" class="prompt-library-error">{{ editorError }}</p>
            <div class="prompt-library-editor-actions">
              <button v-if="editor.id && !editor.id.startsWith('builtin-')" class="prompt-library-delete" type="button" @click="deleteEditor">Delete</button>
              <button class="prompt-library-save" type="submit" :disabled="isSaving">{{ isSaving ? 'Saving…' : 'Save prompt' }}</button>
            </div>
          </form>
        </template>

        <template v-else>
          <nav class="prompt-library-categories" aria-label="Prompt categories">
            <button v-for="item in categories" :key="item" type="button" :data-active="category === item" @click="category = item">{{ item }}</button>
          </nav>

          <div v-if="isLoading" class="prompt-library-empty">Loading your prompt library…</div>
          <div v-else-if="filteredTemplates.length === 0" class="prompt-library-empty">
            <strong>No prompts found</strong>
            <span>Try another search or create a reusable brief.</span>
          </div>
          <ol v-else class="prompt-library-list">
            <li v-for="template in filteredTemplates" :key="template.id" class="prompt-library-card">
              <button class="prompt-library-card-main" type="button" @click="useTemplate(template, 'insert')">
                <span class="prompt-library-card-meta"><b>{{ template.category }}</b><i>{{ template.scope === 'workspace' ? 'This workspace' : 'Global' }}</i></span>
                <strong>{{ template.title }}</strong>
                <span>{{ template.description || template.content }}</span>
              </button>
              <div class="prompt-library-card-actions">
                <button type="button" :aria-label="template.isFavorite ? 'Remove favorite' : 'Add favorite'" :title="template.isFavorite ? 'Remove favorite' : 'Add favorite'" @click="toggleFavorite(template)">{{ template.isFavorite ? '★' : '☆' }}</button>
                <button type="button" title="Replace current draft" @click="useTemplate(template, 'replace')">Replace</button>
                <button type="button" title="Edit prompt" @click="startEdit(template)"><IconTablerFilePencil /></button>
              </div>
            </li>
          </ol>
          <footer class="prompt-library-footer"><span>{{ filteredTemplates.length }} prompts</span><span>Click a card to insert at the cursor</span></footer>
        </template>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { fetchUserSetting, writeUserSetting } from '../../api/codexSettingsClient'
import { DESKTOP_SETTING_KEYS } from '../../composables/desktopSettingsKeys'
import {
  normalizePromptTemplates,
  visiblePromptTemplates,
  type PromptInsertion,
  type PromptTemplate,
  type PromptTemplateScope,
} from '../../composables/promptLibraryRules'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerSearch from '../icons/IconTablerSearch.vue'
import IconTablerX from '../icons/IconTablerX.vue'

const props = defineProps<{ open: boolean; cwd: string }>()
const emit = defineEmits<{ close: []; insert: [insertion: PromptInsertion] }>()

const templates = ref<PromptTemplate[]>([])
const query = ref('')
const category = ref('All')
const isLoading = ref(false)
const isSaving = ref(false)
const isEditing = ref(false)
const editorError = ref('')
const editor = reactive({ id: '', title: '', description: '', category: 'General', content: '', scope: 'global' as PromptTemplateScope })
let insertionId = 0

const filteredTemplates = computed(() => visiblePromptTemplates(templates.value, props.cwd, query.value, category.value))
const categories = computed(() => ['All', ...new Set(visiblePromptTemplates(templates.value, props.cwd, '').map((template) => template.category))])

async function loadTemplates(): Promise<void> {
  isLoading.value = true
  try {
    const setting = await fetchUserSetting<unknown>(DESKTOP_SETTING_KEYS.promptLibrary)
    templates.value = normalizePromptTemplates(setting?.value)
    if (!setting) await persistTemplates()
  } catch {
    templates.value = normalizePromptTemplates(null)
  } finally {
    isLoading.value = false
  }
}

async function persistTemplates(): Promise<void> {
  await writeUserSetting(DESKTOP_SETTING_KEYS.promptLibrary, templates.value)
}

function resetEditor(): void {
  Object.assign(editor, { id: '', title: '', description: '', category: 'General', content: '', scope: 'global' })
  editorError.value = ''
}

function startCreate(): void { resetEditor(); isEditing.value = true }
function startEdit(template: PromptTemplate): void {
  Object.assign(editor, { id: template.id, title: template.title, description: template.description, category: template.category, content: template.content, scope: template.scope })
  isEditing.value = true
}
function cancelEditor(): void { isEditing.value = false; resetEditor() }

async function saveEditor(): Promise<void> {
  if (!editor.title.trim() || !editor.content.trim()) return
  if (editor.scope === 'workspace' && !props.cwd.trim()) {
    editorError.value = 'Choose a workspace before saving a workspace prompt.'
    return
  }
  isSaving.value = true
  const now = new Date().toISOString()
  const existing = templates.value.find((template) => template.id === editor.id)
  const next: PromptTemplate = {
    id: existing?.id ?? `prompt-${crypto.randomUUID()}`,
    title: editor.title.trim(),
    description: editor.description.trim(),
    category: editor.category.trim() || 'General',
    content: editor.content.trim(),
    scope: editor.scope,
    workspaceCwd: editor.scope === 'workspace' ? props.cwd.trim() : '',
    isFavorite: existing?.isFavorite ?? false,
    useCount: existing?.useCount ?? 0,
    lastUsedAtIso: existing?.lastUsedAtIso ?? '',
    createdAtIso: existing?.createdAtIso ?? now,
    updatedAtIso: now,
  }
  templates.value = existing ? templates.value.map((template) => template.id === existing.id ? next : template) : [next, ...templates.value]
  try {
    await persistTemplates()
    cancelEditor()
  } catch {
    editorError.value = 'The prompt could not be saved. Try again.'
  } finally {
    isSaving.value = false
  }
}

async function deleteEditor(): Promise<void> {
  if (!editor.id || !window.confirm('Delete this prompt?')) return
  templates.value = templates.value.filter((template) => template.id !== editor.id)
  await persistTemplates()
  cancelEditor()
}

function useTemplate(template: PromptTemplate, mode: PromptInsertion['mode']): void {
  const now = new Date().toISOString()
  templates.value = templates.value.map((item) => item.id === template.id ? { ...item, useCount: item.useCount + 1, lastUsedAtIso: now } : item)
  void persistTemplates()
  emit('insert', { id: ++insertionId, text: template.content, mode })
  emit('close')
}

function toggleFavorite(template: PromptTemplate): void {
  templates.value = templates.value.map((item) => item.id === template.id ? { ...item, isFavorite: !item.isFavorite } : item)
  void persistTemplates()
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.open) return
  if (isEditing.value) cancelEditor()
  else emit('close')
}

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  category.value = 'All'
  isEditing.value = false
  window.addEventListener('keydown', onWindowKeydown)
  void loadTemplates()
})

watch(() => props.open, (open, previous) => {
  if (previous && !open) window.removeEventListener('keydown', onWindowKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<style scoped>
@reference "../../style.css";
.prompt-library-layer { @apply fixed inset-0 z-[120] flex justify-end bg-black/45 backdrop-blur-[2px]; }
.prompt-library { @apply grid h-full w-[min(31rem,100vw)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden border-l theme-border theme-bg-panel theme-text shadow-2xl; animation: prompt-drawer-in 180ms ease-out; }
.prompt-library[data-editing='true'] { grid-template-rows: auto minmax(0, 1fr); }
.prompt-library-header { @apply flex items-start justify-between gap-4 border-b theme-border px-5 pb-4 pt-5; }
.prompt-library-eyebrow { @apply font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] theme-muted; }
.prompt-library-header h2 { @apply m-0 mt-1 text-xl font-semibold tracking-tight; }
.prompt-library-header p { @apply m-0 mt-1 max-w-96 text-xs leading-5 theme-muted; }
.prompt-library-close { @apply grid h-9 w-9 shrink-0 place-items-center rounded-md border theme-border theme-bg-control theme-muted transition hover:theme-bg-subtle hover:theme-text; }
.prompt-library-close svg { @apply h-4 w-4; }
.prompt-library-toolbar { @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-5 py-3; }
.prompt-library-search { @apply flex h-9 items-center gap-2 rounded-md border theme-border theme-bg-subtle px-3; }
.prompt-library-search svg { @apply h-4 w-4 theme-muted; }
.prompt-library-search input { @apply min-w-0 flex-1 border-0 bg-transparent text-sm outline-none theme-text; }
.prompt-library-new,.prompt-library-save { @apply rounded-md border theme-border-info theme-bg-accent px-3 text-xs font-semibold theme-on-accent transition hover:theme-bg-accent-hover; }
.prompt-library-categories { @apply flex gap-1 overflow-x-auto border-b theme-border px-5 pb-3; scrollbar-width: none; }
.prompt-library-categories button { @apply shrink-0 rounded-full border border-transparent px-2.5 py-1 text-[0.68rem] font-medium theme-muted; }
.prompt-library-categories button[data-active='true'] { @apply theme-border theme-bg-control theme-text; }
.prompt-library-list { @apply m-0 grid content-start gap-2 overflow-y-auto px-5 py-3; list-style: none; }
.prompt-library-card { @apply grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border theme-border theme-bg-subtle transition hover:border-[var(--color-accent)]; }
.prompt-library-card-main { @apply grid min-w-0 gap-1 border-0 bg-transparent px-3.5 py-3 text-left; }
.prompt-library-card-main strong { @apply text-sm theme-text; }
.prompt-library-card-main > span:last-child { @apply line-clamp-2 text-xs leading-5 theme-muted; }
.prompt-library-card-meta { @apply flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-wide; }
.prompt-library-card-meta b { @apply text-[var(--color-accent)]; }
.prompt-library-card-meta i { @apply not-italic theme-muted; }
.prompt-library-card-actions { @apply flex w-16 flex-col border-l theme-border; }
.prompt-library-card-actions button { @apply grid min-h-8 flex-1 place-items-center border-0 border-b theme-border bg-transparent px-1 text-[0.62rem] theme-muted transition last:border-b-0 hover:theme-bg-control hover:theme-text; }
.prompt-library-card-actions svg { @apply h-3.5 w-3.5; }
.prompt-library-empty { @apply grid place-content-center gap-1 px-5 py-16 text-center text-sm theme-muted; }
.prompt-library-empty strong { @apply theme-text; }
.prompt-library-footer { @apply flex justify-between border-t theme-border px-5 py-2.5 font-mono text-[0.6rem] theme-muted; }
.prompt-library-editor { @apply col-span-full grid content-start gap-3 overflow-y-auto px-5 py-4; }
.prompt-library-editor-heading { @apply mb-1 flex items-start justify-between border-b theme-border pb-3; }
.prompt-library-editor-heading span { @apply font-mono text-[0.6rem] uppercase tracking-widest theme-muted; }
.prompt-library-editor-heading h3 { @apply m-0 mt-1 text-base; }
.prompt-library-editor-heading button { @apply text-xs theme-muted; }
.prompt-library-editor label { @apply grid gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide theme-muted; }
.prompt-library-editor input,.prompt-library-editor select,.prompt-library-editor textarea { @apply rounded-md border theme-border theme-bg-subtle px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none theme-text focus:border-[var(--color-accent)]; }
.prompt-library-editor textarea { @apply resize-y font-mono text-xs leading-5; }
.prompt-library-editor-grid { @apply grid grid-cols-2 gap-3; }
.prompt-library-editor-actions { @apply flex justify-end gap-2 pt-1; }
.prompt-library-editor-actions button { @apply min-h-9 rounded-md px-3 text-xs font-semibold; }
.prompt-library-delete { @apply mr-auto theme-text-danger; }
.prompt-library-error { @apply m-0 text-xs theme-text-danger; }
@keyframes prompt-drawer-in { from { opacity: .65; transform: translateX(1.5rem); } }
@media (max-width: 600px) { .prompt-library { @apply w-full; } .prompt-library-editor-grid { @apply grid-cols-1; } }
@media (prefers-reduced-motion: reduce) { .prompt-library { animation: none; } }
</style>
