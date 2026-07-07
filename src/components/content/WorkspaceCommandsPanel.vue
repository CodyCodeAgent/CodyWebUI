<template>
  <section class="workspace-commands-panel" aria-label="Terminal sessions">
    <header class="workspace-commands-panel-header">
      <div>
        <h3 class="workspace-commands-panel-title">Commands</h3>
        <p class="workspace-commands-panel-subtitle">{{ commandSummary }}</p>
      </div>
      <button
        class="workspace-commands-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadSessions"
      >
        <IconTablerRefresh class="workspace-commands-panel-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-commands-panel-error">{{ errorMessage }}</p>

    <ul v-if="scripts.length > 0" class="workspace-commands-panel-script-list">
      <li v-for="script in scripts" :key="script.name" :data-script-name="script.name">
        <div>
          <span>{{ script.name }}</span>
          <code>{{ script.command }}</code>
        </div>
        <button
          type="button"
          :disabled="pendingScriptName === script.name || !cwd"
          @click="startScript(script.name)"
        >
          {{ pendingScriptName === script.name ? 'Starting' : 'Start' }}
        </button>
      </li>
    </ul>
    <p v-else class="workspace-commands-panel-empty">No package scripts detected.</p>

    <div v-if="sessions.length > 0" class="workspace-commands-panel-session-list">
      <article
        v-for="session in sessions"
        :key="session.id"
        class="workspace-commands-panel-session"
        :data-session-status="session.status"
        :data-session-script="session.scriptName"
      >
        <header>
          <div>
            <h4>{{ session.scriptName }}</h4>
            <p>{{ session.command }} · {{ session.status }}<span v-if="session.pid"> · pid {{ session.pid }}</span></p>
          </div>
          <button
            v-if="session.status === 'running'"
            type="button"
            :disabled="pendingStopSessionId === session.id"
            @click="stopSession(session.id)"
          >
            {{ pendingStopSessionId === session.id ? 'Stopping' : 'Stop' }}
          </button>
        </header>
        <pre>{{ session.output || 'No output captured yet.' }}</pre>
      </article>
    </div>
    <p v-else class="workspace-commands-panel-empty">No terminal sessions yet.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchTerminalSessions, startTerminalSession, stopTerminalSession } from '../../api/codexTerminalClient'
import type { UiTerminalSession, UiTerminalSessionList } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
  scripts: Array<{ name: string; command: string }>
}>()

const emit = defineEmits<{
  changed: []
}>()

const snapshot = ref<UiTerminalSessionList | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const pendingScriptName = ref('')
const pendingStopSessionId = ref('')
let refreshTimer: number | null = null

const sessions = computed<UiTerminalSession[]>(() => snapshot.value?.sessions ?? [])
const runningSessionCount = computed(() => sessions.value.filter((session) => session.status === 'running').length)
const commandSummary = computed(() => {
  if (runningSessionCount.value > 0) return `${String(runningSessionCount.value)} running`
  if (sessions.value.length > 0) return `${String(sessions.value.length)} recent session${sessions.value.length === 1 ? '' : 's'}`
  return 'Start package scripts and inspect output.'
})

async function loadSessions(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    snapshot.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchTerminalSessions(cwd)
  } catch (error) {
    snapshot.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load terminal sessions.'
  } finally {
    isLoading.value = false
  }
}

async function startScript(scriptName: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  pendingScriptName.value = scriptName
  errorMessage.value = ''
  try {
    const session = await startTerminalSession(cwd, scriptName)
    snapshot.value = {
      cwd,
      root: session.root,
      generatedAtIso: new Date().toISOString(),
      sessions: [session, ...sessions.value.filter((item) => item.id !== session.id)],
    }
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : `Failed to start ${scriptName}.`
  } finally {
    pendingScriptName.value = ''
  }
}

async function stopSession(sessionId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  pendingStopSessionId.value = sessionId
  errorMessage.value = ''
  try {
    const session = await stopTerminalSession(cwd, sessionId)
    snapshot.value = {
      cwd,
      root: session.root,
      generatedAtIso: new Date().toISOString(),
      sessions: sessions.value.map((item) => (item.id === session.id ? session : item)),
    }
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to stop terminal session.'
  } finally {
    pendingStopSessionId.value = ''
  }
}

function startPolling(): void {
  if (refreshTimer !== null || typeof window === 'undefined') return
  refreshTimer = window.setInterval(() => {
    if (runningSessionCount.value > 0) {
      void loadSessions()
    }
  }, 1500)
}

function stopPolling(): void {
  if (refreshTimer === null || typeof window === 'undefined') return
  window.clearInterval(refreshTimer)
  refreshTimer = null
}

watch(
  () => props.cwd,
  () => {
    void loadSessions()
  },
  { immediate: true },
)

onMounted(startPolling)
onUnmounted(stopPolling)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-commands-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-commands-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-commands-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-commands-panel-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-commands-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-commands-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-commands-panel-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-commands-panel-script-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-commands-panel-script-list li {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-commands-panel-script-list span {
  @apply mr-2 font-mono text-xs font-semibold text-zinc-900;
}

.workspace-commands-panel-script-list code {
  @apply break-words font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-commands-panel-script-list button,
.workspace-commands-panel-session header button {
  @apply inline-flex h-6 shrink-0 items-center rounded-md border border-zinc-300 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60;
}

.workspace-commands-panel-session-list {
  @apply mt-2 grid gap-2;
}

.workspace-commands-panel-session {
  @apply rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-commands-panel-session[data-session-status='running'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-commands-panel-session[data-session-status='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-commands-panel-session header {
  @apply flex items-start justify-between gap-2;
}

.workspace-commands-panel-session h4 {
  @apply m-0 font-mono text-xs font-semibold text-zinc-900;
}

.workspace-commands-panel-session p {
  @apply m-0 mt-0.5 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-commands-panel-session pre {
  @apply m-0 mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-900 bg-zinc-950 p-2 font-mono text-[0.68rem] leading-4 text-zinc-100;
}

.workspace-commands-panel-empty {
  @apply m-0 mt-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}
</style>
