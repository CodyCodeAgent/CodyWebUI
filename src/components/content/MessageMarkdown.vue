<template>
  <div class="message-markdown" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../../composables/renderMarkdown'

const props = defineProps<{
  text: string
}>()

const renderedHtml = computed(() => renderMarkdown(props.text))
</script>

<style scoped>
@reference "tailwindcss";

.message-markdown {
  @apply text-sm leading-relaxed text-slate-800;
  overflow-wrap: anywhere;
}

.message-markdown :deep(> :first-child) { margin-top: 0; }
.message-markdown :deep(> :last-child) { margin-bottom: 0; }

.message-markdown :deep(p) { @apply my-3 whitespace-pre-wrap; }
.message-markdown :deep(h1),
.message-markdown :deep(h2),
.message-markdown :deep(h3),
.message-markdown :deep(h4),
.message-markdown :deep(h5),
.message-markdown :deep(h6) { @apply mb-2 mt-5 font-semibold leading-snug text-slate-900; }
.message-markdown :deep(h1) { @apply text-xl; }
.message-markdown :deep(h2) { @apply text-lg; }
.message-markdown :deep(h3) { @apply text-base; }

.message-markdown :deep(ul),
.message-markdown :deep(ol) { @apply my-3 pl-6; }
.message-markdown :deep(ul) { @apply list-disc; }
.message-markdown :deep(ol) { @apply list-decimal; }
.message-markdown :deep(li) { @apply my-1 pl-1; }
.message-markdown :deep(li > ul),
.message-markdown :deep(li > ol) { @apply my-1; }

.message-markdown :deep(blockquote) { @apply my-3 border-l-4 border-slate-200 pl-3 text-slate-600; }
.message-markdown :deep(blockquote > :first-child) { margin-top: 0; }
.message-markdown :deep(blockquote > :last-child) { margin-bottom: 0; }

.message-markdown :deep(pre) { @apply my-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100; }
.message-markdown :deep(pre.is-compact),
.message-markdown :deep(pre:has(> code.is-compact-code)) { @apply w-fit max-w-full px-2.5 py-1.5; }
.message-markdown :deep(pre code) { @apply bg-transparent p-0 text-inherit; white-space: pre; }
.message-markdown :deep(code) { @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 font-mono text-[0.875em] leading-[1.4] text-slate-900; }

.message-markdown :deep(a) { @apply text-[#0969da] underline decoration-[#0969da]/35 underline-offset-2 hover:decoration-current; }
.message-markdown :deep(strong) { @apply font-semibold text-slate-900; }
.message-markdown :deep(del) { @apply text-slate-500; }
.message-markdown :deep(hr) { @apply my-5 border-0 border-t border-slate-200; }
.message-markdown :deep(img) { @apply my-3 max-w-full rounded-lg border border-slate-200; }

.message-markdown :deep(table) { @apply my-4 block w-full overflow-x-auto border-separate border-spacing-0 text-left text-[0.8125rem]; }
.message-markdown :deep(th) { @apply border-b border-t border-slate-300 bg-slate-100 px-3 py-2 font-semibold text-slate-900; }
.message-markdown :deep(td) { @apply border-b border-slate-200 px-3 py-2 align-top text-slate-700; }
.message-markdown :deep(th:first-child),
.message-markdown :deep(td:first-child) { @apply border-l border-slate-200; }
.message-markdown :deep(th:last-child),
.message-markdown :deep(td:last-child) { @apply border-r border-slate-200; }
.message-markdown :deep(th:first-child) { @apply rounded-tl-lg; }
.message-markdown :deep(th:last-child) { @apply rounded-tr-lg; }
.message-markdown :deep(tr:last-child td:first-child) { @apply rounded-bl-lg; }
.message-markdown :deep(tr:last-child td:last-child) { @apply rounded-br-lg; }

.message-markdown :deep(.contains-task-list) { @apply list-none pl-1; }
.message-markdown :deep(.task-list-item) { @apply relative pl-7; }
.message-markdown :deep(.task-list-item > input) { @apply absolute left-0 top-1 h-4 w-4; accent-color: var(--color-accent); }

:global(.app-dark) .message-markdown :deep(h1),
:global(.app-dark) .message-markdown :deep(h2),
:global(.app-dark) .message-markdown :deep(h3),
:global(.app-dark) .message-markdown :deep(h4),
:global(.app-dark) .message-markdown :deep(h5),
:global(.app-dark) .message-markdown :deep(h6),
:global(.app-dark) .message-markdown :deep(strong) { color: var(--color-text); }
:global(.app-dark) .message-markdown :deep(blockquote) { border-color: color-mix(in srgb, var(--color-accent) 34%, var(--color-border)); color: var(--color-text-muted); }
:global(.app-dark) .message-markdown :deep(code) { background: var(--color-elevated); border-color: var(--color-border); color: var(--color-text); }
:global(.app-dark) .message-markdown :deep(pre) { background: var(--color-code-background); border-color: var(--color-border); }
:global(.app-dark) .message-markdown :deep(pre code) { background: transparent; border: 0; color: inherit; }
:global(.app-dark) .message-markdown :deep(th) { background: var(--color-elevated); border-color: var(--color-border); color: var(--color-text); }
:global(.app-dark) .message-markdown :deep(td) { border-color: var(--color-border); color: var(--color-text-muted); }
</style>
