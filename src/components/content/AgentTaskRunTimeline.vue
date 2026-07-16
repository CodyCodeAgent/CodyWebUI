<template>
  <button class="agent-run-timeline-button" type="button" :aria-expanded="expanded" @click="toggle">
    {{ t('agentTasks.timeline') }}
  </button>
  <ol v-if="expanded" class="agent-run-timeline">
    <li v-for="event in events" :key="event.id">
      <span>{{ event.kind }}</span><p>{{ event.message }}</p><time>{{ formatTime(event.createdAtIso) }}</time>
    </li>
    <li v-if="events.length === 0"><p>{{ t('agentTasks.timelineEmpty') }}</p></li>
  </ol>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { fetchAgentTaskRunEvents, type AgentTaskRunEvent } from '../../api/codexAgentTaskClient'
import { useLocale } from '../../composables/useLocale'

const props = defineProps<{ runId: string }>()
const { locale, t } = useLocale()
const expanded = ref(false)
const events = ref<AgentTaskRunEvent[]>([])
let revision = 0

async function toggle(): Promise<void> {
  expanded.value = !expanded.value
  const current = ++revision
  if (!expanded.value) { events.value = []; return }
  const result = await fetchAgentTaskRunEvents(props.runId).catch(() => [])
  if (expanded.value && current === revision) events.value = result
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : value
}
</script>

<style scoped>
.agent-run-timeline-button{margin-top:.25rem;padding:0;border:0;background:transparent;color:var(--color-accent);font-size:.58rem}.agent-run-timeline{display:grid;gap:.3rem;margin:.45rem 0 0;padding:0;list-style:none}.agent-run-timeline li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.4rem;padding:.4rem;border-left:2px solid var(--color-border);background:color-mix(in srgb,var(--color-surface) 45%,transparent)}.agent-run-timeline span{color:var(--color-accent);font:.5rem var(--font-mono);text-transform:uppercase}.agent-run-timeline p{margin:0;color:var(--color-text-muted);font-size:.6rem}.agent-run-timeline time{color:var(--color-text-muted);font:.48rem var(--font-mono)}@media(max-width:700px){.agent-run-timeline li{grid-template-columns:1fr}.agent-run-timeline time{grid-row:3}}
</style>
