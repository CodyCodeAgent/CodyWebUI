<template>
  <section class="workspace-approval-center" aria-label="Workspace approval center">
    <header class="workspace-approval-center-header">
      <div>
        <h3 class="workspace-approval-center-title">Approval Center</h3>
        <p class="workspace-approval-center-subtitle">{{ summaryText }}</p>
      </div>
      <span class="workspace-approval-center-badge" :data-tone="highRiskCount > 0 ? 'high' : pendingRequests.length > 0 ? 'medium' : 'low'">
        {{ pendingRequests.length }}
      </span>
    </header>

    <ul v-if="pendingRequests.length > 0" class="workspace-approval-center-list">
      <li
        v-for="request in pendingRequests"
        :key="request.id"
        class="workspace-approval-center-card"
        :data-risk="approvalSummary(request).level"
      >
        <div class="workspace-approval-center-main">
          <p class="workspace-approval-center-card-title">{{ approvalSummary(request).title }}</p>
          <p class="workspace-approval-center-meta">
            #{{ request.id }} · {{ request.threadId || 'global' }} · {{ formatIsoTime(request.receivedAtIso) }}
          </p>
          <p class="workspace-approval-center-subject">{{ approvalSummary(request).subject }}</p>
          <div class="workspace-approval-center-risk-line">
            <span class="workspace-approval-center-risk-badge" :data-level="approvalSummary(request).level">
              {{ approvalSummary(request).level }}
            </span>
            <span
              v-for="label in approvalSummary(request).riskLabels"
              :key="`${request.id}:${label}`"
              class="workspace-approval-center-risk-label"
            >
              {{ label }}
            </span>
          </div>
          <p class="workspace-approval-center-description">{{ approvalSummary(request).description }}</p>
          <p
            v-if="request.commandPolicy"
            class="workspace-approval-center-policy"
            :data-status="request.commandPolicy.status"
          >
            policy {{ request.commandPolicy.status }}{{ request.commandPolicy.matchedPattern ? ` · ${request.commandPolicy.matchedPattern}` : '' }} · {{ request.commandPolicy.reason }}
          </p>
          <p
            v-if="request.fileChangePolicy"
            class="workspace-approval-center-policy"
            :data-status="request.fileChangePolicy.status"
          >
            file policy {{ request.fileChangePolicy.status }}{{ request.fileChangePolicy.matchedPattern ? ` · ${request.fileChangePolicy.matchedPattern}` : '' }} · {{ request.fileChangePolicy.reason }}
          </p>
          <ul class="workspace-approval-center-impact-list">
            <li v-for="impact in approvalSummary(request).impacts" :key="`${request.id}:${impact}`">
              {{ impact }}
            </li>
          </ul>
          <div class="workspace-approval-center-scope-line" aria-label="Approval scopes">
            <span
              v-for="scope in approvalScopeOptions"
              :key="`${request.id}:${scope.scope}`"
              class="workspace-approval-center-scope"
              :data-enabled="scope.enabled"
              :title="scope.description"
            >
              {{ scope.label }}
            </span>
          </div>
          <p class="workspace-approval-center-recommendation">{{ approvalSummary(request).recommendation }}</p>
        </div>

        <div class="workspace-approval-center-actions">
          <button
            v-if="request.threadId"
            type="button"
            @click="$emit('selectThread', request.threadId)"
          >
            Open
          </button>
          <template v-if="isApprovalRequest(request)">
            <button
              v-for="scope in approvalScopeOptions"
              :key="`${request.id}:action:${scope.scope}`"
              type="button"
              :data-tone="scope.scope === 'single' ? 'primary' : scope.scope === 'permanent' ? 'danger-soft' : undefined"
              @click="respondApprovalScope(request.id, scope.scope)"
            >
              {{ scope.label }}
            </button>
            <button type="button" data-tone="danger" @click="respondApproval(request.id, 'decline')">
              Decline
            </button>
          </template>
          <template v-else>
            <button type="button" data-tone="primary" @click="respondEmptyResult(request.id)">
              Empty result
            </button>
            <button type="button" data-tone="danger" @click="rejectRequest(request.id)">
              Reject
            </button>
          </template>
        </div>
      </li>
    </ul>

    <p v-else class="workspace-approval-center-empty">No pending approvals.</p>

    <section class="workspace-approval-center-grants" aria-label="Stored approval grants">
      <header class="workspace-approval-center-grants-header">
        <div>
          <h4>Stored grants</h4>
          <p>{{ grantSummaryText }}</p>
        </div>
        <button type="button" :disabled="isLoadingGrants || !cwd" @click="loadGrants">
          Refresh
        </button>
      </header>
      <p v-if="grantError" class="workspace-approval-center-error">{{ grantError }}</p>
      <ul v-if="approvalGrants.length > 0" class="workspace-approval-center-grant-list">
        <li v-for="grant in approvalGrants" :key="grant.id" class="workspace-approval-center-grant" :data-scope="grant.scope">
          <div>
            <span>{{ grant.scope }}</span>
            <code>{{ grant.subject }}</code>
            <small>{{ grant.method }} · {{ formatIsoTime(grant.createdAtIso) }}</small>
          </div>
          <button type="button" :disabled="isRevokingGrant === grant.id" @click="revokeGrant(grant.id)">
            Revoke
          </button>
        </li>
      </ul>
      <p v-else class="workspace-approval-center-empty">No stored approval grants.</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchApprovalGrants, revokeApprovalGrant } from '../../api/codexRpcClient'
import {
  APPROVAL_SCOPE_OPTIONS,
  approvalDecisionForScope,
  approvalScopeForDecision,
  buildApprovalRiskSummary,
  type UiApprovalDecision,
} from '../../composables/useApprovalRisk'
import type { UiApprovalDecisionScope, UiApprovalGrant, UiServerRequest, UiServerRequestReply } from '../../types/codex'

const props = defineProps<{
  cwd: string
  pendingRequests: UiServerRequest[]
}>()

const emit = defineEmits<{
  respondServerRequest: [payload: UiServerRequestReply]
  selectThread: [threadId: string]
}>()
const approvalScopeOptions = APPROVAL_SCOPE_OPTIONS
const approvalGrants = ref<UiApprovalGrant[]>([])
const isLoadingGrants = ref(false)
const isRevokingGrant = ref('')
const grantError = ref('')

const highRiskCount = computed(() => props.pendingRequests
  .filter((request) => approvalSummary(request).level === 'high')
  .length)
const mediumRiskCount = computed(() => props.pendingRequests
  .filter((request) => approvalSummary(request).level === 'medium')
  .length)
const summaryText = computed(() => {
  if (props.pendingRequests.length === 0) {
    return 'No local command, file, or tool approvals are waiting.'
  }
  return `${String(highRiskCount.value)} high risk · ${String(mediumRiskCount.value)} medium · respond without leaving the workspace`
})
const grantSummaryText = computed(() => {
  if (!props.cwd) return 'Choose a workspace to inspect reusable approvals.'
  if (approvalGrants.value.length === 0) return 'Exact-match workspace and permanent grants will appear here.'
  const permanentCount = approvalGrants.value.filter((grant) => grant.scope === 'permanent').length
  return `${String(approvalGrants.value.length)} active · ${String(permanentCount)} permanent`
})

function approvalSummary(request: UiServerRequest) {
  return buildApprovalRiskSummary(request)
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return (
    request.method === 'item/commandExecution/requestApproval' ||
    request.method === 'item/fileChange/requestApproval'
  )
}

function respondApproval(requestId: number, decision: UiApprovalDecision): void {
  emit('respondServerRequest', {
    id: requestId,
    approvalScope: approvalScopeForDecision(decision),
    result: { decision },
  })
}

function respondApprovalScope(requestId: number, scope: UiApprovalDecisionScope): void {
  emit('respondServerRequest', {
    id: requestId,
    approvalScope: scope,
    result: { decision: approvalDecisionForScope(scope) },
  })
}

function respondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function rejectRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local approval center.',
    },
  })
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function loadGrants(): Promise<void> {
  if (!props.cwd) return
  isLoadingGrants.value = true
  grantError.value = ''
  try {
    approvalGrants.value = (await fetchApprovalGrants(props.cwd)).grants
  } catch (error) {
    grantError.value = error instanceof Error ? error.message : 'Failed to load approval grants.'
  } finally {
    isLoadingGrants.value = false
  }
}

async function revokeGrant(grantId: string): Promise<void> {
  if (!props.cwd) return
  isRevokingGrant.value = grantId
  grantError.value = ''
  try {
    approvalGrants.value = (await revokeApprovalGrant(props.cwd, grantId)).grants
  } catch (error) {
    grantError.value = error instanceof Error ? error.message : 'Failed to revoke approval grant.'
  } finally {
    isRevokingGrant.value = ''
  }
}

onMounted(() => {
  void loadGrants()
})

watch(() => props.cwd, () => {
  approvalGrants.value = []
  void loadGrants()
})
</script>

<style scoped>
@reference "tailwindcss";

.workspace-approval-center {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-approval-center-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-approval-center-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-approval-center-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-approval-center-badge {
  @apply inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-700;
}

.workspace-approval-center-badge[data-tone='medium'] {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.workspace-approval-center-badge[data-tone='high'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.workspace-approval-center-list {
  @apply m-0 mt-2 grid list-none gap-2 p-0;
}

.workspace-approval-center-card {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-approval-center-card[data-risk='medium'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-approval-center-card[data-risk='high'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-approval-center-main {
  @apply min-w-0;
}

.workspace-approval-center-card-title,
.workspace-approval-center-subject,
.workspace-approval-center-description,
.workspace-approval-center-recommendation,
.workspace-approval-center-meta {
  @apply m-0;
}

.workspace-approval-center-card-title {
  @apply text-xs font-semibold text-zinc-900;
}

.workspace-approval-center-meta {
  @apply mt-0.5 truncate font-mono text-[0.68rem] text-zinc-500;
}

.workspace-approval-center-subject {
  @apply mt-1 break-words font-mono text-xs text-zinc-800;
}

.workspace-approval-center-risk-line {
  @apply mt-1 flex flex-wrap gap-1.5;
}

.workspace-approval-center-risk-badge,
.workspace-approval-center-risk-label {
  @apply rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-approval-center-risk-badge[data-level='medium'] {
  @apply border-amber-200 bg-amber-100 text-amber-800;
}

.workspace-approval-center-risk-badge[data-level='high'] {
  @apply border-rose-200 bg-rose-100 text-rose-800;
}

.workspace-approval-center-description,
.workspace-approval-center-policy,
.workspace-approval-center-recommendation {
  @apply mt-1 text-xs leading-4 text-zinc-700;
}

.workspace-approval-center-policy {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[0.68rem] text-zinc-600;
}

.workspace-approval-center-policy[data-status='allowed'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-800;
}

.workspace-approval-center-policy[data-status='denied'] {
  @apply border-rose-200 bg-rose-50 text-rose-800;
}

.workspace-approval-center-policy[data-status='not_configured'],
.workspace-approval-center-policy[data-status='not_git_workspace'] {
  @apply border-amber-200 bg-amber-50 text-amber-800;
}

.workspace-approval-center-impact-list {
  @apply m-0 mt-1 grid list-disc gap-0.5 pl-4 text-xs leading-4 text-zinc-700;
}

.workspace-approval-center-scope-line {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-approval-center-scope {
  @apply rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-normal text-blue-700;
}

.workspace-approval-center-scope[data-enabled='false'] {
  @apply border-zinc-200 bg-zinc-100 text-zinc-500;
}

.workspace-approval-center-actions {
  @apply flex w-32 shrink-0 flex-col gap-1.5;
}

.workspace-approval-center-actions button {
  @apply inline-flex h-7 items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-100;
}

.workspace-approval-center-actions button[data-tone='primary'] {
  @apply border-blue-300 bg-blue-600 text-white hover:bg-blue-700;
}

.workspace-approval-center-actions button[data-tone='danger'] {
  @apply border-rose-300 bg-white text-rose-700 hover:bg-rose-50;
}

.workspace-approval-center-actions button[data-tone='danger-soft'] {
  @apply border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100;
}

.workspace-approval-center-grants {
  @apply mt-3 border-t border-zinc-100 pt-3;
}

.workspace-approval-center-grants-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-approval-center-grants-header h4,
.workspace-approval-center-grants-header p {
  @apply m-0;
}

.workspace-approval-center-grants-header h4 {
  @apply text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-approval-center-grants-header p {
  @apply mt-1 text-xs text-zinc-600;
}

.workspace-approval-center-grants-header button,
.workspace-approval-center-grant button {
  @apply inline-flex h-7 items-center justify-center rounded-md border border-zinc-300 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-approval-center-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700;
}

.workspace-approval-center-grant-list {
  @apply m-0 mt-2 grid list-none gap-2 p-0;
}

.workspace-approval-center-grant {
  @apply flex items-start justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-approval-center-grant[data-scope='permanent'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-approval-center-grant div {
  @apply min-w-0;
}

.workspace-approval-center-grant span {
  @apply inline-flex rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase text-blue-700;
}

.workspace-approval-center-grant[data-scope='permanent'] span {
  @apply border-rose-200 bg-white text-rose-700;
}

.workspace-approval-center-grant code {
  @apply mt-1 block truncate font-mono text-xs text-zinc-800;
}

.workspace-approval-center-grant small {
  @apply mt-0.5 block truncate text-[0.68rem] text-zinc-500;
}

.workspace-approval-center-empty {
  @apply m-0 mt-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}

@media (max-width: 760px) {
  .workspace-approval-center-card {
    @apply grid-cols-1;
  }

  .workspace-approval-center-actions {
    @apply w-full flex-row flex-wrap;
  }
}
</style>
