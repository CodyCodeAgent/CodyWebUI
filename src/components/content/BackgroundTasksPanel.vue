<template>
  <div class="task-monitor">
    <div v-if="error" class="task-monitor-error" role="alert">{{ error }}</div>
    <div v-if="tasks.length === 0 && !isLoading" class="task-monitor-empty">{{ t('settings.tasks.empty') }}</div>
    <article v-for="task in tasks" :key="task.name" class="task-row" :data-state="task.state" :data-health="task.health">
      <div class="task-signal"><span /></div>
      <div class="task-copy">
        <div class="task-title-line">
          <strong>{{ taskLabel(task.name) }}</strong>
          <span>{{ stateLabel(task.state) }}</span>
          <small v-if="task.pendingRerun">{{ t('settings.tasks.rerunQueued') }}</small>
          <small v-if="task.health === 'degraded' || task.health === 'unhealthy'" class="task-health">{{ healthLabel(task.health) }}</small>
        </div>
        <p>{{ task.progress?.message || task.lastError || taskSummary(task) }}</p>
        <div v-if="task.running && task.progress && task.progress.total" class="task-progress">
          <span :style="{ width: `${Math.min(100, task.progress.completed / task.progress.total * 100)}%` }" />
        </div>
        <dl>
          <div><dt>{{ t('settings.tasks.lastSuccess') }}</dt><dd>{{ formatTime(task.lastSuccessAtIso) }}</dd></div>
          <div><dt>{{ t('settings.tasks.duration') }}</dt><dd>{{ formatDuration(task.lastDurationMs) }}</dd></div>
          <div><dt>{{ t('settings.tasks.nextRun') }}</dt><dd>{{ formatTime(task.nextRunAtIso) }}</dd></div>
          <div><dt>{{ t('settings.tasks.failures') }}</dt><dd>{{ task.failureCount }} / {{ task.timedOutCount }}</dd></div>
        </dl>
      </div>
      <div class="task-actions">
        <button type="button" :disabled="busyName === task.name || task.running || task.paused" @click="control(task.name, 'run')">{{ t('settings.tasks.runNow') }}</button>
        <button v-if="task.paused" type="button" :disabled="busyName === task.name" @click="control(task.name, 'resume')">{{ t('settings.tasks.resume') }}</button>
        <button v-else type="button" :disabled="busyName === task.name" @click="control(task.name, 'pause')">{{ t('settings.tasks.pause') }}</button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { controlBackgroundTask, fetchBackgroundTasks, type BackgroundTaskStatus } from '../../api/codexBackgroundTaskClient'
import { useLocale } from '../../composables/useLocale'

const { locale, t } = useLocale()
const tasks = ref<BackgroundTaskStatus[]>([])
const error = ref('')
const isLoading = ref(false)
const busyName = ref('')
let refreshTimer: number | null = null
let latestRequestId = 0

function taskLabel(name: string): string {
  if (name === 'project-thread-catalog-sync') return t('settings.tasks.catalog')
  if (name === 'token-usage-reconciliation') return t('settings.tasks.tokens')
  return name
}

function stateLabel(state: BackgroundTaskStatus['state']): string {
  return t(`settings.tasks.state.${state}` as Parameters<typeof t>[0])
}

function healthLabel(health: BackgroundTaskStatus['health']): string {
  return t(`settings.tasks.health.${health}` as Parameters<typeof t>[0])
}

function formatTime(value: string | null): string {
  if (!value) return t('settings.tasks.never')
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(timestamp))
    : value
}

function formatDuration(value: number | null): string {
  if (value === null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} s`
}

function taskSummary(task: BackgroundTaskStatus): string {
  return t('settings.tasks.summary', { runs: String(task.runCount), successes: String(task.successCount) })
}

async function load(): Promise<void> {
  if (isLoading.value || busyName.value) return
  const requestId = ++latestRequestId
  isLoading.value = true
  try {
    const nextTasks = await fetchBackgroundTasks()
    if (requestId !== latestRequestId) return
    tasks.value = nextTasks
    error.value = ''
  } catch (unknownError) {
    if (requestId === latestRequestId) error.value = unknownError instanceof Error ? unknownError.message : t('settings.tasks.loadFailed')
  } finally {
    if (requestId === latestRequestId) isLoading.value = false
  }
}

async function control(name: string, action: 'run' | 'pause' | 'resume'): Promise<void> {
  const requestId = ++latestRequestId
  isLoading.value = false
  busyName.value = name
  try {
    const nextTasks = await controlBackgroundTask(name, action)
    if (requestId !== latestRequestId) return
    tasks.value = nextTasks
    error.value = ''
  } catch (unknownError) {
    if (requestId === latestRequestId) error.value = unknownError instanceof Error ? unknownError.message : t('settings.tasks.controlFailed')
  } finally {
    if (busyName.value === name) busyName.value = ''
  }
}

onMounted(() => {
  void load()
  refreshTimer = window.setInterval(() => void load(), 5_000)
})
onUnmounted(() => { if (refreshTimer !== null) window.clearInterval(refreshTimer) })
</script>

<style scoped>
@reference "../../style.css";
.task-monitor { display:grid; gap:.65rem; }
.task-row { display:grid; grid-template-columns:.7rem minmax(0,1fr) auto; gap:.75rem; padding:.85rem; border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-surface); }
.task-signal { padding-top:.3rem; }
.task-signal span { display:block; width:.48rem; height:.48rem; border-radius:50%; background:var(--color-text-muted); }
.task-row[data-state='running'] .task-signal span { background:var(--color-accent); box-shadow:0 0 0 4px color-mix(in srgb,var(--color-accent) 12%,transparent),0 0 14px color-mix(in srgb,var(--color-accent) 45%,transparent); }
.task-row[data-state='succeeded'] .task-signal span,.task-row[data-state='scheduled'] .task-signal span { background:var(--color-success); }
.task-row[data-state='failed'] .task-signal span,.task-row[data-state='timed_out'] .task-signal span { background:var(--color-danger); }
.task-row[data-state='paused'] .task-signal span { background:var(--color-warning); }
.task-title-line { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem; }
.task-title-line strong { font-size:.82rem; }
.task-title-line span,.task-title-line small { padding:.18rem .38rem; border-radius:.32rem; background:var(--color-elevated); color:var(--color-text-muted); font: .6rem var(--font-mono); }
.task-title-line small { color:var(--color-warning); }
.task-title-line .task-health { color:var(--color-danger); }
.task-copy>p { margin:.35rem 0 .55rem; color:var(--color-text-muted); font-size:.7rem; }
.task-progress { height:.22rem; overflow:hidden; border-radius:1rem; background:var(--color-elevated); }
.task-progress span { display:block; height:100%; border-radius:inherit; background:var(--color-accent); transition:width .2s ease; }
.task-copy dl { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.6rem; margin:.65rem 0 0; }
.task-copy dl div { min-width:0; }
.task-copy dt { color:var(--color-text-muted); font-size:.58rem; }
.task-copy dd { margin:.14rem 0 0; overflow:hidden; color:var(--color-text); font:.62rem var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
.task-actions { display:flex; align-items:flex-start; gap:.35rem; }
.task-actions button { padding:.38rem .52rem; border:1px solid var(--color-border); border-radius:var(--radius-sm); background:var(--color-panel); color:var(--color-text-muted); font-size:.66rem; }
.task-actions button:hover { color:var(--color-text); border-color:color-mix(in srgb,var(--color-accent) 35%,var(--color-border)); }
.task-actions button:disabled { opacity:.45; }
.task-monitor-error { padding:.65rem; border:1px solid color-mix(in srgb,var(--color-danger) 35%,var(--color-border)); border-radius:var(--radius-md); color:var(--color-danger); }
.task-monitor-empty { color:var(--color-text-muted); }
@media (max-width:800px) { .task-row { grid-template-columns:.7rem minmax(0,1fr); } .task-actions { grid-column:2; } .task-copy dl { grid-template-columns:repeat(2,1fr); } }
</style>
