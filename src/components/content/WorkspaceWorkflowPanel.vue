<template>
  <section class="workspace-workflow-panel" aria-label="Workspace workflows" data-testid="workspace-workflow-panel">
    <header class="workspace-workflow-header">
      <div>
        <h3 class="workspace-workflow-title">Workflows</h3>
        <p class="workspace-workflow-subtitle">{{ summaryText }}</p>
      </div>
      <button class="workspace-workflow-refresh" type="button" :disabled="isLoading || !cwd" @click="loadWorkflows">
        <IconTablerRefresh class="workspace-workflow-refresh-icon" />
      </button>
    </header>

    <p v-if="errorMessage" class="workspace-workflow-error">{{ errorMessage }}</p>

    <form class="workspace-workflow-form" @submit.prevent="createRun">
      <label>
        <span>Template</span>
        <select v-model="selectedTemplateId" data-testid="workflow-template-select" :disabled="isCreating || templates.length === 0">
          <option v-for="template in templates" :key="template.id" :value="template.id">
            {{ template.name }}
          </option>
        </select>
      </label>
      <label class="workspace-workflow-goal-field">
        <span>Goal</span>
        <textarea
          v-model="goalDraft"
          data-testid="workflow-goal-input"
          :disabled="isCreating"
          placeholder="Describe the engineering task to orchestrate..."
        />
      </label>
      <button
        class="workspace-workflow-create"
        data-testid="workflow-create-button"
        type="submit"
        :disabled="!canSubmitCreateRun"
      >
        {{ createButtonLabel }}
      </button>
    </form>

    <section v-if="selectedTemplate" class="workspace-workflow-template" aria-label="Selected workflow template">
      <div class="workspace-workflow-template-copy">
        <h4>{{ selectedTemplate.name }}</h4>
        <p>{{ selectedTemplate.description }}</p>
      </div>
      <div class="workspace-workflow-template-meta">
        <span v-for="item in templateMetaLabels" :key="item">{{ item }}</span>
      </div>
    </section>

    <ol v-if="runs.length > 0" class="workspace-workflow-list">
      <li
        v-for="run in runs"
        :key="run.id"
        class="workspace-workflow-run"
        :data-status="run.status"
        data-testid="workflow-run-card"
      >
        <header class="workspace-workflow-run-header">
          <div class="workspace-workflow-run-copy">
            <span class="workspace-workflow-run-template">{{ run.templateName }}</span>
            <h4>{{ run.goal }}</h4>
            <p>{{ run.summary }}</p>
          </div>
          <div class="workspace-workflow-run-actions">
            <span class="workspace-workflow-run-status">{{ formatStatus(run.status) }}</span>
            <button
              type="button"
              data-testid="workflow-replay-toggle"
              :data-run-id="run.id"
              :disabled="isLoadingReplay(run.id)"
              @click="toggleWorkflowReplay(run.id)"
            >
              {{ replayButtonLabel(run.id) }}
            </button>
            <button
              type="button"
              data-testid="workflow-delivery-draft"
              :data-run-id="run.id"
              :disabled="isLoadingDelivery(run.id)"
              @click="loadWorkflowDeliveryDraft(run.id)"
            >
              {{ deliveryButtonLabel(run.id) }}
            </button>
            <button
              type="button"
              data-testid="workflow-ready-to-merge"
              :data-run-id="run.id"
              :disabled="!canMarkReadyToMerge(run) || isUpdatingDelivery(run.id, 'ready')"
              @click="markReadyToMerge(run.id)"
            >
              {{ deliveryReadyButtonLabel(run.id) }}
            </button>
            <button
              type="button"
              data-testid="workflow-mark-merged"
              :data-run-id="run.id"
              :disabled="!canMarkMerged(run) || isUpdatingDelivery(run.id, 'merged')"
              @click="markMerged(run.id)"
            >
              {{ deliveryMergedButtonLabel(run.id) }}
            </button>
          </div>
        </header>

        <div class="workspace-workflow-run-meta">
          <span v-for="item in runMetaLabels(run)" :key="item">{{ item }}</span>
        </div>

        <div v-if="run.riskLabels.length > 0" class="workspace-workflow-risk-list" aria-label="Workflow risk labels">
          <span v-for="label in run.riskLabels" :key="label">{{ label }}</span>
        </div>

        <ul v-if="run.warnings.length > 0" class="workspace-workflow-warning-list">
          <li v-for="warning in workflowRunWarningsPreview(run)" :key="warning">{{ warning }}</li>
        </ul>

        <section
          v-if="run.acceptance"
          class="workspace-workflow-acceptance"
          :data-status="run.acceptance.status"
          aria-label="Workflow acceptance gate"
          data-testid="workflow-acceptance-gate"
        >
          <header>
            <h5>Acceptance Gate</h5>
            <strong>{{ run.acceptance.label }}</strong>
          </header>
          <p>{{ run.acceptance.summary }}</p>
          <dl>
            <div>
              <dt>agents</dt>
              <dd>{{ run.acceptance.completedAgentCount }} / {{ run.acceptance.totalAgentCount }}</dd>
            </div>
            <div>
              <dt>validation</dt>
              <dd>{{ formatStatus(run.acceptance.validationStatus) }}</dd>
            </div>
            <div>
              <dt>checks</dt>
              <dd>{{ run.acceptance.requiredValidationCount }}</dd>
            </div>
            <div>
              <dt>options</dt>
              <dd>{{ run.acceptance.readyImplementationOptionCount }} / {{ run.acceptance.totalImplementationOptionCount }}</dd>
            </div>
          </dl>
          <code v-if="run.acceptance.validationCommand">{{ run.acceptance.validationCommand }}</code>
          <ul v-if="run.acceptance.risks.length > 0">
            <li v-for="risk in workflowAcceptanceRisksPreview(run)" :key="risk">{{ risk }}</li>
          </ul>
        </section>

        <p v-if="run.appliedImplementation" class="workspace-workflow-applied">
          {{ appliedImplementationSummary(run) }}
        </p>

        <p v-if="run.deliveryState" class="workspace-workflow-delivery-state">
          {{ deliveryStateSummary(run) }}
        </p>

        <section
          v-if="implementationOptions(run).length > 0"
          class="workspace-workflow-options"
          aria-label="Implementation options"
          data-testid="workflow-implementation-options"
        >
          <div class="workspace-workflow-options-header">
            <h5>Implementation Options</h5>
            <span>{{ implementationOptionsSummary(run) }}</span>
          </div>
          <div class="workspace-workflow-options-grid">
            <article
              v-for="option in implementationOptions(run)"
              :key="option.agentId"
              class="workspace-workflow-option"
              :data-status="option.comparisonStatus"
            >
              <header>
                <span>{{ option.agentName }}</span>
                <strong>{{ formatStatus(option.comparisonStatus) }}</strong>
              </header>
              <p>{{ option.summary }}</p>
              <dl>
                <div>
                  <dt>files</dt>
                  <dd>{{ option.changedFileCount }}</dd>
                </div>
                <div>
                  <dt>diff</dt>
                  <dd>{{ implementationDiffLabel(option) }}</dd>
                </div>
                <div>
                  <dt>validation</dt>
                  <dd>{{ option.validationStatus }}</dd>
                </div>
                <div>
                  <dt>worktree</dt>
                  <dd>{{ formatStatus(option.worktreeStatus) }}</dd>
                </div>
              </dl>
              <code v-if="option.branchName">{{ option.branchName }}</code>
              <code v-if="option.validationCommand">{{ option.validationCommand }}</code>
              <div v-if="hasImplementationActions(run, option)" class="workspace-workflow-option-actions">
                <button
                  v-if="option.comparisonStatus === 'ready_to_merge' || run.appliedImplementation?.agentId === option.agentId || run.appliedImplementation"
                  type="button"
                  data-testid="workflow-implementation-apply"
                  :data-run-id="run.id"
                  :data-agent-id="option.agentId"
                  :disabled="!canApplyImplementation(run, option) || isApplyingImplementation(run.id, option.agentId)"
                  @click="applyImplementation(run.id, option.agentId)"
                >
                  {{ implementationApplyLabel(run, option) }}
                </button>
                <button
                  type="button"
                  data-testid="workflow-implementation-discard"
                  data-tone="danger"
                  :data-run-id="run.id"
                  :data-agent-id="option.agentId"
                  :disabled="!canDiscardImplementation(run, option) || isDiscardingImplementation(run.id, option.agentId)"
                  @click="discardImplementation(run.id, option.agentId)"
                >
                  {{ implementationDiscardLabel(run, option) }}
                </button>
              </div>
              <ul v-if="option.risks.length > 0">
                <li v-for="risk in workflowImplementationRisksPreview(option)" :key="risk">{{ risk }}</li>
              </ul>
            </article>
          </div>
        </section>

        <div class="workspace-workflow-agent-grid">
          <article
            v-for="agent in run.agents"
            :key="agent.id"
            class="workspace-workflow-agent"
            :data-role="agent.role"
            :data-status="agent.status"
          >
            <div class="workspace-workflow-agent-header">
              <span class="workspace-workflow-agent-role">{{ agent.role }}</span>
              <span class="workspace-workflow-agent-status">{{ agent.status }}</span>
            </div>
            <h5>{{ agent.agentName }}</h5>
            <p>{{ agent.objective }}</p>
            <dl>
              <div>
                <dt>worktree</dt>
                <dd>{{ worktreeLabel(agent) }}</dd>
              </div>
              <div>
                <dt>reasoning</dt>
                <dd>{{ agent.reasoningEffort }}</dd>
              </div>
            </dl>
            <div class="workspace-workflow-agent-actions">
              <button
                type="button"
                data-testid="workflow-agent-start"
                :data-run-id="run.id"
                :data-agent-id="agent.id"
                :disabled="!canStartAgent(agent.status) || isUpdatingAgent(run.id, agent.id)"
                @click="updateAgentStatus(run.id, agent.id, 'running')"
              >
                Start
              </button>
              <button
                type="button"
                data-testid="workflow-agent-complete"
                :data-run-id="run.id"
                :data-agent-id="agent.id"
                :disabled="!canCompleteAgent(agent.status) || isUpdatingAgent(run.id, agent.id)"
                @click="updateAgentStatus(run.id, agent.id, 'completed')"
              >
                Complete
              </button>
              <button
                type="button"
                data-testid="workflow-agent-block"
                :data-run-id="run.id"
                :data-agent-id="agent.id"
                :disabled="!canBlockAgent(agent.status) || isUpdatingAgent(run.id, agent.id)"
                @click="updateAgentStatus(run.id, agent.id, 'blocked')"
              >
                Block
              </button>
              <button
                type="button"
                data-testid="workflow-agent-skip"
                :data-run-id="run.id"
                :data-agent-id="agent.id"
                :disabled="!canSkipAgent(agent.status) || isUpdatingAgent(run.id, agent.id)"
                @click="updateAgentStatus(run.id, agent.id, 'skipped')"
              >
                Skip
              </button>
              <button
                v-if="agent.worktreePolicy !== 'not-needed'"
                type="button"
                data-testid="workflow-agent-provision-worktree"
                :data-run-id="run.id"
                :data-agent-id="agent.id"
                :disabled="agent.worktreeStatus === 'ready' || isProvisioningAgent(run.id, agent.id)"
                @click="provisionAgentWorktree(run.id, agent.id)"
              >
                {{ agentWorktreeButtonLabel(agent, run.id) }}
              </button>
            </div>
            <p v-if="agent.branchName" class="workspace-workflow-agent-branch">{{ agent.branchName }}</p>
            <p v-if="agent.worktreePath" class="workspace-workflow-agent-path">{{ agent.worktreePath }}</p>
            <details class="workspace-workflow-briefing">
              <summary>Briefing</summary>
              <pre>{{ agent.briefing }}</pre>
            </details>
          </article>
        </div>

        <details v-if="run.validationPlan.length > 0" class="workspace-workflow-validation">
          <summary>Validation plan</summary>
          <ul>
            <li v-for="item in run.validationPlan" :key="item">{{ item }}</li>
          </ul>
          <div v-if="runnableValidationOptions(run).length > 0" class="workspace-workflow-validation-actions">
            <button
              v-for="option in runnableValidationOptions(run)"
              :key="option.scriptName"
              type="button"
              data-testid="workflow-validation-run"
              :data-run-id="run.id"
              :data-script-name="option.scriptName"
              :disabled="isRunningValidation(run.id, option.scriptName)"
              @click="runWorkflowValidation(run.id, option.scriptName)"
            >
              {{ validationRunButtonLabel(option.scriptName, run.id) }}
            </button>
          </div>
          <p v-if="validationResults[run.id]" class="workspace-workflow-validation-result" :data-status="validationResults[run.id].status">
            {{ validationResultLabel(validationResults[run.id]) }}
          </p>
        </details>

        <section
          v-if="deliveryDraftsByRunId[run.id]"
          class="workspace-workflow-delivery"
          data-testid="workflow-delivery-panel"
          :data-run-id="run.id"
          aria-label="Workflow delivery draft"
        >
          <header>
            <h5>Delivery Draft</h5>
            <span>{{ deliveryDraftsByRunId[run.id].reviewDraft.fileCount }} files</span>
          </header>
          <label>
            <span>Title</span>
            <input :value="deliveryDraftsByRunId[run.id].title" readonly>
          </label>
          <label>
            <span>Commit message</span>
            <textarea :value="deliveryDraftsByRunId[run.id].commitMessage" readonly />
          </label>
          <label>
            <span>PR body</span>
            <textarea :value="deliveryDraftsByRunId[run.id].body" readonly />
          </label>
          <ul v-if="deliveryDraftsByRunId[run.id].riskSummary.length > 0">
            <li v-for="risk in workflowDeliveryRiskSummaryPreview(deliveryDraftsByRunId[run.id])" :key="risk">{{ risk }}</li>
          </ul>
          <p v-if="deliveryErrors[run.id]" class="workspace-workflow-delivery-error">{{ deliveryErrors[run.id] }}</p>
        </section>

        <section
          v-if="expandedReplayRunId === run.id"
          class="workspace-workflow-replay"
          data-testid="workflow-replay-panel"
          :data-run-id="run.id"
          aria-label="Workflow replay"
        >
          <p v-if="replayErrors[run.id]" class="workspace-workflow-replay-error">{{ replayErrors[run.id] }}</p>
          <p v-else-if="isLoadingReplay(run.id)" class="workspace-workflow-replay-empty">Loading replay...</p>
          <template v-else-if="replaysByRunId[run.id]">
            <div class="workspace-workflow-replay-summary">
              <span v-for="item in replaysByRunId[run.id].evidenceSummary" :key="item">{{ item }}</span>
            </div>
            <div class="workspace-workflow-replay-agents" aria-label="Replay agent snapshots">
              <span v-for="agent in replaysByRunId[run.id].agentSnapshots" :key="agent.id">
                {{ replayAgentSnapshotLabel(agent) }}
              </span>
            </div>
            <ol v-if="replaysByRunId[run.id].events.length > 0" class="workspace-workflow-replay-events">
              <li
                v-for="event in replaysByRunId[run.id].events"
                :key="event.id"
                :data-severity="event.severity"
              >
                <time>{{ formatTime(event.createdAtIso) }}</time>
                <strong>{{ event.title }}</strong>
                <span>{{ replayEventMetaLabel(event) }}</span>
                <p>{{ event.summary }}</p>
              </li>
            </ol>
            <p v-else class="workspace-workflow-replay-empty">No audited workflow events were captured for this run.</p>
          </template>
        </section>
      </li>
    </ol>
    <p v-else class="workspace-workflow-empty">No workflow runs yet. Create one to turn a request into agent steps.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  applyWorkspaceWorkflowImplementation,
  createWorkspaceWorkflowRun,
  discardWorkspaceWorkflowImplementation,
  fetchWorkspaceWorkflowDeliveryDraft,
  fetchWorkspaceWorkflowReplay,
  fetchWorkspaceWorkflows,
  markWorkspaceWorkflowMerged,
  markWorkspaceWorkflowReadyToMerge,
  provisionWorkspaceWorkflowAgentWorktree,
  runWorkspaceWorkflowValidation,
  updateWorkspaceWorkflowAgentStatus,
} from '../../api/codexWorkflowClient'
import {
  canApplyWorkflowImplementation as canApplyImplementation,
  canBlockWorkflowAgent as canBlockAgent,
  canCompleteWorkflowAgent as canCompleteAgent,
  canCreateWorkflowRun,
  canDiscardWorkflowImplementation as canDiscardImplementation,
  canMarkMerged,
  canMarkReadyToMerge,
  canSkipWorkflowAgent as canSkipAgent,
  canStartWorkflowAgent as canStartAgent,
  workflowAgentWorktreeButtonLabel,
  workflowAppliedImplementationSummary,
  workflowAcceptanceRisksPreview,
  emptyWorkflowPanelState,
  formatWorkflowStatus as formatStatus,
  formatWorkflowTime as formatTime,
  hasWorkflowImplementationActions as hasImplementationActions,
  runnableValidationOptions,
  workspaceWorkflowSummary,
  workflowAgentKey as agentKey,
  workflowDeliveryButtonLabel,
  workflowCreateButtonLabel,
  workflowDeliveryKey,
  workflowDeliveryMergedButtonLabel,
  workflowDeliveryRiskSummaryPreview,
  workflowDeliveryReadyButtonLabel,
  workflowDeliveryStateSummary,
  workflowImplementationDiffLabel,
  workflowImplementationRisksPreview,
  isWorkflowAgentProvisioning,
  isWorkflowAgentUpdating,
  isWorkflowDeliveryLoading,
  isWorkflowDeliveryUpdating,
  isWorkflowImplementationApplying,
  isWorkflowImplementationDiscarding,
  isWorkflowReplayLoading,
  isWorkflowValidationRunning,
  workflowImplementationApplyLabel,
  workflowImplementationDiscardLabel,
  workflowImplementationOptions as implementationOptions,
  workflowImplementationOptionsSummary as implementationOptionsSummary,
  workflowReplayAgentSnapshotLabel,
  prependWorkflowRun,
  replaceWorkflowRun,
  setWorkflowDeliveryDraftForRun,
  setWorkflowReplayForRun,
  setWorkflowRunError,
  setWorkflowValidationResult,
  workflowReplayEventMetaLabel,
  workflowReplayButtonLabel,
  workflowRunMetaLabels,
  workflowRunWarningsPreview,
  workflowTemplateMetaLabels,
  workflowValidationResultLabel,
  workflowValidationRunButtonLabel,
  workflowValidationKey as validationKey,
  workflowWorktreeLabel as worktreeLabel,
  type WorkflowValidationResultSummary,
} from '../../composables/workspaceWorkflowRules'
import type {
  UiWorkflowAgentStep,
  UiWorkflowDeliveryDraft,
  UiWorkflowImplementationOption,
  UiWorkflowReplay,
  UiWorkflowRun,
  UiWorkflowStepStatus,
  UiWorkflowTemplate,
} from '../../types/codex'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'

const props = defineProps<{
  cwd: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const templates = ref<UiWorkflowTemplate[]>([])
const runs = ref<UiWorkflowRun[]>([])
const selectedTemplateId = ref('')
const goalDraft = ref('')
const isLoading = ref(false)
const isCreating = ref(false)
const updatingAgentKey = ref('')
const provisioningAgentKey = ref('')
const applyingImplementationKey = ref('')
const discardingImplementationKey = ref('')
const runningValidationKey = ref('')
const expandedReplayRunId = ref('')
const loadingReplayRunId = ref('')
const loadingDeliveryRunId = ref('')
const updatingDeliveryKey = ref('')
const replaysByRunId = ref<Record<string, UiWorkflowReplay>>({})
const replayErrors = ref<Record<string, string>>({})
const deliveryDraftsByRunId = ref<Record<string, UiWorkflowDeliveryDraft>>({})
const deliveryErrors = ref<Record<string, string>>({})
const validationResults = ref<Record<string, WorkflowValidationResultSummary>>({})
const errorMessage = ref('')

const workflowBusyKeys = computed(() => ({
  updatingAgentKey: updatingAgentKey.value,
  provisioningAgentKey: provisioningAgentKey.value,
  applyingImplementationKey: applyingImplementationKey.value,
  discardingImplementationKey: discardingImplementationKey.value,
  runningValidationKey: runningValidationKey.value,
  loadingReplayRunId: loadingReplayRunId.value,
  loadingDeliveryRunId: loadingDeliveryRunId.value,
  updatingDeliveryKey: updatingDeliveryKey.value,
}))

const selectedTemplate = computed(() =>
  templates.value.find((template) => template.id === selectedTemplateId.value) ?? templates.value[0] ?? null
)
const templateMetaLabels = computed(() => selectedTemplate.value
  ? workflowTemplateMetaLabels({
    agentCount: selectedTemplate.value.steps.length,
    defaultStatus: selectedTemplate.value.defaultStatus,
  })
  : []
)
const summaryText = computed(() => workspaceWorkflowSummary({
  isLoading: isLoading.value,
  runCount: runs.value.length,
  templateCount: templates.value.length,
}))
const createButtonLabel = computed(() => workflowCreateButtonLabel(isCreating.value))
const canSubmitCreateRun = computed(() => canCreateWorkflowRun({
  cwd: props.cwd,
  selectedTemplateId: selectedTemplateId.value,
  goalDraft: goalDraft.value,
  isCreating: isCreating.value,
}))

function isUpdatingAgent(runId: string, agentId: string): boolean {
  return isWorkflowAgentUpdating(workflowBusyKeys.value, runId, agentId)
}

function isProvisioningAgent(runId: string, agentId: string): boolean {
  return isWorkflowAgentProvisioning(workflowBusyKeys.value, runId, agentId)
}

function isApplyingImplementation(runId: string, agentId: string): boolean {
  return isWorkflowImplementationApplying(workflowBusyKeys.value, runId, agentId)
}

function isDiscardingImplementation(runId: string, agentId: string): boolean {
  return isWorkflowImplementationDiscarding(workflowBusyKeys.value, runId, agentId)
}

function isRunningValidation(runId: string, scriptName: string): boolean {
  return isWorkflowValidationRunning(workflowBusyKeys.value, runId, scriptName)
}

function isLoadingReplay(runId: string): boolean {
  return isWorkflowReplayLoading(workflowBusyKeys.value, runId)
}

function isLoadingDelivery(runId: string): boolean {
  return isWorkflowDeliveryLoading(workflowBusyKeys.value, runId)
}

function isUpdatingDelivery(runId: string, action: 'ready' | 'merged'): boolean {
  return isWorkflowDeliveryUpdating(workflowBusyKeys.value, runId, action)
}

function replayButtonLabel(runId: string): string {
  return workflowReplayButtonLabel({
    isLoading: isLoadingReplay(runId),
    isExpanded: expandedReplayRunId.value === runId,
  })
}

function deliveryButtonLabel(runId: string): string {
  return workflowDeliveryButtonLabel({
    isLoading: isLoadingDelivery(runId),
    hasDraft: Boolean(deliveryDraftsByRunId.value[runId]),
  })
}

function deliveryReadyButtonLabel(runId: string): string {
  return workflowDeliveryReadyButtonLabel(isUpdatingDelivery(runId, 'ready'))
}

function deliveryMergedButtonLabel(runId: string): string {
  return workflowDeliveryMergedButtonLabel(isUpdatingDelivery(runId, 'merged'))
}

function runMetaLabels(run: UiWorkflowRun): string[] {
  return workflowRunMetaLabels(run)
}

function appliedImplementationSummary(run: UiWorkflowRun): string {
  return workflowAppliedImplementationSummary(run)
}

function deliveryStateSummary(run: UiWorkflowRun): string {
  return workflowDeliveryStateSummary(run)
}

function implementationDiffLabel(option: UiWorkflowImplementationOption): string {
  return workflowImplementationDiffLabel(option)
}

function implementationApplyLabel(run: UiWorkflowRun, option: UiWorkflowImplementationOption): string {
  return workflowImplementationApplyLabel(run, option, isApplyingImplementation(run.id, option.agentId))
}

function implementationDiscardLabel(run: UiWorkflowRun, option: UiWorkflowImplementationOption): string {
  return workflowImplementationDiscardLabel(run, option, isDiscardingImplementation(run.id, option.agentId))
}

function agentWorktreeButtonLabel(agent: UiWorkflowAgentStep, runId: string): string {
  return workflowAgentWorktreeButtonLabel({
    worktreeStatus: agent.worktreeStatus,
    isProvisioning: isProvisioningAgent(runId, agent.id),
  })
}

function validationRunButtonLabel(scriptName: string, runId: string): string {
  return workflowValidationRunButtonLabel(scriptName, isRunningValidation(runId, scriptName))
}

function validationResultLabel(result: WorkflowValidationResultSummary): string {
  return workflowValidationResultLabel(result)
}

function replayAgentSnapshotLabel(agent: UiWorkflowReplay['agentSnapshots'][number]): string {
  return workflowReplayAgentSnapshotLabel(agent)
}

function replayEventMetaLabel(event: UiWorkflowReplay['events'][number]): string {
  return workflowReplayEventMetaLabel(event)
}

function replaceRun(run: UiWorkflowRun): void {
  runs.value = replaceWorkflowRun(runs.value, run)
}

async function updateAgentStatus(
  runId: string,
  agentId: string,
  status: UiWorkflowStepStatus,
): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  updatingAgentKey.value = agentKey(runId, agentId)
  errorMessage.value = ''
  try {
    const run = await updateWorkspaceWorkflowAgentStatus(cwd, runId, agentId, status)
    replaceRun(run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to update workflow agent status.'
  } finally {
    updatingAgentKey.value = ''
  }
}

async function provisionAgentWorktree(runId: string, agentId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  provisioningAgentKey.value = agentKey(runId, agentId)
  errorMessage.value = ''
  try {
    const run = await provisionWorkspaceWorkflowAgentWorktree(cwd, runId, agentId)
    replaceRun(run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to provision workflow agent worktree.'
  } finally {
    provisioningAgentKey.value = ''
  }
}

async function applyImplementation(runId: string, agentId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  applyingImplementationKey.value = agentKey(runId, agentId)
  errorMessage.value = ''
  try {
    const result = await applyWorkspaceWorkflowImplementation(cwd, runId, agentId)
    replaceRun(result.run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to apply workflow implementation.'
  } finally {
    applyingImplementationKey.value = ''
  }
}

async function discardImplementation(runId: string, agentId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  discardingImplementationKey.value = agentKey(runId, agentId)
  errorMessage.value = ''
  try {
    const result = await discardWorkspaceWorkflowImplementation(cwd, runId, agentId)
    replaceRun(result.run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to discard workflow implementation.'
  } finally {
    discardingImplementationKey.value = ''
  }
}

async function toggleWorkflowReplay(runId: string): Promise<void> {
  if (expandedReplayRunId.value === runId) {
    expandedReplayRunId.value = ''
    return
  }

  expandedReplayRunId.value = runId
  if (replaysByRunId.value[runId]) return

  const cwd = props.cwd.trim()
  if (!cwd) return

  loadingReplayRunId.value = runId
  replayErrors.value = setWorkflowRunError(replayErrors.value, runId, '')
  try {
    const replay = await fetchWorkspaceWorkflowReplay(cwd, runId)
    replaysByRunId.value = setWorkflowReplayForRun(replaysByRunId.value, runId, replay)
  } catch (error) {
    replayErrors.value = setWorkflowRunError(
      replayErrors.value,
      runId,
      error instanceof Error ? error.message : 'Failed to load workflow replay.',
    )
  } finally {
    loadingReplayRunId.value = ''
  }
}

async function loadWorkflowDeliveryDraft(runId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  loadingDeliveryRunId.value = runId
  deliveryErrors.value = setWorkflowRunError(deliveryErrors.value, runId, '')
  try {
    const draft = await fetchWorkspaceWorkflowDeliveryDraft(cwd, runId)
    deliveryDraftsByRunId.value = setWorkflowDeliveryDraftForRun(deliveryDraftsByRunId.value, runId, draft)
  } catch (error) {
    deliveryErrors.value = setWorkflowRunError(
      deliveryErrors.value,
      runId,
      error instanceof Error ? error.message : 'Failed to generate workflow delivery draft.',
    )
  } finally {
    loadingDeliveryRunId.value = ''
  }
}

async function markReadyToMerge(runId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  updatingDeliveryKey.value = workflowDeliveryKey(runId, 'ready')
  errorMessage.value = ''
  try {
    const result = await markWorkspaceWorkflowReadyToMerge(cwd, runId)
    replaceRun(result.run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to mark workflow ready to merge.'
  } finally {
    updatingDeliveryKey.value = ''
  }
}

async function markMerged(runId: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  updatingDeliveryKey.value = workflowDeliveryKey(runId, 'merged')
  errorMessage.value = ''
  try {
    const result = await markWorkspaceWorkflowMerged({ cwd, runId })
    replaceRun(result.run)
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to mark workflow merged.'
  } finally {
    updatingDeliveryKey.value = ''
  }
}

async function runWorkflowValidation(runId: string, scriptName: string): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return

  runningValidationKey.value = validationKey(runId, scriptName)
  errorMessage.value = ''
  try {
    const result = await runWorkspaceWorkflowValidation(cwd, runId, scriptName)
    replaceRun(result.run)
    replaysByRunId.value = setWorkflowReplayForRun(replaysByRunId.value, runId, result.replay)
    validationResults.value = setWorkflowValidationResult(
      validationResults.value,
      runId,
      {
        command: result.validationRun.command,
        status: result.validationRun.status,
      },
    )
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : `Failed to run ${scriptName}.`
  } finally {
    runningValidationKey.value = ''
  }
}

async function loadWorkflows(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    const emptyState = emptyWorkflowPanelState()
    templates.value = []
    runs.value = emptyState.runs
    selectedTemplateId.value = emptyState.selectedTemplateId
    expandedReplayRunId.value = emptyState.expandedReplayRunId
    replaysByRunId.value = emptyState.replaysByRunId
    replayErrors.value = emptyState.replayErrors
    deliveryDraftsByRunId.value = emptyState.deliveryDraftsByRunId
    deliveryErrors.value = emptyState.deliveryErrors
    validationResults.value = emptyState.validationResults
    errorMessage.value = emptyState.errorMessage
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    const dashboard = await fetchWorkspaceWorkflows(cwd, 12)
    templates.value = dashboard.templates
    runs.value = dashboard.runs
    if (!selectedTemplateId.value || !templates.value.some((template) => template.id === selectedTemplateId.value)) {
      selectedTemplateId.value = templates.value[0]?.id ?? ''
    }
  } catch (error) {
    templates.value = []
    runs.value = []
    selectedTemplateId.value = ''
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load workflow runs.'
  } finally {
    isLoading.value = false
  }
}

async function createRun(): Promise<void> {
  const cwd = props.cwd.trim()
  const templateId = selectedTemplateId.value.trim()
  const goal = goalDraft.value.trim()
  if (!cwd || !templateId || !goal) return

  isCreating.value = true
  errorMessage.value = ''
  try {
    const run = await createWorkspaceWorkflowRun(cwd, templateId, goal)
    runs.value = prependWorkflowRun(runs.value, run, 12)
    goalDraft.value = ''
    emit('changed')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create workflow run.'
  } finally {
    isCreating.value = false
  }
}

watch(
  () => props.cwd,
  () => {
    void loadWorkflows()
  },
  { immediate: true },
)
</script>

<style scoped>
@reference "tailwindcss";

.workspace-workflow-panel {
  @apply rounded-lg border border-zinc-200 bg-white p-3;
}

.workspace-workflow-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-workflow-title {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-workflow-subtitle {
  @apply m-0 mt-1 text-xs text-zinc-600;
}

.workspace-workflow-refresh {
  @apply inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-workflow-refresh-icon {
  @apply h-3.5 w-3.5;
}

.workspace-workflow-error {
  @apply m-0 mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700;
}

.workspace-workflow-form {
  @apply mt-3 grid grid-cols-[12rem_minmax(0,1fr)_auto] items-end gap-2;
}

.workspace-workflow-form label {
  @apply grid gap-1;
}

.workspace-workflow-form span {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
}

.workspace-workflow-form select,
.workspace-workflow-form textarea {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-blue-300;
}

.workspace-workflow-form select {
  @apply h-8;
}

.workspace-workflow-form textarea {
  @apply h-16 resize-y py-2;
}

.workspace-workflow-create {
  @apply inline-flex h-8 shrink-0 items-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-workflow-template {
  @apply mt-3 flex items-start justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-workflow-template-copy {
  @apply min-w-0;
}

.workspace-workflow-template h4,
.workspace-workflow-run h4,
.workspace-workflow-agent h5 {
  @apply m-0 text-sm font-semibold text-zinc-950;
}

.workspace-workflow-template p,
.workspace-workflow-run p,
.workspace-workflow-agent p {
  @apply m-0 mt-1 text-xs leading-5 text-zinc-600;
}

.workspace-workflow-template-meta,
.workspace-workflow-run-meta,
.workspace-workflow-risk-list {
  @apply flex shrink-0 flex-wrap gap-1.5;
}

.workspace-workflow-template-meta span,
.workspace-workflow-run-meta span,
.workspace-workflow-risk-list span {
  @apply rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-medium text-zinc-600;
}

.workspace-workflow-list {
  @apply m-0 mt-3 grid list-none gap-2 p-0;
}

.workspace-workflow-run {
  @apply rounded-md border border-zinc-200 bg-white p-3;
}

.workspace-workflow-run[data-status='blocked'],
.workspace-workflow-run[data-status='failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-workflow-run[data-status='ready_for_execution'],
.workspace-workflow-run[data-status='ready_for_review'] {
  @apply border-blue-200 bg-blue-50;
}

.workspace-workflow-run[data-status='ready_to_merge'],
.workspace-workflow-run[data-status='merged'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-workflow-run-header {
  @apply flex items-start justify-between gap-3;
}

.workspace-workflow-run-copy {
  @apply min-w-0;
}

.workspace-workflow-run-actions {
  @apply flex shrink-0 flex-wrap items-center justify-end gap-1.5;
}

.workspace-workflow-run-template,
.workspace-workflow-agent-role {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
}

.workspace-workflow-run-status,
.workspace-workflow-agent-status {
  @apply shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-medium text-zinc-700;
}

.workspace-workflow-run-actions button {
  @apply inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[0.68rem] font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.workspace-workflow-run-meta,
.workspace-workflow-risk-list,
.workspace-workflow-warning-list {
  @apply mt-2;
}

.workspace-workflow-warning-list {
  @apply grid gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800;
}

.workspace-workflow-acceptance {
  @apply mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-workflow-acceptance[data-status='accepted'],
.workspace-workflow-acceptance[data-status='ready_for_review'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-workflow-acceptance[data-status='pending_worktree'],
.workspace-workflow-acceptance[data-status='waiting_for_agents'],
.workspace-workflow-acceptance[data-status='waiting_for_validation'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-workflow-acceptance[data-status='validation_failed'],
.workspace-workflow-acceptance[data-status='blocked'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-workflow-acceptance header {
  @apply flex items-center justify-between gap-3;
}

.workspace-workflow-acceptance h5 {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-workflow-acceptance header strong {
  @apply shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-medium text-zinc-700;
}

.workspace-workflow-acceptance p {
  @apply m-0 mt-1 text-xs leading-5 text-zinc-600;
}

.workspace-workflow-acceptance dl {
  @apply mt-2 grid grid-cols-4 gap-1;
}

.workspace-workflow-acceptance dl div {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white px-1.5 py-1;
}

.workspace-workflow-acceptance dt {
  @apply text-[0.64rem] font-semibold uppercase text-zinc-500;
}

.workspace-workflow-acceptance dd {
  @apply m-0 truncate text-xs text-zinc-800;
}

.workspace-workflow-acceptance code {
  @apply mt-2 block truncate rounded-md border border-zinc-200 bg-white px-1.5 py-1 font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-workflow-acceptance ul {
  @apply m-0 mt-2 grid gap-1 p-0 text-xs leading-5 text-zinc-700;
}

.workspace-workflow-applied {
  @apply mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[0.68rem] leading-4 text-emerald-800;
}

.workspace-workflow-delivery-state {
  @apply mt-2 rounded-md border border-emerald-200 bg-white px-2 py-1 font-mono text-[0.68rem] leading-4 text-emerald-800;
}

.workspace-workflow-options {
  @apply mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-workflow-options-header {
  @apply flex items-center justify-between gap-3;
}

.workspace-workflow-options-header h5 {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-workflow-options-header span {
  @apply text-[0.68rem] font-medium text-zinc-500;
}

.workspace-workflow-options-grid {
  @apply mt-2 grid grid-cols-2 gap-2;
}

.workspace-workflow-option {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white p-2;
}

.workspace-workflow-option[data-status='ready_to_merge'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-workflow-option[data-status='validation_missing'],
.workspace-workflow-option[data-status='pending_worktree'] {
  @apply border-amber-200 bg-amber-50;
}

.workspace-workflow-option[data-status='validation_failed'] {
  @apply border-rose-200 bg-rose-50;
}

.workspace-workflow-option[data-status='discarded'] {
  @apply border-zinc-300 bg-zinc-100 opacity-80;
}

.workspace-workflow-option header {
  @apply flex items-start justify-between gap-2;
}

.workspace-workflow-option header span {
  @apply min-w-0 truncate text-xs font-semibold text-zinc-900;
}

.workspace-workflow-option header strong {
  @apply shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[0.68rem] font-medium text-zinc-700;
}

.workspace-workflow-option p {
  @apply m-0 mt-1 text-xs leading-5 text-zinc-600;
}

.workspace-workflow-option dl {
  @apply mt-2 grid grid-cols-4 gap-1;
}

.workspace-workflow-option dl div {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white px-1.5 py-1;
}

.workspace-workflow-option dt {
  @apply text-[0.64rem] font-semibold uppercase text-zinc-500;
}

.workspace-workflow-option dd {
  @apply m-0 truncate text-xs text-zinc-800;
}

.workspace-workflow-option code {
  @apply mt-2 block truncate rounded-md border border-zinc-200 bg-white px-1.5 py-1 font-mono text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-workflow-option-actions {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-workflow-option-actions button {
  @apply inline-flex h-7 items-center rounded-md border border-emerald-200 bg-white px-2 text-[0.68rem] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.workspace-workflow-option-actions button[data-tone='danger'] {
  @apply border-rose-200 text-rose-700 hover:bg-rose-50;
}

.workspace-workflow-option ul {
  @apply m-0 mt-2 grid gap-1 p-0 text-xs leading-5 text-zinc-700;
}

.workspace-workflow-agent-grid {
  @apply mt-3 grid grid-cols-2 gap-2;
}

.workspace-workflow-agent {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white p-2;
}

.workspace-workflow-agent[data-status='ready'] {
  @apply border-emerald-200 bg-emerald-50;
}

.workspace-workflow-agent-header {
  @apply mb-1 flex items-center justify-between gap-2;
}

.workspace-workflow-agent dl {
  @apply mt-2 grid grid-cols-2 gap-1;
}

.workspace-workflow-agent dl div {
  @apply min-w-0 rounded-md border border-zinc-200 bg-white px-1.5 py-1;
}

.workspace-workflow-agent dt {
  @apply text-[0.64rem] font-semibold uppercase text-zinc-500;
}

.workspace-workflow-agent dd {
  @apply m-0 truncate text-xs text-zinc-800;
}

.workspace-workflow-agent-actions {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-workflow-agent-actions button {
  @apply inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[0.68rem] font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
}

.workspace-workflow-agent-actions button[data-testid='workflow-agent-complete'] {
  @apply border-emerald-200 text-emerald-700;
}

.workspace-workflow-agent-actions button[data-testid='workflow-agent-block'] {
  @apply border-amber-200 text-amber-700;
}

.workspace-workflow-agent-actions button[data-testid='workflow-agent-provision-worktree'] {
  @apply border-blue-200 text-blue-700;
}

.workspace-workflow-agent-branch,
.workspace-workflow-agent-path {
  @apply m-0 mt-2 truncate font-mono text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-workflow-briefing,
.workspace-workflow-validation {
  @apply mt-2 border-t border-zinc-200 pt-2;
}

.workspace-workflow-briefing summary,
.workspace-workflow-validation summary {
  @apply cursor-pointer text-xs font-medium text-zinc-700;
}

.workspace-workflow-briefing pre {
  @apply mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-950 p-2 font-mono text-[0.68rem] leading-4 text-zinc-100;
}

.workspace-workflow-validation ul {
  @apply m-0 mt-2 grid gap-1 p-0 text-xs text-zinc-700;
}

.workspace-workflow-validation-actions {
  @apply mt-2 flex flex-wrap gap-1.5;
}

.workspace-workflow-validation-actions button {
  @apply inline-flex h-7 items-center rounded-md border border-emerald-200 bg-white px-2 text-[0.68rem] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60;
}

.workspace-workflow-validation-result {
  @apply mt-2 rounded-md border px-2 py-1 font-mono text-[0.68rem] leading-4;
}

.workspace-workflow-validation-result[data-status='passed'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-800;
}

.workspace-workflow-validation-result[data-status='failed'],
.workspace-workflow-validation-result[data-status='timed_out'] {
  @apply border-rose-200 bg-rose-50 text-rose-800;
}

.workspace-workflow-delivery {
  @apply mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2;
}

.workspace-workflow-delivery header {
  @apply flex items-center justify-between gap-3;
}

.workspace-workflow-delivery h5 {
  @apply m-0 text-xs font-semibold uppercase tracking-normal text-zinc-500;
}

.workspace-workflow-delivery header span {
  @apply text-[0.68rem] font-medium text-zinc-500;
}

.workspace-workflow-delivery label {
  @apply mt-2 grid gap-1;
}

.workspace-workflow-delivery label span {
  @apply text-[0.68rem] font-semibold uppercase leading-4 text-zinc-500;
}

.workspace-workflow-delivery input,
.workspace-workflow-delivery textarea {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-mono text-[0.68rem] leading-4 text-zinc-800 outline-none;
}

.workspace-workflow-delivery textarea {
  @apply min-h-24 resize-y;
}

.workspace-workflow-delivery label:nth-of-type(3) textarea {
  @apply min-h-48;
}

.workspace-workflow-delivery ul {
  @apply m-0 mt-2 grid gap-1 p-0 text-xs leading-5 text-zinc-700;
}

.workspace-workflow-delivery-error {
  @apply mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700;
}

.workspace-workflow-replay {
  @apply mt-3 border-t border-zinc-200 pt-3;
}

.workspace-workflow-replay-summary,
.workspace-workflow-replay-agents {
  @apply flex flex-wrap gap-1.5;
}

.workspace-workflow-replay-summary span,
.workspace-workflow-replay-agents span {
  @apply rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[0.68rem] leading-4 text-zinc-600;
}

.workspace-workflow-replay-agents {
  @apply mt-2;
}

.workspace-workflow-replay-events {
  @apply relative m-0 mt-3 grid list-none gap-2 p-0 pl-3;
}

.workspace-workflow-replay-events::before {
  @apply absolute bottom-1 left-0 top-1 w-px bg-zinc-200 content-[''];
}

.workspace-workflow-replay-events li {
  @apply relative rounded-md border border-zinc-200 bg-white px-2 py-1.5;
}

.workspace-workflow-replay-events li::before {
  @apply absolute -left-[0.95rem] top-3 h-2 w-2 rounded-full border border-white bg-zinc-400 content-[''];
}

.workspace-workflow-replay-events li[data-severity='success']::before {
  @apply bg-emerald-500;
}

.workspace-workflow-replay-events li[data-severity='warning']::before {
  @apply bg-amber-500;
}

.workspace-workflow-replay-events li[data-severity='danger']::before {
  @apply bg-rose-500;
}

.workspace-workflow-replay-events time,
.workspace-workflow-replay-events span {
  @apply block text-[0.68rem] leading-4 text-zinc-500;
}

.workspace-workflow-replay-events strong {
  @apply block text-xs font-semibold text-zinc-900;
}

.workspace-workflow-replay-events p {
  @apply m-0 mt-1 text-xs leading-5 text-zinc-600;
}

.workspace-workflow-replay-empty,
.workspace-workflow-replay-error {
  @apply m-0 rounded-md border px-2 py-1 text-xs;
}

.workspace-workflow-replay-empty {
  @apply border-dashed border-zinc-200 text-zinc-500;
}

.workspace-workflow-replay-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.workspace-workflow-empty {
  @apply m-0 mt-3 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500;
}

@media (max-width: 920px) {
  .workspace-workflow-form,
  .workspace-workflow-agent-grid,
  .workspace-workflow-options-grid {
    @apply grid-cols-1;
  }

  .workspace-workflow-template,
  .workspace-workflow-run-header {
    @apply flex-col;
  }
}
</style>
