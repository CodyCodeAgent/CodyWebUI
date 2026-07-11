<template>
  <section class="workspace-ports-panel" aria-label="Ports and previews">
    <header class="workspace-ports-panel-header">
      <div>
        <h3 class="workspace-ports-panel-title">Ports & Preview</h3>
        <p class="workspace-ports-panel-subtitle">{{ portSummary }}</p>
      </div>
      <button
        class="workspace-ports-panel-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadPorts"
      >
        <IconTablerRefresh class="workspace-ports-panel-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-ports-panel-error">{{ errorMessage }}</p>

    <ul v-if="warnings.length > 0" class="workspace-ports-panel-warning-list">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <section v-if="snapshot" class="workspace-ports-panel-policy">
      <span>Port policy</span>
      <small>{{ portPolicySummary }}</small>
    </section>

    <div class="workspace-ports-panel-preview-controls" role="group" aria-label="Preview viewport">
      <button
        v-for="preset in previewViewportPresets"
        :key="preset.id"
        type="button"
        :data-active="selectedViewportId === preset.id"
        @click="selectedViewportId = preset.id"
      >
        <span>{{ preset.label }}</span>
        <small>{{ preset.width }}x{{ preset.height }}</small>
      </button>
    </div>

    <ul v-if="knownPorts.length > 0" class="workspace-ports-panel-known-list">
      <li
        v-for="port in knownPorts"
        :key="`${port.name}:${port.port}`"
        :data-required="port.required"
        :data-listening="isKnownPortListening(port.port)"
      >
        <div>
          <span>{{ port.name }}</span>
          <small>:{{ port.port }} · {{ port.required ? 'required' : 'known' }}</small>
        </div>
        <div class="workspace-ports-panel-actions">
          <button
            v-if="port.url"
            type="button"
            :disabled="isProbing"
            @click="probePreview(port.url)"
          >
            Probe
          </button>
          <button
            v-if="port.url"
            type="button"
            :disabled="isCapturing"
            @click="capturePreview(port.url)"
          >
            Shot
          </button>
          <a v-if="port.url" :href="port.url" target="_blank" rel="noreferrer">Open</a>
        </div>
      </li>
    </ul>

    <section v-if="previewProbe" class="workspace-ports-panel-probe" :data-status="previewProbe.status">
      <header>
        <span>{{ previewProbe.status === 'passed' ? 'Preview probe passed' : 'Preview probe failed' }}</span>
        <small>{{ previewProbe.statusCode ?? 'network' }} · {{ previewProbe.durationMs }}ms</small>
      </header>
      <p class="workspace-ports-panel-probe-url">{{ previewProbe.url }}</p>
      <p v-if="previewProbe.title" class="workspace-ports-panel-probe-title">{{ previewProbe.title }}</p>
      <p v-if="previewProbe.bodyPreview" class="workspace-ports-panel-probe-body">{{ previewProbe.bodyPreview }}</p>
      <p v-if="previewProbe.errorMessage" class="workspace-ports-panel-probe-error">{{ previewProbe.errorMessage }}</p>
      <ul v-if="previewProbe.warnings.length > 0">
        <li v-for="warning in previewProbe.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </section>

    <ul v-if="ports.length > 0" class="workspace-ports-panel-list">
      <li
        v-for="port in visiblePorts"
        :key="`${port.pid}:${port.host}:${port.port}`"
        :data-port="port.port"
        :data-exposure="port.exposure"
      >
        <div class="workspace-ports-panel-port">
          <span>{{ port.port }}</span>
          <small>{{ port.exposure }}</small>
        </div>
        <div class="workspace-ports-panel-process">
          <span>{{ port.processName }}</span>
          <small>pid {{ port.pid }} · {{ port.address }}</small>
        </div>
        <div class="workspace-ports-panel-policy-cell" :data-status="port.policy.status">
          <span>{{ portPolicyLabel(port) }}</span>
          <small>{{ port.policy.matchedRule || port.policy.reason }}</small>
        </div>
        <div class="workspace-ports-panel-actions">
          <button
            type="button"
            :disabled="isProbing"
            @click="probePreview(port.url)"
          >
            {{ isProbing && probingUrl === port.url ? 'Probing' : 'Probe' }}
          </button>
          <button
            type="button"
            :disabled="isCapturing"
            @click="capturePreview(port.url)"
          >
            {{ isCapturing && capturingUrl === port.url ? 'Capturing' : 'Shot' }}
          </button>
          <a :href="port.url" target="_blank" rel="noreferrer">Open</a>
        </div>
      </li>
    </ul>
    <p v-if="hiddenPortCount > 0" class="workspace-ports-panel-more">
      {{ hiddenPortCount }} more listening port{{ hiddenPortCount === 1 ? '' : 's' }} hidden.
    </p>
    <p v-if="ports.length === 0" class="workspace-ports-panel-empty">No listening TCP ports detected.</p>

    <section v-if="previewScreenshot" class="workspace-ports-panel-screenshot" :data-source="previewScreenshot.source">
      <header>
        <span>{{ previewScreenshot.source === 'browser' ? 'Preview screenshot' : 'Preview evidence card' }}</span>
        <small>{{ previewScreenshot.width }}x{{ previewScreenshot.height }} · {{ previewScreenshot.durationMs }}ms</small>
      </header>
      <p>{{ previewScreenshot.url }}</p>
      <img :src="previewScreenshot.dataUrl" :alt="previewScreenshot.title || 'Preview screenshot'" />
      <p v-if="previewScreenshot.errorMessage" class="workspace-ports-panel-probe-error">{{ previewScreenshot.errorMessage }}</p>
      <ul v-if="previewScreenshot.warnings.length > 0">
        <li v-for="warning in previewScreenshot.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { captureWorkspacePreviewScreenshot, fetchWorkspacePorts, probeWorkspacePreview } from '../../api/codexWorkspaceResourcesClient'
import type { UiListeningPort, UiPortsSnapshot, UiPreviewProbe, UiPreviewScreenshot, UiWorkspaceKnownPort } from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const MAX_VISIBLE_PORTS = 16
const previewViewportPresets = [
  { id: 'desktop', label: 'Desktop', width: 1280, height: 800 },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1112 },
  { id: 'mobile', label: 'Mobile', width: 390, height: 844 },
] as const

type PreviewViewportId = (typeof previewViewportPresets)[number]['id']

const props = defineProps<{
  cwd: string
}>()

const snapshot = ref<UiPortsSnapshot | null>(null)
const previewProbe = ref<UiPreviewProbe | null>(null)
const previewScreenshot = ref<UiPreviewScreenshot | null>(null)
const isLoading = ref(false)
const isProbing = ref(false)
const isCapturing = ref(false)
const probingUrl = ref('')
const capturingUrl = ref('')
const errorMessage = ref('')
const selectedViewportId = ref<PreviewViewportId>('desktop')

const ports = computed<UiListeningPort[]>(() => snapshot.value?.ports ?? [])
const knownPorts = computed<UiWorkspaceKnownPort[]>(() => snapshot.value?.knownPorts ?? [])
const visiblePorts = computed(() => ports.value.slice(0, MAX_VISIBLE_PORTS))
const hiddenPortCount = computed(() => Math.max(0, ports.value.length - visiblePorts.value.length))
const warnings = computed(() => snapshot.value?.warnings ?? [])
const selectedViewport = computed(() =>
  previewViewportPresets.find((preset) => preset.id === selectedViewportId.value) ?? previewViewportPresets[0])
const portPolicySummary = computed(() => {
  const policy = snapshot.value?.policy
  if (!policy) return 'No workspace policy loaded.'
  const rules = [
    policy.allow.length > 0 ? `allow ${policy.allow.join(', ')}` : '',
    policy.deny.length > 0 ? `deny ${policy.deny.join(', ')}` : '',
    policy.allowWildcard ? 'wildcard allowed' : 'wildcard blocked',
    policy.allowExternal ? 'external allowed' : 'external blocked',
  ].filter(Boolean)
  return rules.length > 0 ? rules.join(' · ') : 'No explicit port allow/deny rules.'
})
const portSummary = computed(() => {
  const count = ports.value.length
  if (count === 0 && knownPorts.value.length > 0) {
    return `${String(knownPorts.value.length)} configured, none listening.`
  }
  if (count === 0) return 'No active previews detected.'
  const wildcardCount = ports.value.filter((port) => port.exposure !== 'loopback').length
  return wildcardCount > 0
    ? `${String(count)} listening, ${String(wildcardCount)} exposed`
    : `${String(count)} listening on localhost`
})

function isKnownPortListening(port: number): boolean {
  return ports.value.some((candidate) => candidate.port === port)
}

function portPolicyLabel(port: UiListeningPort): string {
  if (port.policy.status === 'allowed') return 'policy allowed'
  if (port.policy.status === 'denied') return 'policy denied'
  return 'policy unset'
}

async function loadPorts(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    snapshot.value = null
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchWorkspacePorts(cwd)
  } catch (error) {
    snapshot.value = null
    errorMessage.value = error instanceof Error ? error.message : 'Failed to inspect listening ports.'
  } finally {
    isLoading.value = false
  }
}

async function probePreview(url: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd || !url || isProbing.value) return

  isProbing.value = true
  probingUrl.value = url
  errorMessage.value = ''
  try {
    previewProbe.value = await probeWorkspacePreview(cwd, url)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to probe preview.'
  } finally {
    isProbing.value = false
    probingUrl.value = ''
  }
}

async function capturePreview(url: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd || !url || isCapturing.value) return

  isCapturing.value = true
  capturingUrl.value = url
  errorMessage.value = ''
  try {
    const viewport = selectedViewport.value
    previewScreenshot.value = await captureWorkspacePreviewScreenshot(cwd, url, {
      width: viewport.width,
      height: viewport.height,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to capture preview screenshot.'
  } finally {
    isCapturing.value = false
    capturingUrl.value = ''
  }
}

watch(
  () => props.cwd,
  () => {
    previewProbe.value = null
    previewScreenshot.value = null
    void loadPorts()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "../../style.css";

.workspace-ports-panel {
  @apply rounded-lg border theme-border theme-bg-panel p-3;
}

.workspace-ports-panel-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-ports-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal theme-muted;
}

.workspace-ports-panel-subtitle {
  @apply m-0 mt-1 text-xs theme-muted;
}

.workspace-ports-panel-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border theme-border theme-bg-panel px-2.5 text-xs font-medium theme-muted transition hover:theme-bg-subtle disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-ports-panel-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-ports-panel-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-3 py-2 text-xs theme-text-danger;
}

.workspace-ports-panel-warning-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-ports-panel-warning-list li {
  @apply rounded-md border theme-border-warning theme-bg-warning-soft px-2 py-1.5 text-xs leading-4 theme-text-warning;
}

.workspace-ports-panel-policy {
  @apply mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.workspace-ports-panel-policy span {
  @apply text-xs font-semibold theme-text;
}

.workspace-ports-panel-policy small {
  @apply truncate text-right font-mono text-[0.68rem] leading-4 theme-muted;
}

.workspace-ports-panel-preview-controls {
  @apply mt-2 grid grid-cols-3 overflow-hidden rounded-md border theme-border theme-bg-subtle;
}

.workspace-ports-panel-preview-controls button {
  @apply grid min-w-0 gap-0.5 border-0 border-r theme-border bg-transparent px-2 py-1.5 text-left text-xs theme-muted transition last:border-r-0 hover:theme-bg-panel;
}

.workspace-ports-panel-preview-controls button[data-active='true'] {
  @apply theme-bg-panel theme-text shadow-sm;
}

.workspace-ports-panel-preview-controls span,
.workspace-ports-panel-preview-controls small {
  @apply block truncate;
}

.workspace-ports-panel-preview-controls span {
  @apply font-semibold;
}

.workspace-ports-panel-preview-controls small {
  @apply font-mono text-[0.68rem] theme-muted;
}

.workspace-ports-panel-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-ports-panel-known-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-ports-panel-known-list li {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.workspace-ports-panel-known-list li[data-required='true'][data-listening='false'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-ports-panel-known-list span {
  @apply block truncate text-xs font-semibold theme-text;
}

.workspace-ports-panel-known-list small {
  @apply block truncate font-mono text-[0.68rem] leading-4 theme-muted;
}

.workspace-ports-panel-list li {
  @apply grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(8rem,12rem)_auto] items-center gap-2 rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.workspace-ports-panel-list li[data-exposure='wildcard'],
.workspace-ports-panel-list li[data-exposure='external'] {
  @apply theme-border-warning theme-bg-warning-soft;
}

.workspace-ports-panel-list li:has(.workspace-ports-panel-policy-cell[data-status='denied']) {
  @apply theme-border-danger theme-bg-danger-soft;
}

.workspace-ports-panel-port,
.workspace-ports-panel-process,
.workspace-ports-panel-policy-cell {
  @apply min-w-0;
}

.workspace-ports-panel-port span,
.workspace-ports-panel-process span,
.workspace-ports-panel-policy-cell span {
  @apply block truncate text-xs font-semibold theme-text;
}

.workspace-ports-panel-port small,
.workspace-ports-panel-process small,
.workspace-ports-panel-policy-cell small {
  @apply block truncate font-mono text-[0.68rem] leading-4 theme-muted;
}

.workspace-ports-panel-policy-cell[data-status='allowed'] span {
  @apply theme-text-success;
}

.workspace-ports-panel-policy-cell[data-status='denied'] span {
  @apply theme-text-danger;
}

.workspace-ports-panel-actions {
  @apply flex shrink-0 items-center gap-1.5;
}

.workspace-ports-panel-list a,
.workspace-ports-panel-known-list a,
.workspace-ports-panel-actions button {
  @apply inline-flex h-7 shrink-0 items-center rounded-md border theme-border theme-bg-panel px-2 text-[0.68rem] font-semibold theme-muted no-underline transition hover:theme-bg-control;
}

.workspace-ports-panel-actions button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.workspace-ports-panel-probe {
  @apply mt-2 rounded-md border theme-border theme-bg-subtle px-3 py-2 text-xs theme-muted;
}

.workspace-ports-panel-screenshot {
  @apply mt-2 rounded-md border theme-border theme-bg-subtle px-3 py-2 text-xs theme-muted;
}

.workspace-ports-panel-probe[data-status='passed'] {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
}

.workspace-ports-panel-screenshot[data-source='browser'] {
  @apply theme-border-success theme-bg-success-soft theme-text-success;
}

.workspace-ports-panel-screenshot[data-source='evidence-card'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-ports-panel-probe[data-status='failed'] {
  @apply theme-border-warning theme-bg-warning-soft theme-text-warning;
}

.workspace-ports-panel-probe header,
.workspace-ports-panel-screenshot header {
  @apply flex items-center justify-between gap-2;
}

.workspace-ports-panel-probe header span,
.workspace-ports-panel-screenshot header span {
  @apply font-semibold;
}

.workspace-ports-panel-probe header small,
.workspace-ports-panel-screenshot header small,
.workspace-ports-panel-probe-url {
  @apply font-mono text-[0.68rem];
}

.workspace-ports-panel-screenshot p,
.workspace-ports-panel-probe-url,
.workspace-ports-panel-probe-title,
.workspace-ports-panel-probe-body,
.workspace-ports-panel-probe-error {
  @apply m-0 mt-1 break-words;
}

.workspace-ports-panel-probe-body {
  @apply theme-muted;
}

.workspace-ports-panel-screenshot img {
  @apply mt-2 block max-h-[28rem] w-full rounded-md border theme-border theme-bg-panel object-contain;
}

.workspace-ports-panel-probe ul,
.workspace-ports-panel-screenshot ul {
  @apply m-0 mt-1 grid list-none gap-1 p-0;
}

.workspace-ports-panel-empty {
  @apply m-0 mt-2 rounded-md border border-dashed theme-border px-3 py-2 text-xs theme-muted;
}

.workspace-ports-panel-more {
  @apply m-0 mt-2 rounded-md border theme-border theme-bg-subtle px-3 py-2 text-xs theme-muted;
}

@media (max-width: 760px) {
  .workspace-ports-panel-list li {
    @apply grid-cols-[4.5rem_minmax(0,1fr)];
  }

  .workspace-ports-panel-policy-cell {
    @apply col-span-2;
  }

  .workspace-ports-panel-list a {
    @apply justify-center;
  }

  .workspace-ports-panel-actions {
    @apply col-span-2 justify-end;
  }
}
</style>
