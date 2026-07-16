<template>
  <article class="agent-task-card" :data-active="active" :data-enabled="task.enabled">
    <div class="agent-task-rail" aria-hidden="true"><span /></div>
    <div class="agent-task-main">
      <div class="agent-task-title-line">
        <div>
          <strong>{{ task.name }}</strong>
          <span :data-state="view === 'archived' ? 'archived' : latestRun?.status || (task.enabled ? 'scheduled' : 'paused')">
            {{ view === 'archived' ? t('agentTasks.state.archived') : runStateLabel(latestRun?.status, task.enabled) }}
          </span>
        </div>
        <div class="agent-task-actions">
          <template v-if="view === 'archived'">
            <button type="button" :title="t('agentTasks.restore')" :disabled="busy" @click="$emit('restore')"><IconTablerRefresh /></button>
            <button class="danger" type="button" :title="t('agentTasks.permanentDelete')" :disabled="busy" @click="$emit('permanentlyDelete')">×</button>
          </template>
          <template v-else>
            <button v-if="active" class="danger" type="button" :title="t('agentTasks.cancelRun')" :disabled="busy" @click="$emit('control', 'cancel')"><IconTablerPlayerStopFilled /></button>
            <button v-else type="button" :title="t('agentTasks.runNow')" :disabled="busy" @click="$emit('control', 'run')"><IconTablerRefresh /></button>
            <button type="button" :title="task.enabled ? t('agentTasks.pause') : t('agentTasks.resume')" :disabled="busy" @click="$emit('control', task.enabled ? 'pause' : 'resume')">
              <IconTablerPlayerStopFilled v-if="task.enabled" /><IconTablerRefresh v-else />
            </button>
            <button type="button" :title="t('agentTasks.edit')" :disabled="busy || active" @click="$emit('edit')"><IconTablerFilePencil /></button>
            <button type="button" :title="t('agentTasks.duplicate')" :disabled="busy" @click="$emit('control', 'duplicate')">⧉</button>
            <button type="button" :title="t('agentTasks.delete')" :disabled="busy || active" @click="$emit('remove')"><IconTablerArchive /></button>
          </template>
        </div>
      </div>
      <p class="agent-task-description">{{ task.description || compactPrompt(task.prompt) }}</p>
      <div class="agent-task-meta">
        <span><IconTablerFolder /> {{ projectLabel }}</span>
        <span><IconTablerPin /> {{ scheduleLabel }}</span>
        <span><IconTablerSettings /> {{ permissionLabel }}</span>
        <span>{{ t(`agentTasks.concurrency.${task.concurrencyPolicy}` as Parameters<typeof t>[0]) }}</span>
        <span>v{{ task.version }}</span>
      </div>
      <div class="agent-task-timing">
        <div><small>{{ t('agentTasks.nextRun') }}</small><strong>{{ formatTime(task.nextRunAtIso) }}</strong></div>
        <div><small>{{ t('agentTasks.lastRun') }}</small><strong>{{ formatTime(task.lastRunAtIso) }}</strong></div>
        <div><small>{{ t('agentTasks.tokens') }}</small><strong>{{ formatTokens(latestRun?.totalTokens || 0) }}</strong></div>
      </div>
      <button class="agent-task-history-toggle" type="button" :aria-expanded="expanded" @click="$emit('toggleHistory')">
        {{ t('agentTasks.history') }} <IconTablerChevronDown :class="{ rotated: expanded }" />
      </button>
      <div v-if="expanded" class="agent-task-history">
        <div v-if="runs.length === 0" class="agent-task-no-runs">{{ t('agentTasks.noRuns') }}</div>
        <article v-for="run in runs" :key="run.id" :data-state="run.status">
          <span class="agent-run-dot" />
          <div>
            <strong>{{ runStateLabel(run.status, true) }}</strong>
            <p>{{ run.error || run.summary || t('agentTasks.runPending') }}</p>
            <small>{{ formatTime(run.startedAtIso || run.scheduledAtIso) }} · {{ run.trigger === 'manual' ? t('agentTasks.manual') : run.trigger === 'retry' ? t('agentTasks.retry') : t('agentTasks.scheduled') }} · v{{ run.taskVersion }}</small>
            <AgentTaskRunTimeline :run-id="run.id" />
          </div>
          <button v-if="run.threadId" type="button" @click="$emit('selectThread', run.threadId)">{{ t('agentTasks.openThread') }} <IconTablerArrowUp /></button>
        </article>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentTask, AgentTaskRun } from '../../api/codexAgentTaskClient'
import { useLocale } from '../../composables/useLocale'
import IconTablerArchive from '../icons/IconTablerArchive.vue'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerPin from '../icons/IconTablerPin.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'
import IconTablerSettings from '../icons/IconTablerSettings.vue'
import AgentTaskRunTimeline from './AgentTaskRunTimeline.vue'

const props = defineProps<{
  task: AgentTask
  latestRun?: AgentTaskRun
  runs: AgentTaskRun[]
  busy: boolean
  expanded: boolean
  view: 'active' | 'archived'
  projectLabel: string
  scheduleLabel: string
  permissionLabel: string
}>()
defineEmits<{
  control: [action: 'run' | 'pause' | 'resume' | 'cancel' | 'duplicate']
  edit: []
  remove: []
  restore: []
  permanentlyDelete: []
  toggleHistory: []
  selectThread: [threadId: string]
}>()
const { locale, t } = useLocale()
const active = computed(() => ['queued', 'running', 'waiting_approval'].includes(props.latestRun?.status ?? ''))
function compactPrompt(value: string): string { return value.length > 140 ? `${value.slice(0, 140)}…` : value }
function formatTime(value: string | null): string { if (!value) return t('agentTasks.notScheduled'); const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : value }
function formatTokens(value: number): string { return value ? new Intl.NumberFormat(locale.value, { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value) : '—' }
function runStateLabel(status: AgentTaskRun['status'] | undefined, enabled: boolean): string { if (!status) return enabled ? t('agentTasks.state.scheduled') : t('agentTasks.state.paused'); return t(`agentTasks.state.${status}` as Parameters<typeof t>[0]) }
</script>
