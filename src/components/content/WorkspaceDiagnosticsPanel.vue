<template>
  <section class="workspace-diagnostics-panel" aria-label="Gateway diagnostics">
    <header class="workspace-diagnostics-header">
      <div>
        <h3 class="workspace-diagnostics-title">Gateway Diagnostics</h3>
        <p class="workspace-diagnostics-subtitle">{{ diagnosticsSummary }}</p>
      </div>
      <div class="workspace-diagnostics-actions">
        <button
          class="workspace-diagnostics-refresh"
          type="button"
          :disabled="isReloadingMcp"
          @click="reloadMcp"
        >
          <IconTablerRefresh class="workspace-diagnostics-refresh-icon" />
          <span>{{ isReloadingMcp ? 'Reloading MCP' : 'Reload MCP' }}</span>
        </button>
        <button
          class="workspace-diagnostics-refresh"
          type="button"
          :disabled="isLoading"
          @click="loadDiagnostics"
        >
          <IconTablerRefresh class="workspace-diagnostics-refresh-icon" />
          <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="workspace-diagnostics-error">{{ errorMessage }}</p>
    <p v-if="mcpReloadMessage" class="workspace-diagnostics-success">{{ mcpReloadMessage }}</p>

    <div class="workspace-diagnostics-metrics">
      <div class="workspace-diagnostics-metric" :data-tone="serverTone">
        <span class="workspace-diagnostics-metric-value">{{ diagnostics?.appServer.status ?? '-' }}</span>
        <span class="workspace-diagnostics-metric-label">app-server</span>
      </div>
      <div class="workspace-diagnostics-metric">
        <span class="workspace-diagnostics-metric-value">{{ diagnostics?.appServer.pid ?? 'none' }}</span>
        <span class="workspace-diagnostics-metric-label">pid</span>
      </div>
      <div class="workspace-diagnostics-metric" :data-tone="pendingServerRequestCount > 0 ? 'warning' : 'neutral'">
        <span class="workspace-diagnostics-metric-value">{{ pendingServerRequestCount }}</span>
        <span class="workspace-diagnostics-metric-label">approvals</span>
      </div>
      <div class="workspace-diagnostics-metric" :data-tone="failedClientRequestCount > 0 ? 'danger' : 'neutral'">
        <span class="workspace-diagnostics-metric-value">{{ failedClientRequestCount }}</span>
        <span class="workspace-diagnostics-metric-label">rpc failed</span>
      </div>
      <div class="workspace-diagnostics-metric">
        <span class="workspace-diagnostics-metric-value">{{ diagnostics?.methodCatalog.methodCount ?? '-' }}</span>
        <span class="workspace-diagnostics-metric-label">methods</span>
      </div>
      <div class="workspace-diagnostics-metric">
        <span class="workspace-diagnostics-metric-value">{{ diagnostics?.methodCatalog.notificationCount ?? '-' }}</span>
        <span class="workspace-diagnostics-metric-label">notifications</span>
      </div>
      <div class="workspace-diagnostics-metric" :data-tone="mcpFailedCount > 0 ? 'danger' : mcpStartingCount > 0 ? 'warning' : 'neutral'">
        <span class="workspace-diagnostics-metric-value">{{ mcpServers.length }}</span>
        <span class="workspace-diagnostics-metric-label">mcp servers</span>
      </div>
    </div>

    <div class="workspace-diagnostics-columns">
      <section class="workspace-diagnostics-block">
        <h4>Runtime</h4>
        <dl class="workspace-diagnostics-list">
          <div>
            <dt>initialized</dt>
            <dd>{{ diagnostics?.appServer.initialized ? 'yes' : 'no' }}</dd>
          </div>
          <div>
            <dt>started</dt>
            <dd>{{ formatDate(diagnostics?.appServer.startedAtIso) }}</dd>
          </div>
          <div>
            <dt>last exit</dt>
            <dd>{{ formatExit }}</dd>
          </div>
          <div>
            <dt>rpc</dt>
            <dd>{{ rpcSummary }}</dd>
          </div>
        </dl>
      </section>

      <section class="workspace-diagnostics-block">
        <h4>Notification Traffic</h4>
        <ul v-if="notificationRows.length > 0" class="workspace-diagnostics-count-list">
          <li v-for="row in notificationRows" :key="row.method">
            <span>{{ row.method }}</span>
            <code>{{ row.count }}</code>
          </li>
        </ul>
        <p v-else class="workspace-diagnostics-empty">No notifications observed yet.</p>
      </section>
    </div>

    <section v-if="pendingRequests.length > 0" class="workspace-diagnostics-block">
      <h4>Pending Server Requests</h4>
      <ul class="workspace-diagnostics-request-list">
        <li v-for="request in pendingRequests" :key="request.id">
          <span>#{{ request.id }} · {{ request.method }}</span>
          <code>{{ request.threadId || 'global' }} · {{ formatDate(request.receivedAtIso) }}</code>
        </li>
      </ul>
    </section>

    <section class="workspace-diagnostics-block">
      <h4>MCP Servers</h4>
      <p v-if="mcpInventoryError" class="workspace-diagnostics-warning">{{ mcpInventoryError }}</p>
      <ul v-if="mcpServers.length > 0" class="workspace-diagnostics-mcp-list">
        <li v-for="server in mcpServers" :key="server.name" :data-status="server.status">
          <div>
            <span>{{ serverLabel(server) }}</span>
            <code>{{ server.status }} · {{ server.authStatus }} · {{ formatDate(server.updatedAtIso) }}</code>
          </div>
          <p class="workspace-diagnostics-mcp-capabilities">
            {{ server.toolCount }} tools · {{ server.resourceCount }} resources · {{ server.resourceTemplateCount }} templates
          </p>
          <p v-if="server.error">{{ server.error }}</p>
          <p v-else-if="server.threadId">thread {{ server.threadId }}</p>
        </li>
      </ul>
      <p v-else class="workspace-diagnostics-empty">No MCP startup status events observed yet.</p>
    </section>

    <section class="workspace-diagnostics-block">
      <h4>Catalog</h4>
      <p v-if="catalogErrors.length > 0" class="workspace-diagnostics-warning">
        {{ catalogErrors.join(' · ') }}
      </p>
      <div class="workspace-diagnostics-catalog">
        <span v-for="method in methodPreview" :key="method">{{ method }}</span>
      </div>
    </section>

    <section class="workspace-diagnostics-block">
      <h4>Recent Logs</h4>
      <ol v-if="recentLogs.length > 0" class="workspace-diagnostics-log-list">
        <li v-for="log in recentLogs" :key="log.id" :data-level="log.level">
          <div>
            <span>{{ log.source }}</span>
            <time>{{ formatDate(log.createdAtIso) }}</time>
          </div>
          <p>{{ log.message }}</p>
        </li>
      </ol>
      <p v-else class="workspace-diagnostics-empty">No gateway logs captured yet.</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchGatewayDiagnostics, reloadMcpServers } from '../../api/codexRpcClient'
import type { UiGatewayDiagnostics, UiMcpServerDiagnostic } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const diagnostics = ref<UiGatewayDiagnostics | null>(null)
const isLoading = ref(false)
const isReloadingMcp = ref(false)
const errorMessage = ref('')
const mcpReloadMessage = ref('')

const pendingServerRequestCount = computed(() => diagnostics.value?.appServer.pendingServerRequestCount ?? 0)
const failedClientRequestCount = computed(() => diagnostics.value?.appServer.failedClientRequestCount ?? 0)
const pendingRequests = computed(() => diagnostics.value?.appServer.pendingServerRequests ?? [])
const recentLogs = computed(() => diagnostics.value?.appServer.recentLogs.slice(0, 8) ?? [])
const mcpServers = computed(() => {
  const statusRank: Record<string, number> = {
    failed: 0,
    starting: 1,
    cancelled: 2,
    unknown: 3,
    ready: 4,
  }
  return [...(diagnostics.value?.appServer.mcpServers ?? [])]
    .sort((first, second) =>
      (statusRank[first.status] ?? 9) - (statusRank[second.status] ?? 9) ||
      first.name.localeCompare(second.name),
    )
})
const mcpFailedCount = computed(() => mcpServers.value.filter((server) => server.status === 'failed').length)
const mcpStartingCount = computed(() => mcpServers.value.filter((server) => server.status === 'starting').length)
const mcpInventoryError = computed(() => diagnostics.value?.appServer.mcpInventoryError ?? '')
const catalogErrors = computed(() => diagnostics.value?.methodCatalog.errors ?? [])
const methodPreview = computed(() => {
  const methods = diagnostics.value?.methodCatalog.methods ?? []
  const notifications = diagnostics.value?.methodCatalog.notifications ?? []
  return [...methods.slice(0, 8), ...notifications.slice(0, 6)]
})
const notificationRows = computed(() => {
  const counts = diagnostics.value?.appServer.notificationCountsByMethod ?? {}
  return Object.entries(counts)
    .map(([method, count]) => ({ method, count }))
    .sort((first, second) => second.count - first.count || first.method.localeCompare(second.method))
    .slice(0, 6)
})
const serverTone = computed(() => {
  if (!diagnostics.value) return 'neutral'
  return diagnostics.value.appServer.status === 'running' ? 'success' : 'warning'
})
const diagnosticsSummary = computed(() => {
  if (isLoading.value) return 'Loading Codex gateway state...'
  if (!diagnostics.value) return 'Codex app-server state, protocol catalog, requests, and logs.'
  const server = diagnostics.value.appServer
  return `${server.status}${server.initialized ? ' · initialized' : ''} · ${server.notificationCount} notifications · ${server.sentClientRequestCount} rpc calls`
})
const rpcSummary = computed(() => {
  const server = diagnostics.value?.appServer
  if (!server) return '-'
  return `${server.completedClientRequestCount} ok · ${server.failedClientRequestCount} failed · ${server.pendingClientRequestCount} pending`
})
const formatExit = computed(() => {
  const server = diagnostics.value?.appServer
  if (!server?.exitedAtIso) return 'none'
  const reason = server.exitSignal || (server.exitCode !== null ? `code ${server.exitCode}` : 'unknown')
  return `${formatDate(server.exitedAtIso)} · ${reason}`
})

async function loadDiagnostics(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    diagnostics.value = await fetchGatewayDiagnostics()
  } catch (error) {
    diagnostics.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load gateway diagnostics.'
  } finally {
    isLoading.value = false
  }
}

async function reloadMcp(): Promise<void> {
  isReloadingMcp.value = true
  errorMessage.value = ''
  mcpReloadMessage.value = ''
  try {
    await reloadMcpServers()
    mcpReloadMessage.value = 'MCP servers reload requested.'
    await loadDiagnostics()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to reload MCP servers.'
  } finally {
    isReloadingMcp.value = false
  }
}

function serverLabel(server: UiMcpServerDiagnostic): string {
  if (!server.title || server.title === server.name) return server.name
  return `${server.name} · ${server.title}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

watch(
  () => props.cwd,
  () => {
    void loadDiagnostics()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-diagnostics-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-diagnostics-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-diagnostics-actions {
  @apply flex shrink-0 flex-wrap justify-end gap-1.5;
}

.workspace-diagnostics-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-diagnostics-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-diagnostics-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60;
}

.workspace-diagnostics-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-diagnostics-error,
.workspace-diagnostics-warning {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700;
}

.workspace-diagnostics-success {
  @apply m-0 mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700;
}

.workspace-diagnostics-metrics {
  @apply mt-3 grid grid-cols-7 gap-1.5;
}

.workspace-diagnostics-metric {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-diagnostics-metric[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-diagnostics-metric[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-diagnostics-metric[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-diagnostics-metric-value {
  @apply block truncate text-sm font-semibold leading-5 text-zinc-950;
}

.workspace-diagnostics-metric-label {
  @apply block truncate text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-diagnostics-columns {
  @apply mt-3 grid grid-cols-2 gap-3;
}

.workspace-diagnostics-block {
  @apply mt-3 min-w-0;
}

.workspace-diagnostics-columns .workspace-diagnostics-block {
  @apply mt-0;
}

.workspace-diagnostics-block h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-diagnostics-list {
  @apply m-0 mt-2 grid grid-cols-2 gap-1.5;
}

.workspace-diagnostics-list div {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-diagnostics-list dt {
  @apply text-[0.65rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-diagnostics-list dd {
  @apply m-0 truncate text-xs font-semibold text-zinc-900;
}

.workspace-diagnostics-count-list,
.workspace-diagnostics-mcp-list,
.workspace-diagnostics-request-list,
.workspace-diagnostics-log-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-diagnostics-count-list li,
.workspace-diagnostics-request-list li {
  @apply grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-diagnostics-mcp-list li {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-diagnostics-mcp-list li[data-status='ready'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-diagnostics-mcp-list li[data-status='starting'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-diagnostics-mcp-list li[data-status='failed'],
.workspace-diagnostics-mcp-list li[data-status='cancelled'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-diagnostics-mcp-list div {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2;
}

.workspace-diagnostics-count-list span,
.workspace-diagnostics-mcp-list span,
.workspace-diagnostics-request-list span {
  @apply truncate text-xs font-semibold text-zinc-900;
}

.workspace-diagnostics-count-list code,
.workspace-diagnostics-mcp-list code,
.workspace-diagnostics-request-list code {
  @apply truncate font-mono text-[0.68rem] text-zinc-500;
}

.workspace-diagnostics-mcp-list p {
  @apply m-0 mt-1 break-words text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-diagnostics-mcp-list .workspace-diagnostics-mcp-capabilities {
  @apply font-mono text-zinc-500;
}

.workspace-diagnostics-catalog {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-diagnostics-catalog span {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[0.68rem] text-zinc-600;
}

.workspace-diagnostics-log-list li {
  @apply rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-diagnostics-log-list li[data-level='warning'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-diagnostics-log-list li[data-level='error'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-diagnostics-log-list div {
  @apply flex items-center justify-between gap-2;
}

.workspace-diagnostics-log-list span {
  @apply text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-diagnostics-log-list time {
  @apply shrink-0 text-[0.68rem] text-zinc-500;
}

.workspace-diagnostics-log-list p,
.workspace-diagnostics-empty {
  @apply m-0 mt-1 break-words text-xs leading-4 text-zinc-600;
}

@media (max-width: 900px) {
  .workspace-diagnostics-metrics {
    @apply grid-cols-2;
  }

  .workspace-diagnostics-columns {
    @apply grid-cols-1;
  }
}
</style>
