<template>
  <div class="message-markdown">
    <template v-for="(block, blockIndex) in parseMarkdownBlocks(text)" :key="`block-${blockIndex}`">
      <p v-if="block.kind === 'paragraph'" class="message-text">
        <template v-for="(segment, index) in block.segments" :key="`seg-${blockIndex}-${index}`">
          <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
          <strong v-else-if="segment.kind === 'strong'" class="message-strong">{{ segment.value }}</strong>
          <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
            {{ segment.displayName }}
          </a>
          <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
        </template>
      </p>

      <component
        :is="`h${String(block.level)}`"
        v-else-if="block.kind === 'heading'"
        class="message-heading"
        :data-level="block.level"
      >
        <template v-for="(segment, index) in block.segments" :key="`head-${blockIndex}-${index}`">
          <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
          <strong v-else-if="segment.kind === 'strong'" class="message-strong">{{ segment.value }}</strong>
          <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
            {{ segment.displayName }}
          </a>
          <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
        </template>
      </component>

      <ul v-else-if="block.kind === 'unorderedList'" class="message-list">
        <li v-for="(item, itemIndex) in block.items" :key="`ul-${blockIndex}-${itemIndex}`">
          <template v-for="(segment, index) in item" :key="`ulseg-${blockIndex}-${itemIndex}-${index}`">
            <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
            <strong v-else-if="segment.kind === 'strong'" class="message-strong">{{ segment.value }}</strong>
            <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
              {{ segment.displayName }}
            </a>
            <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
          </template>
        </li>
      </ul>

      <ol v-else-if="block.kind === 'orderedList'" class="message-list message-list-ordered">
        <li v-for="(item, itemIndex) in block.items" :key="`ol-${blockIndex}-${itemIndex}`">
          <template v-for="(segment, index) in item" :key="`olseg-${blockIndex}-${itemIndex}-${index}`">
            <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
            <strong v-else-if="segment.kind === 'strong'" class="message-strong">{{ segment.value }}</strong>
            <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
              {{ segment.displayName }}
            </a>
            <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
          </template>
        </li>
      </ol>

      <blockquote v-else-if="block.kind === 'blockquote'" class="message-blockquote">
        <template v-for="(segment, index) in block.segments" :key="`quote-${blockIndex}-${index}`">
          <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
          <strong v-else-if="segment.kind === 'strong'" class="message-strong">{{ segment.value }}</strong>
          <a v-else-if="segment.kind === 'file'" class="message-file-link" href="#" @click.prevent>
            {{ segment.displayName }}
          </a>
          <code v-else-if="segment.kind === 'code'" class="message-inline-code">{{ segment.value }}</code>
        </template>
      </blockquote>

      <pre v-else class="message-code-block"><code>{{ block.code }}</code></pre>
    </template>
  </div>
</template>

<script setup lang="ts">
import { parseMarkdownBlocks } from '../../composables/useMarkdownBlocks'

defineProps<{
  text: string
}>()
</script>

<style scoped>
@reference "tailwindcss";

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap text-slate-800;
}

.message-markdown {
  @apply flex flex-col gap-3 text-sm leading-relaxed text-slate-800;
}

.message-heading {
  @apply m-0 font-semibold leading-snug text-slate-900;
}

.message-heading[data-level='1'] {
  @apply text-xl;
}

.message-heading[data-level='2'] {
  @apply text-lg;
}

.message-heading[data-level='3'] {
  @apply text-base;
}

.message-list {
  @apply my-0 pl-5 text-sm leading-relaxed text-slate-800;
}

.message-list:not(.message-list-ordered) {
  @apply list-disc;
}

.message-list-ordered {
  @apply list-decimal;
}

.message-list li {
  @apply my-1 pl-1;
}

.message-blockquote {
  @apply my-0 border-l-4 border-slate-200 pl-3 text-sm leading-relaxed text-slate-600;
}

.message-code-block {
  @apply my-0 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100;
}

.message-code-block code {
  @apply font-mono whitespace-pre;
}

.message-inline-code {
  @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-slate-900 font-mono;
}

.message-strong {
  @apply font-semibold text-slate-900;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}
</style>
