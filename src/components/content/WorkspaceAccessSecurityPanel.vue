<template>
  <section class="workspace-access-security-panel" aria-label="Access security">
    <header class="workspace-access-security-header">
      <div>
        <h3 class="workspace-access-security-title">Access Security</h3>
        <p class="workspace-access-security-subtitle">{{ summaryText }}</p>
      </div>
      <button
        class="workspace-access-security-refresh"
        type="button"
        :disabled="isLoading"
        @click="loadSecurityAccess"
      >
        Refresh
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-access-security-error">{{ errorMessage }}</p>

    <div v-if="snapshot" class="workspace-access-security-metrics">
      <span :data-tone="snapshot.auth.enabled ? 'success' : 'danger'">
        auth {{ snapshot.auth.enabled ? 'on' : 'off' }}
      </span>
      <span :data-tone="sessionTone">
        session {{ sessionLabel }}
      </span>
      <span :data-tone="deviceTone">
        device {{ deviceLabel }}
      </span>
      <span :data-tone="networkTone">
        {{ snapshot.network.listenExposure }}
      </span>
    </div>

    <dl v-if="snapshot" class="workspace-access-security-details">
      <div>
        <dt>request</dt>
        <dd>{{ snapshot.network.requestHost || 'unknown' }}</dd>
      </div>
      <div>
        <dt>listen</dt>
        <dd>{{ listenLabel }}</dd>
      </div>
      <div v-if="session?.deviceId">
        <dt>device</dt>
        <dd>{{ session.deviceId }}</dd>
      </div>
      <div v-if="session?.expiresAtIso">
        <dt>expires</dt>
        <dd>{{ formatDate(session.expiresAtIso) }}</dd>
      </div>
    </dl>

    <div
      v-if="snapshot?.auth.enabled && session?.authenticated"
      class="workspace-access-security-actions"
    >
      <button
        v-if="!session.trustedDevice"
        type="button"
        :disabled="isUpdatingTrust"
        data-tone="primary"
        @click="trustDevice"
      >
        {{ isUpdatingTrust ? 'Trusting' : 'Trust device' }}
      </button>
      <button
        v-else
        type="button"
        :disabled="isUpdatingTrust"
        data-tone="danger"
        @click="revokeDevice"
      >
        {{ isUpdatingTrust ? 'Revoking' : 'Revoke trust' }}
      </button>
    </div>

    <ul v-if="trustedDevices.length > 0" class="workspace-access-security-device-list">
      <li v-for="device in trustedDevices" :key="device.deviceId" :data-current="device.current">
        <span>{{ device.current ? 'Current trusted device' : 'Trusted device' }}</span>
        <code>{{ device.deviceId }}</code>
        <small>{{ formatDate(device.trustedAtIso) }}</small>
      </li>
    </ul>

    <ol v-if="snapshot?.risks.length" class="workspace-access-security-risk-list">
      <li
        v-for="risk in snapshot.risks"
        :key="risk.id"
        :data-level="risk.level"
      >
        <span>{{ risk.title }}</span>
        <p>{{ risk.summary }}</p>
      </li>
    </ol>

    <details v-if="snapshot" class="workspace-access-security-guide">
      <summary>HTTPS and proxy guidance</summary>
      <ul>
        <li v-for="item in snapshot.guide" :key="item.title">
          <span>{{ item.title }}</span>
          <p>{{ item.body }}</p>
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchAuthSessionSnapshot,
  fetchSecurityAccessSnapshot,
  fetchTrustedDevices,
  revokeCurrentDeviceTrust,
  trustCurrentDevice,
} from '../../api/codexGatewayStatusClient'
import type { UiAuthSessionSnapshot, UiSecurityAccessSnapshot, UiTrustedDevice } from '../../types/codex'

const snapshot = ref<UiSecurityAccessSnapshot | null>(null)
const session = ref<UiAuthSessionSnapshot | null>(null)
const trustedDevices = ref<UiTrustedDevice[]>([])
const isLoading = ref(false)
const isUpdatingTrust = ref(false)
const errorMessage = ref('')

const summaryText = computed(() => {
  if (isLoading.value) return 'Checking browser access posture...'
  if (!snapshot.value) return 'Auth, session, and remote exposure status.'
  const highest = snapshot.value.risks.some((risk) => risk.level === 'danger')
    ? 'danger'
    : snapshot.value.risks.some((risk) => risk.level === 'warning')
      ? 'warning'
      : 'local'
  return highest === 'danger'
    ? 'Remote access needs attention.'
    : highest === 'warning'
      ? 'Review remote access posture.'
      : 'Local access posture looks constrained.'
})

const sessionLabel = computed(() => {
  if (!snapshot.value?.auth.enabled) return 'not required'
  if (!session.value) return 'unknown'
  return session.value.authenticated ? 'active' : 'signed out'
})

const sessionTone = computed(() => {
  if (!snapshot.value?.auth.enabled) return 'danger'
  if (!session.value) return 'warning'
  return session.value.authenticated ? 'success' : 'danger'
})

const networkTone = computed(() => {
  if (!snapshot.value) return 'neutral'
  if (snapshot.value.network.listenExposure === 'loopback') return 'success'
  if (snapshot.value.network.listenExposure === 'unknown') return 'neutral'
  return 'danger'
})

const deviceLabel = computed(() => {
  if (!snapshot.value?.auth.enabled) return 'not used'
  if (!session.value?.authenticated) return 'unknown'
  return session.value.trustedDevice ? 'trusted' : 'untrusted'
})

const deviceTone = computed(() => {
  if (!snapshot.value?.auth.enabled) return 'neutral'
  if (!session.value?.authenticated) return 'warning'
  return session.value.trustedDevice ? 'success' : 'warning'
})

const listenLabel = computed(() => {
  if (!snapshot.value) return 'unknown'
  const host = snapshot.value.network.listenHost || 'unknown'
  const port = snapshot.value.network.listenPort === null ? '' : `:${String(snapshot.value.network.listenPort)}`
  return `${host}${port}`
})

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function loadSecurityAccess(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await fetchSecurityAccessSnapshot()
    try {
      session.value = await fetchAuthSessionSnapshot()
      trustedDevices.value = session.value.authenticated
        ? (await fetchTrustedDevices()).devices
        : []
    } catch {
      session.value = null
      trustedDevices.value = []
    }
  } catch (error) {
    snapshot.value = null
    session.value = null
    trustedDevices.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Failed to inspect access security.'
  } finally {
    isLoading.value = false
  }
}

async function trustDevice(): Promise<void> {
  if (isUpdatingTrust.value) return
  isUpdatingTrust.value = true
  errorMessage.value = ''
  try {
    await trustCurrentDevice()
    await loadSecurityAccess()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to trust this device.'
  } finally {
    isUpdatingTrust.value = false
  }
}

async function revokeDevice(): Promise<void> {
  if (isUpdatingTrust.value) return
  isUpdatingTrust.value = true
  errorMessage.value = ''
  try {
    await revokeCurrentDeviceTrust()
    await loadSecurityAccess()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to revoke device trust.'
  } finally {
    isUpdatingTrust.value = false
  }
}

onMounted(() => {
  void loadSecurityAccess()
})
</script>

<style scoped>
@reference "tailwindcss";

.workspace-access-security-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-access-security-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-access-security-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-access-security-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-access-security-refresh {
  @apply inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-200 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60;
}

.workspace-access-security-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-access-security-metrics {
  @apply mt-2 grid grid-cols-2 gap-1.5;
}

.workspace-access-security-metrics span {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600;
}

.workspace-access-security-metrics span[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.workspace-access-security-metrics span[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50 text-amber-800;
}

.workspace-access-security-metrics span[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.workspace-access-security-details {
  @apply m-0 mt-2 grid gap-1;
}

.workspace-access-security-details div {
  @apply grid grid-cols-[4rem_minmax(0,1fr)] gap-2;
}

.workspace-access-security-details dt {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
}

.workspace-access-security-details dd {
  @apply m-0 min-w-0 truncate font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-access-security-actions {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-access-security-actions button {
  @apply inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60;
}

.workspace-access-security-actions button[data-tone='primary'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100;
}

.workspace-access-security-actions button[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100;
}

.workspace-access-security-device-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-access-security-device-list li {
  @apply grid gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700;
}

.workspace-access-security-device-list li[data-current='true'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-800;
}

.workspace-access-security-device-list span {
  @apply font-semibold;
}

.workspace-access-security-device-list code,
.workspace-access-security-device-list small {
  @apply min-w-0 truncate font-mono text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-access-security-risk-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-access-security-risk-list li {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700;
}

.workspace-access-security-risk-list li[data-level='warning'] {
  @apply border-amber-200 bg-amber-50 text-amber-800;
}

.workspace-access-security-risk-list li[data-level='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.workspace-access-security-risk-list span,
.workspace-access-security-guide span {
  @apply font-semibold;
}

.workspace-access-security-risk-list p,
.workspace-access-security-guide p {
  @apply m-0 mt-0.5 leading-4;
}

.workspace-access-security-guide {
  @apply mt-2 border-t border-zinc-200 pt-2 text-xs text-zinc-600;
}

.workspace-access-security-guide summary {
  @apply cursor-pointer font-medium;
}

.workspace-access-security-guide ul {
  @apply m-0 mt-1 grid list-none gap-1.5 p-0;
}
</style>
