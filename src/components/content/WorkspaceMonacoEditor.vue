<template>
  <div
    ref="editorHost"
    class="workspace-monaco-editor"
    :data-read-only="readOnly"
    :aria-label="readOnly ? 'Workspace file viewer' : 'Workspace file editor'"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: () => Worker
    }
  }
}

if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
  }
}

const props = withDefaults(defineProps<{
  modelValue: string
  path: string
  readOnly?: boolean
}>(), {
  readOnly: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorHost = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let contentChangeDisposable: monaco.IDisposable | null = null
let themeObserver: MutationObserver | null = null
let ignoreModelEcho = false

function languageForPath(path: string): string {
  const normalized = path.toLowerCase()
  const extension = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.') + 1) : normalized
  const byExactName: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    'package.json': 'json',
    'package-lock.json': 'json',
    'tsconfig.json': 'json',
    '.env': 'ini',
    '.gitignore': 'ignore',
    '.aiignore': 'ignore',
  }
  const basename = normalized.split('/').pop() ?? normalized
  if (byExactName[basename]) return byExactName[basename]
  const byExtension: Record<string, string> = {
    cjs: 'javascript',
    css: 'css',
    go: 'go',
    htm: 'html',
    html: 'html',
    ini: 'ini',
    java: 'java',
    js: 'javascript',
    json: 'json',
    jsx: 'javascript',
    lock: 'text',
    md: 'markdown',
    mjs: 'javascript',
    py: 'python',
    rs: 'rust',
    sh: 'shell',
    sql: 'sql',
    ts: 'typescript',
    tsx: 'typescript',
    txt: 'text',
    vue: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  }
  return byExtension[extension] ?? 'text'
}

function activeMonacoTheme(): 'vs' | 'vs-dark' {
  if (typeof document === 'undefined') return 'vs'
  return document.documentElement.style.colorScheme === 'dark' ? 'vs-dark' : 'vs'
}

function createModel(): monaco.editor.ITextModel {
  const uriPath = props.path.replace(/\\/gu, '/').replace(/^\/+/, '')
  const uri = monaco.Uri.parse(`codex-workspace:///${encodeURI(uriPath || 'untitled.txt')}`)
  const existing = monaco.editor.getModel(uri)
  existing?.dispose()
  return monaco.editor.createModel(props.modelValue, languageForPath(props.path), uri)
}

function syncExternalValue(value: string): void {
  if (!model || model.getValue() === value) return
  const selection = editor?.getSelection() ?? null
  ignoreModelEcho = true
  model.setValue(value)
  ignoreModelEcho = false
  if (selection) editor?.setSelection(selection)
}

function attachModel(nextModel: monaco.editor.ITextModel): void {
  contentChangeDisposable?.dispose()
  model?.dispose()
  model = nextModel
  editor?.setModel(model)
  contentChangeDisposable = model.onDidChangeContent(() => {
    if (ignoreModelEcho || !model || props.readOnly) return
    emit('update:modelValue', model.getValue())
  })
}

function refreshTheme(): void {
  monaco.editor.setTheme(activeMonacoTheme())
}

function fontFamily(): string {
  if (typeof document === 'undefined') return 'Menlo, Monaco, Consolas, monospace'
  return getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'Menlo, Monaco, Consolas, monospace'
}

onMounted(async () => {
  await nextTick()
  if (!editorHost.value) return
  model = createModel()
  refreshTheme()
  editor = monaco.editor.create(editorHost.value, {
    model,
    automaticLayout: true,
    contextmenu: true,
    fontFamily: fontFamily(),
    fontSize: 12,
    lineHeight: 19,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    readOnly: props.readOnly,
    renderLineHighlight: 'line',
    renderValidationDecorations: 'off',
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: 'on',
  })
  contentChangeDisposable = model.onDidChangeContent(() => {
    if (ignoreModelEcho || !model || props.readOnly) return
    emit('update:modelValue', model.getValue())
  })
  themeObserver = new MutationObserver(refreshTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme-skin'] })
})

watch(
  () => props.readOnly,
  (readOnly) => {
    editor?.updateOptions({ readOnly })
  },
)

watch(
  () => props.modelValue,
  (value) => {
    syncExternalValue(value)
  },
)

watch(
  () => props.path,
  () => {
    if (!editor) return
    attachModel(createModel())
  },
)

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  contentChangeDisposable?.dispose()
  editor?.dispose()
  model?.dispose()
})
</script>

<style scoped>
@reference "tailwindcss";

.workspace-monaco-editor {
  @apply min-h-0 flex-1 overflow-hidden bg-white;
}

.workspace-monaco-editor[data-read-only='true'] {
  @apply cursor-default;
}
</style>
