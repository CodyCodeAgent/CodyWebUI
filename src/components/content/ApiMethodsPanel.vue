<template>
  <aside class="api-panel-root">
    <header class="api-panel-header">
      <h2 class="api-panel-title">AppServer API</h2>
      <p class="api-panel-count">{{ methods.length }} methods</p>
    </header>

    <p v-if="isLoading" class="api-panel-loading">Loading method catalog...</p>

    <ul v-else class="api-method-list">
      <li v-for="method in methods" :key="method" class="api-method-item">
        <code class="api-method-code">{{ method }}</code>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  methods: string[]
  isLoading: boolean
}>()
</script>

<style scoped>
@reference "../../style.css";

.api-panel-root {
  @apply h-full min-h-0 rounded-2xl border theme-border theme-bg-panel p-4 flex flex-col;
}

.api-panel-header {
  @apply pb-3 border-b theme-border;
}

.api-panel-title {
  @apply m-0 text-lg font-semibold theme-text;
}

.api-panel-count {
  @apply m-0 mt-1 text-xs theme-muted;
}

.api-panel-loading {
  @apply mt-3 mb-0 text-sm theme-muted;
}

.api-method-list {
  @apply mt-3 list-none m-0 p-0 overflow-y-auto min-h-0 flex-1 flex flex-col gap-1;
}

.api-method-item {
  @apply m-0;
}

.api-method-code {
  @apply block rounded-md theme-bg-control px-2 py-1 text-xs theme-muted;
}
</style>
