<template>
  <nav class="sidebar-primary-nav">
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">New thread</SidebarMenuRow>
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">Automations</SidebarMenuRow>
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">Skills</SidebarMenuRow>
  </nav>
</template>

<script setup lang="ts">
import SidebarMenuRow from './SidebarMenuRow.vue'
</script>

<style scoped>
@reference "../../style.css";

.sidebar-primary-nav {
  @apply flex flex-col gap-1;
}

.sidebar-nav-item {
  @apply text-sm font-normal theme-muted hover:bg-slate-200;
}
</style>
