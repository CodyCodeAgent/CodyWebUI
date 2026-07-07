<template>
  <section class="workspace-dashboard" aria-label="Workspace dashboard">
    <header class="workspace-dashboard-header">
      <div class="workspace-dashboard-heading">
        <p class="workspace-dashboard-eyebrow">Workspace</p>
        <h2 class="workspace-dashboard-title">{{ projectLabel || basenameFromPath(cwd) || 'Choose a workspace' }}</h2>
        <p class="workspace-dashboard-path">{{ cwd || 'No workspace selected' }}</p>
      </div>
      <button
        class="workspace-dashboard-refresh"
        type="button"
        :disabled="isLoading || !cwd"
        @click="loadSnapshot"
      >
        <IconTablerRefresh class="workspace-dashboard-refresh-icon" />
        <span>{{ isLoading ? 'Refreshing' : 'Refresh' }}</span>
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-dashboard-error">{{ errorMessage }}</p>

    <div class="workspace-dashboard-grid">
      <section class="workspace-dashboard-panel" aria-label="Repository status">
        <h3 class="workspace-dashboard-panel-title">Repository</h3>
        <div class="workspace-dashboard-metric-row">
          <div class="workspace-dashboard-metric" :data-tone="snapshot?.gitStatus.dirtyFileCount ? 'warning' : 'success'">
            <span class="workspace-dashboard-metric-value">{{ snapshot?.gitStatus.dirtyFileCount ?? '-' }}</span>
            <span class="workspace-dashboard-metric-label">dirty files</span>
          </div>
          <div class="workspace-dashboard-metric">
            <span class="workspace-dashboard-metric-value">{{ snapshot?.branch || '-' }}</span>
            <span class="workspace-dashboard-metric-label">branch</span>
          </div>
          <div class="workspace-dashboard-metric">
            <span class="workspace-dashboard-metric-value">{{ snapshot?.upstream || 'none' }}</span>
            <span class="workspace-dashboard-metric-label">upstream</span>
          </div>
        </div>

        <dl class="workspace-dashboard-status-list">
          <div>
            <dt>staged</dt>
            <dd>{{ snapshot?.gitStatus.stagedFileCount ?? 0 }}</dd>
          </div>
          <div>
            <dt>unstaged</dt>
            <dd>{{ snapshot?.gitStatus.unstagedFileCount ?? 0 }}</dd>
          </div>
          <div>
            <dt>untracked</dt>
            <dd>{{ snapshot?.gitStatus.untrackedFileCount ?? 0 }}</dd>
          </div>
          <div>
            <dt>conflicts</dt>
            <dd>{{ snapshot?.gitStatus.conflictedFileCount ?? 0 }}</dd>
          </div>
        </dl>

        <ul v-if="dirtyFiles.length > 0" class="workspace-dashboard-file-list">
          <li v-for="file in dirtyFiles" :key="`${file.status}:${file.path}`">
            <span class="workspace-dashboard-file-status">{{ file.status }}</span>
            <span class="workspace-dashboard-file-path">{{ file.path }}</span>
          </li>
        </ul>
        <p v-else class="workspace-dashboard-empty">Working tree is clean.</p>
      </section>

      <section class="workspace-dashboard-panel" aria-label="Validation scripts and rules">
        <h3 class="workspace-dashboard-panel-title">Validation & Rules</h3>
        <div class="workspace-dashboard-script-summary">
          <span>{{ snapshot?.packageManager || 'no package manager' }}</span>
          <span>{{ validationScripts.length }} validation scripts</span>
        </div>
        <section class="workspace-dashboard-validation-plan" aria-label="Validation plan">
          <div class="workspace-dashboard-validation-plan-header">
            <h4>Validation Plan</h4>
            <span>{{ validationPlanSummary }}</span>
          </div>
          <ul v-if="validationPlanItems.length > 0" class="workspace-dashboard-validation-plan-list">
            <li
              v-for="item in validationPlanItems"
              :key="item.id"
              :data-status="item.status"
              :data-priority="item.priority"
            >
              <div class="workspace-dashboard-validation-plan-row">
                <div class="workspace-dashboard-validation-plan-copy">
                  <span>{{ item.title }}</span>
                  <code v-if="item.command">{{ item.command }}</code>
                  <code v-else-if="item.targetUrl">{{ item.targetUrl }}</code>
                  <small>{{ item.reason }}</small>
                </div>
                <div class="workspace-dashboard-validation-plan-badges">
                  <span>{{ item.status }}</span>
                  <span>{{ item.priority }}</span>
                </div>
              </div>
              <p class="workspace-dashboard-validation-plan-evidence">
                {{ validationPlanEvidenceLabel(item) }}
              </p>
            </li>
          </ul>
          <p v-else class="workspace-dashboard-empty">No validation plan is available for this workspace.</p>
        </section>
        <ul v-if="validationScripts.length > 0" class="workspace-dashboard-script-list">
          <li
            v-for="script in validationScripts"
            :key="script.name"
            :data-script-name="script.name"
          >
            <div class="workspace-dashboard-script-row">
              <div class="workspace-dashboard-script-copy">
                <span class="workspace-dashboard-script-name">{{ script.name }}</span>
                <code>{{ script.command }}</code>
              </div>
              <button
                v-if="isRunnableValidationScript(script.name)"
                class="workspace-dashboard-script-run"
                type="button"
                :disabled="scriptRunState(script.name).isRunning"
                @click="runScript(script.name)"
              >
                {{ scriptRunState(script.name).isRunning ? 'Running' : 'Run' }}
              </button>
              <span v-else class="workspace-dashboard-script-manual">Manual</span>
            </div>

            <p v-if="scriptRunState(script.name).errorMessage" class="workspace-dashboard-script-error">
              {{ scriptRunState(script.name).errorMessage }}
            </p>

            <div
              v-if="scriptRunState(script.name).result"
              class="workspace-dashboard-script-result"
              :data-status="scriptRunState(script.name).result?.status"
            >
              <div class="workspace-dashboard-script-result-meta">
                <span>{{ scriptRunState(script.name).result?.status }}</span>
                <span>exit {{ scriptRunState(script.name).result?.exitCode ?? '-' }}</span>
                <span>{{ formatDuration(scriptRunState(script.name).result?.durationMs ?? 0) }}</span>
                <span>{{ scriptProblemCount(scriptRunState(script.name).result) }} problems</span>
              </div>
              <div
                v-if="scriptRunEvidenceSummary(scriptRunState(script.name).result).length > 0"
                class="workspace-dashboard-script-evidence"
              >
                <span
                  v-for="item in scriptRunEvidenceSummary(scriptRunState(script.name).result)"
                  :key="item"
                >
                  {{ item }}
                </span>
              </div>
              <code>{{ scriptRunState(script.name).result?.command }}</code>
              <pre>{{ scriptRunOutput(scriptRunState(script.name).result) }}</pre>
            </div>
          </li>
        </ul>
        <p v-else class="workspace-dashboard-empty">No test, lint, typecheck, build, or preview script detected.</p>

        <div class="workspace-dashboard-config-grid">
          <span :data-present="snapshot?.configFiles.codexWeb">.codex-web.yml</span>
          <span :data-present="snapshot?.configFiles.agents">AGENTS.md</span>
          <span :data-present="snapshot?.configFiles.aiIgnore">.aiignore</span>
          <span :data-present="snapshot?.configFiles.gitIgnore">.gitignore</span>
        </div>

        <section class="workspace-dashboard-project-context" aria-label="Project context sources">
          <div class="workspace-dashboard-project-context-header">
            <h4>Project Context</h4>
            <span>{{ projectContextSummary }}</span>
          </div>
          <ul v-if="projectContextSources.length > 0" class="workspace-dashboard-project-context-list">
            <li v-for="source in projectContextSources" :key="source.id" :data-present="source.present">
              <div>
                <span>{{ source.title }}</span>
                <code>{{ source.path }}</code>
              </div>
              <p>{{ source.summary }}</p>
            </li>
          </ul>
          <p v-else class="workspace-dashboard-empty">No project context sources inspected yet.</p>
        </section>

        <dl class="workspace-dashboard-policy-list">
          <div>
            <dt>trust</dt>
            <dd>{{ workspaceConfig.trust }}</dd>
          </div>
          <div>
            <dt>sandbox</dt>
            <dd>{{ workspaceConfig.sandboxMode }}</dd>
          </div>
          <div>
            <dt>approvals</dt>
            <dd>{{ workspaceConfig.approvalPolicy || 'default' }}</dd>
          </div>
          <div>
            <dt>commands</dt>
            <dd>{{ commandPolicyLabel }}</dd>
          </div>
          <div>
            <dt>notify</dt>
            <dd>{{ notificationPolicyLabel }}</dd>
          </div>
          <div>
            <dt>theme</dt>
            <dd>{{ themePolicyLabel }}</dd>
          </div>
        </dl>

        <ul v-if="configuredValidationCommands.length > 0" class="workspace-dashboard-config-command-list">
          <li v-for="command in configuredValidationCommands" :key="`${command.name}:${command.command}`">
            <span>{{ command.name }}</span>
            <code>{{ command.command }}</code>
          </li>
        </ul>

        <section class="workspace-dashboard-notification-test">
          <div class="workspace-dashboard-notification-test-header">
            <h4>Notification Channels</h4>
            <button
              class="workspace-dashboard-script-run"
              type="button"
              :disabled="isTestingNotifications || !cwd || !workspaceConfig.notifications.enabled || notificationChannels.length === 0"
              @click="testNotifications"
            >
              {{ isTestingNotifications ? 'Testing' : 'Test' }}
            </button>
          </div>
          <ul v-if="notificationChannels.length > 0" class="workspace-dashboard-config-command-list">
            <li v-for="channel in notificationChannels" :key="`${channel.type}:${channel.name}`">
              <span>{{ channel.name }}</span>
              <code>{{ channel.type }} · {{ channel.target || 'no target' }}</code>
            </li>
          </ul>
          <p v-else class="workspace-dashboard-empty">No notification channels configured.</p>
          <p v-if="notificationTestError" class="workspace-dashboard-script-error">
            {{ notificationTestError }}
          </p>
          <div
            v-if="notificationTestReport"
            class="workspace-dashboard-notification-result"
            :data-status="notificationTestReport.failedCount > 0 ? 'failed' : notificationTestReport.sentCount > 0 ? 'passed' : 'skipped'"
          >
            <p>{{ notificationTestSummary }}</p>
            <ul>
              <li v-for="result in notificationTestReport.results" :key="`${result.channelType}:${result.channelName}`">
                <span>{{ result.channelName }}</span>
                <code>{{ result.status }} · {{ result.httpStatus ?? 'no http' }} · {{ result.durationMs }}ms</code>
              </li>
            </ul>
            <p v-for="warning in notificationTestReport.warnings" :key="warning">{{ warning }}</p>
          </div>
        </section>
      </section>

      <section class="workspace-dashboard-panel" aria-label="Security warnings">
        <h3 class="workspace-dashboard-panel-title">Safety</h3>
        <ul v-if="warnings.length > 0" class="workspace-dashboard-warning-list">
          <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
        </ul>
        <p v-else class="workspace-dashboard-empty">No workspace warnings detected.</p>
      </section>

      <section class="workspace-dashboard-panel" aria-label="Resource and token usage">
        <div class="workspace-dashboard-resource-header">
          <h3 class="workspace-dashboard-panel-title">Resources</h3>
          <span :data-tone="resourceSummary.tone">{{ resourceSummary.headline }}</span>
        </div>
        <div class="workspace-dashboard-resource-grid">
          <div
            v-for="metric in resourceMetrics"
            :key="metric.label"
            class="workspace-dashboard-resource-metric"
            :data-tone="metric.tone"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.detail }}</small>
          </div>
        </div>
        <ul v-if="resourceSummary.notes.length > 0" class="workspace-dashboard-resource-notes">
          <li v-for="note in resourceSummary.notes" :key="note">{{ note }}</li>
        </ul>
      </section>

      <WorkspaceAccessSecurityPanel />
    </div>

    <WorkspaceApprovalCenter
      :cwd="cwd"
      :pending-requests="pendingRequests"
      @respond-server-request="$emit('respondServerRequest', $event)"
      @select-thread="$emit('selectThread', $event)"
    />
    <WorkspaceRecentSessionsPanel :cwd="cwd" @select-thread="$emit('selectThread', $event)" />
    <WorkspaceTaskBoard
      :threads="threads"
      :snapshot="snapshot"
      :validation-runs="allValidationRuns"
      :rate-limit-snapshot="rateLimitSnapshot"
      :pending-requests="pendingRequests"
      @select-thread="$emit('selectThread', $event)"
    />
    <WorkspaceMobileSupervisionPanel
      :threads="threads"
      :snapshot="snapshot"
      :validation-runs="allValidationRuns"
      :pending-requests="pendingRequests"
      :rate-limit-snapshot="rateLimitSnapshot"
      :is-busy="mobileActionBusy"
      @select-thread="$emit('selectThread', $event)"
      @follow-up="$emit('mobileFollowUp', $event)"
      @pause="$emit('mobilePause', $event)"
      @interrupt="$emit('mobileInterrupt', $event)"
      @archive="$emit('mobileArchive', $event)"
    />
    <WorkspaceWorkflowPanel :cwd="cwd" @changed="loadSnapshot" />
    <WorkspaceThemePanel :workspace-theme="workspaceConfig.theme" />
    <WorkspaceDiagnosticsPanel :cwd="cwd" />
    <WorkspaceGitPanel :cwd="cwd" @changed="loadSnapshot" />
    <WorkspaceSecurityPanel :cwd="cwd" />
    <WorkspaceWorktreesPanel :cwd="cwd" @changed="loadSnapshot" />
    <WorkspaceCommandsPanel :cwd="cwd" :scripts="snapshot?.scripts ?? []" @changed="loadSnapshot" />
    <WorkspaceProblemsPanel :runs="allValidationRuns" />
    <WorkspaceAuditPanel :cwd="cwd" />
    <WorkspacePortsPanel :cwd="cwd" />
    <WorkspaceFilesPanel :cwd="cwd" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  fetchWorkspaceRecentSessions,
  runWorkspaceScript,
  testWorkspaceNotifications,
} from '../../api/codexRpcClient'
import {
  fetchWorkspaceSnapshot,
  fetchWorkspaceValidationRuns,
} from '../../api/codexWorkspaceResourcesClient'
import { buildWorkspaceResourceSummary } from '../../composables/useWorkspaceResources'
import type {
  UiNotificationDeliveryReport,
  UiRateLimitSnapshot,
  UiServerRequestReply,
  UiServerRequest,
  UiThread,
  UiValidationPlanItem,
  UiWorkspaceConfig,
  UiWorkspaceSessionSummary,
  UiWorkspaceScriptRun,
  UiWorkspaceSnapshot,
} from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'
import WorkspaceAccessSecurityPanel from './WorkspaceAccessSecurityPanel.vue'
import WorkspaceApprovalCenter from './WorkspaceApprovalCenter.vue'
import WorkspaceAuditPanel from './WorkspaceAuditPanel.vue'
import WorkspaceCommandsPanel from './WorkspaceCommandsPanel.vue'
import WorkspaceDiagnosticsPanel from './WorkspaceDiagnosticsPanel.vue'
import WorkspaceFilesPanel from './WorkspaceFilesPanel.vue'
import WorkspaceGitPanel from './WorkspaceGitPanel.vue'
import WorkspaceMobileSupervisionPanel from './WorkspaceMobileSupervisionPanel.vue'
import WorkspacePortsPanel from './WorkspacePortsPanel.vue'
import WorkspaceProblemsPanel from './WorkspaceProblemsPanel.vue'
import WorkspaceRecentSessionsPanel from './WorkspaceRecentSessionsPanel.vue'
import WorkspaceSecurityPanel from './WorkspaceSecurityPanel.vue'
import WorkspaceTaskBoard from './WorkspaceTaskBoard.vue'
import WorkspaceThemePanel from './WorkspaceThemePanel.vue'
import WorkspaceWorkflowPanel from './WorkspaceWorkflowPanel.vue'
import WorkspaceWorktreesPanel from './WorkspaceWorktreesPanel.vue'

const props = defineProps<{
  cwd: string
  projectLabel: string
  threads: UiThread[]
  pendingRequests: UiServerRequest[]
  rateLimitSnapshot: UiRateLimitSnapshot | null
  isMobileActionBusy?: boolean
}>()

defineEmits<{
  selectThread: [threadId: string]
  respondServerRequest: [payload: UiServerRequestReply]
  mobileFollowUp: [payload: { threadId: string; text: string }]
  mobilePause: [threadId: string]
  mobileInterrupt: [threadId: string]
  mobileArchive: [threadId: string]
}>()

const snapshot = ref<UiWorkspaceSnapshot | null>(null)
const validationHistoryRuns = ref<UiWorkspaceScriptRun[]>([])
const recentSessions = ref<UiWorkspaceSessionSummary[]>([])
const notificationTestReport = ref<UiNotificationDeliveryReport | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const isTestingNotifications = ref(false)
const notificationTestError = ref('')
const scriptRunStates = ref<Record<string, {
  isRunning: boolean
  errorMessage: string
  result: UiWorkspaceScriptRun | null
}>>({})

const defaultWorkspaceConfig: UiWorkspaceConfig = {
  path: null,
  loaded: false,
  errors: [],
  trust: 'unknown' as const,
  sandboxMode: 'unknown' as const,
  approvalPolicy: '',
  defaultModel: '',
  reasoningEffort: '',
  collaborationMode: '',
  commandPolicy: {
    allow: [],
    deny: [],
  },
  validationCommands: [],
  knownPorts: [],
  portPolicy: {
    allow: [],
    deny: [],
    allowExternal: false,
    allowWildcard: false,
  },
  notifications: {
    enabled: false,
    events: [],
    channels: [],
  },
  theme: {
    skinId: '',
    accentColor: '',
    density: '',
    layoutPresetId: '',
    followSystem: null,
  },
  sensitivePaths: [],
  ignorePatterns: [],
}

const dirtyFiles = computed(() => snapshot.value?.gitStatus.files.slice(0, 8) ?? [])
const warnings = computed(() => snapshot.value?.warnings ?? [])
const workspaceConfig = computed(() => snapshot.value?.workspaceConfig ?? defaultWorkspaceConfig)
const commandPolicyLabel = computed(() => {
  const policy = workspaceConfig.value.commandPolicy
  if (policy.allow.length > 0 && policy.deny.length > 0) {
    return `${String(policy.allow.length)} allowed · ${String(policy.deny.length)} denied`
  }
  if (policy.allow.length > 0) return `${String(policy.allow.length)} allowed`
  if (policy.deny.length > 0) return `${String(policy.deny.length)} denied`
  return 'not configured'
})
const configuredValidationCommands = computed(() => workspaceConfig.value.validationCommands.slice(0, 6))
const validationPlanItems = computed(() => snapshot.value?.validationPlan.items.slice(0, 10) ?? [])
const validationPlanSummary = computed(() => {
  const plan = snapshot.value?.validationPlan
  if (!plan) return 'no plan'
  const parts = [
    `${String(plan.items.length)} items`,
    `${String(plan.coveredCount)} covered`,
    plan.failedCount > 0 ? `${String(plan.failedCount)} failed` : '',
    `${String(plan.missingEvidenceCount)} missing evidence`,
  ].filter(Boolean)
  return parts.join(' · ')
})
const projectContextSources = computed(() => snapshot.value?.projectContext.sources.slice(0, 8) ?? [])
const projectContextSummary = computed(() => {
  const context = snapshot.value?.projectContext
  if (!context) return 'no context'
  const warningCount = context.warnings.length
  return `${String(context.presentCount)} present · ${String(context.sources.length)} tracked${warningCount > 0 ? ` · ${String(warningCount)} gaps` : ''}`
})
const notificationChannels = computed(() => workspaceConfig.value.notifications.channels.slice(0, 4))
const notificationPolicyLabel = computed(() => {
  const notifications = workspaceConfig.value.notifications
  if (!notifications.enabled) return 'off'
  const activeChannels = notifications.channels.filter((channel) => channel.enabled).length
  return `${String(activeChannels)} channel${activeChannels === 1 ? '' : 's'}`
})
const themePolicyLabel = computed(() => {
  const theme = workspaceConfig.value.theme
  const parts = [
    theme.skinId || '',
    theme.layoutPresetId || '',
    theme.density || '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'personal'
})
const notificationTestSummary = computed(() => {
  const report = notificationTestReport.value
  if (!report) return ''
  if (!report.enabled) return 'Notification delivery is disabled for this workspace.'
  return `${String(report.sentCount)} sent · ${String(report.failedCount)} failed · ${String(report.skippedCount)} skipped`
})
const validationScripts = computed(() => {
  const scripts = snapshot.value?.scripts ?? []
  return scripts.filter((script) => /\b(test|spec|lint|typecheck|type-check|build|preview|dev|serve)\b/iu.test(script.name))
})
const completedScriptRuns = computed(() => Object.values(scriptRunStates.value)
  .map((state) => state.result)
  .filter((result): result is UiWorkspaceScriptRun => Boolean(result)))
const allValidationRuns = computed(() => {
  const seen = new Set<string>()
  const runs: UiWorkspaceScriptRun[] = []
  for (const run of [...completedScriptRuns.value, ...validationHistoryRuns.value]) {
    const key = `${run.scriptName}:${run.command}:${run.startedAtIso}:${run.endedAtIso}`
    if (seen.has(key)) continue
    seen.add(key)
    runs.push(run)
  }
  return runs.sort((first, second) => second.endedAtIso.localeCompare(first.endedAtIso))
})
const mobileActionBusy = computed(() => props.isMobileActionBusy === true)
const resourceSummary = computed(() => buildWorkspaceResourceSummary({
  rateLimitSnapshot: props.rateLimitSnapshot,
  validationRuns: allValidationRuns.value,
  sessions: recentSessions.value,
  threads: props.threads,
  pendingRequests: props.pendingRequests,
}))
const resourceMetrics = computed(() => [
  resourceSummary.value.rateLimit,
  resourceSummary.value.tokens,
  resourceSummary.value.validation,
  resourceSummary.value.activity,
])

function basenameFromPath(value: string): string {
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) ?? value
}

function isRunnableValidationScript(name: string): boolean {
  const isValidation = /(^|[:_-])(test|spec|lint|typecheck|type-check|build)($|[:_-])/iu.test(name)
  const isLongRunning = /(^|[:_-])(dev|preview|serve|start)($|[:_-])/iu.test(name)
  return isValidation && !isLongRunning
}

function scriptRunState(scriptName: string): {
  isRunning: boolean
  errorMessage: string
  result: UiWorkspaceScriptRun | null
} {
  return scriptRunStates.value[scriptName] ?? {
    isRunning: false,
    errorMessage: '',
    result: null,
  }
}

function setScriptRunState(
  scriptName: string,
  nextState: {
    isRunning: boolean
    errorMessage: string
    result: UiWorkspaceScriptRun | null
  },
): void {
  scriptRunStates.value = {
    ...scriptRunStates.value,
    [scriptName]: nextState,
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${String(Math.max(0, Math.round(durationMs)))}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

function validationPlanEvidenceLabel(item: UiValidationPlanItem): string {
  const evidence = item.evidence
  if (evidence.status === 'passed' || evidence.status === 'failed' || evidence.status === 'timed_out') {
    const parts = [
      evidence.runAtIso ? `last run ${new Date(evidence.runAtIso).toLocaleString()}` : '',
      evidence.exitCode !== null ? `exit ${String(evidence.exitCode)}` : '',
      evidence.durationMs !== null ? formatDuration(evidence.durationMs) : '',
      evidence.problemCount > 0 ? `${String(evidence.problemCount)} problems` : '',
    ].filter(Boolean)
    return `${evidence.status}${parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}`
  }
  if (evidence.status === 'manual') return 'Manual evidence required.'
  if (evidence.status === 'not_applicable') return 'No command evidence is expected for this item.'
  return item.command ? 'No matching command evidence captured yet.' : 'No runnable command is configured yet.'
}

function scriptRunOutput(result: UiWorkspaceScriptRun | null): string {
  if (!result) return ''
  const output = result.output.trim()
  return output || 'No output captured.'
}

function scriptProblemCount(result: UiWorkspaceScriptRun | null): number {
  return result?.problems?.length ?? 0
}

function scriptRunEvidenceSummary(result: UiWorkspaceScriptRun | null): string[] {
  if (!result) return []
  const items: string[] = []
  const tests = result.testSummary ?? null
  if (tests) {
    const parts = [
      tests.passed !== null ? `${String(tests.passed)} passed` : '',
      tests.failed !== null ? `${String(tests.failed)} failed` : '',
      tests.skipped !== null ? `${String(tests.skipped)} skipped` : '',
      tests.total !== null ? `${String(tests.total)} total` : '',
    ].filter(Boolean)
    if (parts.length > 0) items.push(`tests ${parts.join(' · ')}`)
  }
  const coverage = result.coverageSummary ?? null
  if (coverage) {
    const parts = [
      coverage.statements !== null ? `stmt ${coverage.statements.toFixed(1)}%` : '',
      coverage.branches !== null ? `branch ${coverage.branches.toFixed(1)}%` : '',
      coverage.functions !== null ? `func ${coverage.functions.toFixed(1)}%` : '',
      coverage.lines !== null ? `line ${coverage.lines.toFixed(1)}%` : '',
    ].filter(Boolean)
    if (parts.length > 0) items.push(`coverage ${parts.join(' · ')}`)
  }
  return items
}

async function runScript(scriptName: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  setScriptRunState(scriptName, {
    isRunning: true,
    errorMessage: '',
    result: scriptRunState(scriptName).result,
  })

  try {
    const result = await runWorkspaceScript(cwd, scriptName)
    setScriptRunState(scriptName, {
      isRunning: false,
      errorMessage: '',
      result,
    })
    await loadValidationHistory()
  } catch (error) {
    setScriptRunState(scriptName, {
      isRunning: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to run workspace script.',
      result: scriptRunState(scriptName).result,
    })
  }
}

async function testNotifications(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  isTestingNotifications.value = true
  notificationTestError.value = ''
  try {
    notificationTestReport.value = await testWorkspaceNotifications(cwd)
  } catch (error) {
    notificationTestError.value = error instanceof Error ? error.message : 'Notification test failed.'
  } finally {
    isTestingNotifications.value = false
  }
}

async function loadValidationHistory(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    validationHistoryRuns.value = []
    return
  }

  try {
    const history = await fetchWorkspaceValidationRuns(cwd, 12)
    validationHistoryRuns.value = history.runs
  } catch {
    validationHistoryRuns.value = []
  }
}

async function loadSnapshot(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    snapshot.value = null
    validationHistoryRuns.value = []
    recentSessions.value = []
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    const [nextSnapshot, history, sessionTrail] = await Promise.all([
      fetchWorkspaceSnapshot(cwd),
      fetchWorkspaceValidationRuns(cwd, 12),
      fetchWorkspaceRecentSessions(cwd, 12),
    ])
    snapshot.value = nextSnapshot
    validationHistoryRuns.value = history.runs
    recentSessions.value = sessionTrail.sessions
  } catch (error) {
    snapshot.value = null
    validationHistoryRuns.value = []
    recentSessions.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load workspace snapshot.'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.cwd,
  () => {
    void loadSnapshot()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-dashboard {
  @apply mx-auto flex w-full max-w-6xl shrink-0 flex-col gap-3 px-6 pt-2;
}

.workspace-dashboard-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-dashboard-heading {
  @apply min-w-0;
}

.workspace-dashboard-eyebrow {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-title {
  @apply m-0 mt-0.5 truncate text-xl font-semibold text-zinc-950;
}

.workspace-dashboard-path {
  @apply m-0 mt-1 truncate font-mono text-xs text-zinc-500;
}

.workspace-dashboard-refresh {
  @apply inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-dashboard-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-dashboard-error {
  @apply m-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700;
}

.workspace-dashboard-grid {
  @apply grid grid-cols-4 gap-3;
}

.workspace-dashboard-panel {
  @apply min-w-0 rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-dashboard-panel-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-metric-row {
  @apply mt-2 grid grid-cols-3 gap-1.5;
}

.workspace-dashboard-metric {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-metric[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-metric[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-dashboard-metric[data-tone='working'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-dashboard-metric-value {
  @apply block truncate text-sm font-semibold leading-5 text-zinc-950;
}

.workspace-dashboard-metric-label {
  @apply block truncate text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-status-list {
  @apply m-0 mt-2 grid grid-cols-4 gap-1.5;
}

.workspace-dashboard-status-list div {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1;
}

.workspace-dashboard-status-list dt {
  @apply text-[0.68rem] uppercase leading-4 text-zinc-500;
}

.workspace-dashboard-status-list dd {
  @apply m-0 text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-file-list,
.workspace-dashboard-script-list,
.workspace-dashboard-warning-list,
.workspace-dashboard-thread-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-dashboard-file-list li {
  @apply grid grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1;
}

.workspace-dashboard-file-status {
  @apply font-mono text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-file-path {
  @apply truncate font-mono text-[0.68rem] leading-4 text-zinc-700;
}

.workspace-dashboard-script-summary {
  @apply mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-500;
}

.workspace-dashboard-script-summary span,
.workspace-dashboard-config-grid span {
  @apply rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5;
}

.workspace-dashboard-validation-plan {
  @apply mt-3;
}

.workspace-dashboard-validation-plan-header {
  @apply flex items-center justify-between gap-2;
}

.workspace-dashboard-validation-plan-header h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-validation-plan-header span {
  @apply truncate text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-validation-plan-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-dashboard-validation-plan-list li {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-validation-plan-list li[data-status='covered'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-validation-plan-list li[data-status='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-dashboard-validation-plan-list li[data-status='blocked'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-dashboard-validation-plan-row {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2;
}

.workspace-dashboard-validation-plan-copy {
  @apply min-w-0;
}

.workspace-dashboard-validation-plan-copy span {
  @apply block truncate text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-validation-plan-copy code {
  @apply mt-0.5 block truncate font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-validation-plan-copy small {
  @apply mt-0.5 block text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-validation-plan-badges {
  @apply flex shrink-0 flex-col items-end gap-1;
}

.workspace-dashboard-validation-plan-badges span {
  @apply rounded-full border border-zinc-200 bg-white/80 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase leading-3 text-zinc-500;
}

.workspace-dashboard-validation-plan-evidence {
  @apply m-0 mt-1 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-script-list li {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-script-row {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2;
}

.workspace-dashboard-script-copy {
  @apply min-w-0;
}

.workspace-dashboard-script-name {
  @apply mr-2 font-mono text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-script-list code {
  @apply break-words font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-script-run {
  @apply inline-flex h-6 shrink-0 items-center rounded-md border border-zinc-300 bg-white px-2 text-[0.68rem] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60;
}

.workspace-dashboard-script-manual {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.68rem] font-medium leading-4 text-zinc-400;
}

.workspace-dashboard-script-error {
  @apply m-0 mt-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[0.68rem] leading-4 text-rose-700;
}

.workspace-dashboard-script-result {
  @apply mt-1 rounded-md border border-zinc-200 bg-white p-2;
}

.workspace-dashboard-script-result[data-status='passed'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-script-result[data-status='failed'],
.workspace-dashboard-script-result[data-status='timed_out'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-dashboard-script-result-meta {
  @apply mb-1 flex flex-wrap gap-1.5 text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
}

.workspace-dashboard-script-result-meta span {
  @apply rounded-full border border-zinc-200 bg-white/70 px-1.5 py-0.5;
}

.workspace-dashboard-script-evidence {
  @apply mb-1 flex flex-wrap gap-1.5;
}

.workspace-dashboard-script-evidence span {
  @apply rounded-md border border-zinc-200 bg-white/80 px-2 py-1 font-mono text-[0.68rem] leading-4 text-zinc-700;
}

.workspace-dashboard-script-result pre {
  @apply m-0 mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-950 p-2 font-mono text-[0.68rem] leading-4 text-zinc-100;
}

.workspace-dashboard-config-grid {
  @apply mt-2 flex flex-wrap gap-1.5 text-[0.68rem] text-zinc-500;
}

.workspace-dashboard-config-grid span[data-present='true'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.workspace-dashboard-project-context {
  @apply mt-3;
}

.workspace-dashboard-project-context-header {
  @apply flex items-center justify-between gap-2;
}

.workspace-dashboard-project-context-header h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-project-context-header span {
  @apply truncate text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-project-context-list {
  @apply m-0 mt-2 grid list-none gap-1.5 p-0;
}

.workspace-dashboard-project-context-list li {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-project-context-list li[data-present='true'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-project-context-list div {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2;
}

.workspace-dashboard-project-context-list span {
  @apply truncate text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-project-context-list code {
  @apply truncate font-mono text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-project-context-list p {
  @apply m-0 mt-1 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-policy-list {
  @apply mt-3 grid grid-cols-2 gap-1.5;
}

.workspace-dashboard-policy-list div {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-policy-list dt {
  @apply text-[0.65rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-policy-list dd {
  @apply m-0 truncate text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-config-command-list {
  @apply m-0 mt-3 grid list-none gap-1.5 p-0;
}

.workspace-dashboard-config-command-list li {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-config-command-list span {
  @apply block truncate text-xs font-semibold text-zinc-900;
}

.workspace-dashboard-config-command-list code {
  @apply mt-1 block truncate font-mono text-[0.68rem] text-zinc-500;
}

.workspace-dashboard-notification-test {
  @apply mt-3;
}

.workspace-dashboard-notification-test-header {
  @apply flex items-center justify-between gap-2;
}

.workspace-dashboard-notification-test-header h4 {
  @apply m-0 text-[0.68rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-notification-result {
  @apply mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-dashboard-notification-result[data-status='passed'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-notification-result[data-status='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-dashboard-notification-result p {
  @apply m-0 mt-1 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-notification-result p:first-child {
  @apply mt-0 font-semibold text-zinc-800;
}

.workspace-dashboard-notification-result ul {
  @apply m-0 mt-1 grid list-none gap-1 p-0;
}

.workspace-dashboard-notification-result li {
  @apply grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded border border-white/80 bg-white/70 px-1.5 py-1;
}

.workspace-dashboard-notification-result span {
  @apply truncate text-[0.68rem] font-semibold text-zinc-800;
}

.workspace-dashboard-notification-result code {
  @apply font-mono text-[0.65rem] text-zinc-500;
}

.workspace-dashboard-thread-list button {
  @apply grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-left transition hover:bg-zinc-100;
}

.workspace-dashboard-thread-title {
  @apply truncate text-xs font-medium text-zinc-900;
}

.workspace-dashboard-thread-meta {
  @apply text-[0.68rem] text-zinc-500;
}

.workspace-dashboard-warning-list li {
  @apply rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-800;
}

.workspace-dashboard-resource-header {
  @apply flex items-start justify-between gap-2;
}

.workspace-dashboard-resource-header span {
  @apply rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[0.68rem] font-semibold text-zinc-600;
}

.workspace-dashboard-resource-header span[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.workspace-dashboard-resource-header span[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.workspace-dashboard-resource-header span[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.workspace-dashboard-resource-header span[data-tone='info'] {
  @apply border-blue-200 bg-blue-50 text-blue-700;
}

.workspace-dashboard-resource-grid {
  @apply mt-2 grid grid-cols-2 gap-1.5;
}

.workspace-dashboard-resource-metric {
  @apply min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.workspace-dashboard-resource-metric[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-dashboard-resource-metric[data-tone='warning'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-dashboard-resource-metric[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-dashboard-resource-metric[data-tone='info'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-dashboard-resource-metric span {
  @apply block truncate text-[0.65rem] font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-dashboard-resource-metric strong {
  @apply mt-0.5 block truncate text-sm font-semibold text-zinc-950;
}

.workspace-dashboard-resource-metric small {
  @apply mt-0.5 block truncate text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-dashboard-resource-notes {
  @apply m-0 mt-2 grid list-none gap-1 p-0;
}

.workspace-dashboard-resource-notes li {
  @apply rounded-md border border-zinc-200 bg-white px-2 py-1 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-dashboard-empty {
  @apply m-0 mt-2 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}

@media (max-width: 1180px) {
  .workspace-dashboard-grid {
    @apply grid-cols-2;
  }
}

@media (max-width: 760px) {
  .workspace-dashboard {
    @apply px-3;
  }

  .workspace-dashboard-grid {
    @apply grid-cols-1;
  }

  .workspace-dashboard-header {
    @apply flex-col;
  }
}
</style>
