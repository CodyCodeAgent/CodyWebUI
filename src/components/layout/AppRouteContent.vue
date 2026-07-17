<template>
  <AppSettingsPage v-if="isSettingsRoute" :projects="newThreadProjectOptions" @select-thread="emit('selectThread', $event)" />
  <WorkspaceSkillsPage v-else-if="isSkillsRoute" :cwd="skillsCwd" :project-label="skillsProjectLabel" />
  <template v-else-if="isHomeRoute">
    <nav class="mission-stage-nav" :aria-label="t('app.taskStages')">
      <button v-for="(stage, index) in missionStages" :key="stage.id" type="button" :data-active="stage.id === activeMissionStage" :aria-current="stage.id === activeMissionStage ? 'step' : undefined">
        <b aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</b><span>{{ stage.label }}</span><small>{{ stage.hint }}</small>
      </button>
    </nav>
    <WorkspaceDashboard v-if="homeSurface === 'console'" :cwd="newThreadCwd" :project-label="newThreadProjectLabel"
      :threads="allThreads" :pending-requests="allPendingServerRequests" :rate-limit-snapshot="rateLimitSnapshot"
      @select-thread="emit('selectThread', $event)" @respond-server-request="emit('respondServerRequest', $event)" />
    <div v-else class="content-grid new-thread-grid">
      <div class="new-thread-empty">
        <div class="new-thread-kicker"><span class="new-thread-kicker-signal" aria-hidden="true" />{{ t('app.missionControl') }}</div>
        <p class="new-thread-hero">{{ t('app.hero') }}</p>
        <p class="new-thread-subtitle">{{ t('app.heroSubtitle') }}</p>
        <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd" :options="newThreadFolderOptions"
          :placeholder="t('app.chooseFolder')" :disabled="newThreadFolderOptions.length === 0"
          @update:model-value="emit('selectNewThreadFolder', $event)" />
      </div>
      <ThreadComposer :active-thread-id="composerThreadContextId" :disabled="isSendingMessage" :prompt-insertion="promptInsertion"
        :models="availableModelIds" :selected-model="selectedModelId" :selected-reasoning-effort="selectedReasoningEffort"
        :collaboration-modes="collaborationModeOptions" :selected-collaboration-mode="selectedCollaborationModeName"
        :selected-permission-mode="selectedPermissionMode" :busy-label="homeComposerBusyLabel" :is-turn-in-progress="false"
        :is-interrupting-turn="false" :cwd="newThreadCwd" @submit="emit('submitMessage', $event)"
        @update:selected-model="emit('selectModel', $event)" @update:selected-reasoning-effort="emit('selectReasoningEffort', $event)"
        @update:selected-collaboration-mode="emit('selectCollaborationMode', $event)"
        @update:selected-permission-mode="emit('selectPermissionMode', $event)" />
    </div>
  </template>
  <div v-else class="content-grid">
    <div class="content-workbench"><div class="content-thread">
      <ThreadConversation :messages="filteredMessages" :is-loading="isLoadingMessages" :cwd="selectedThread?.cwd ?? ''"
        :load-error="selectedMessageLoadError" :active-thread-id="composerThreadContextId" :scroll-state="selectedThreadScrollState"
        :live-overlay="liveOverlay" :pending-requests="selectedThreadServerRequests"
        @update-scroll-state="emit('updateScrollState', $event)" @respond-server-request="emit('respondServerRequest', $event)"
        @retry-load="emit('retryLoad')" />
    </div></div>
    <ThreadComposer :active-thread-id="composerThreadContextId" :prompt-insertion="promptInsertion" :disabled="isSendingMessage"
      :models="availableModelIds" :selected-model="selectedModelId" :selected-reasoning-effort="selectedReasoningEffort"
      :collaboration-modes="collaborationModeOptions" :selected-collaboration-mode="selectedCollaborationModeName"
      :selected-permission-mode="selectedPermissionMode" :busy-label="threadComposerBusyLabel" :cwd="selectedThread?.cwd ?? ''"
      :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn"
      @submit="emit('submitMessage', $event)" @update:selected-model="emit('selectModel', $event)"
      @update:selected-reasoning-effort="emit('selectReasoningEffort', $event)"
      @update:selected-collaboration-mode="emit('selectCollaborationMode', $event)"
      @update:selected-permission-mode="emit('selectPermissionMode', $event)" @interrupt="emit('interrupt')" />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { PromptInsertion } from '../../composables/promptLibraryRules'
import { useLocale } from '../../composables/useLocale'
import type { ReasoningEffort, ThreadScrollState, UiCollaborationModeOption, UiComposerPermissionMode, UiComposerSubmitPayload, UiLiveOverlay, UiMessage, UiRateLimitSnapshot, UiServerRequest, UiServerRequestReply, UiThread } from '../../types/codex'
import ComposerDropdown from '../content/ComposerDropdown.vue'
import ThreadComposer from '../content/ThreadComposer.vue'
import ThreadConversation from '../content/ThreadConversation.vue'
import type { NewThreadProjectOption } from '../content/NewThreadSetupModal.vue'

const WorkspaceDashboard = defineAsyncComponent(() => import('../content/WorkspaceDashboard.vue'))
const AppSettingsPage = defineAsyncComponent(() => import('../content/AppSettingsPage.vue'))
const WorkspaceSkillsPage = defineAsyncComponent(() => import('../content/WorkspaceSkillsPage.vue'))
defineProps<{
  isSettingsRoute: boolean; isSkillsRoute: boolean; isHomeRoute: boolean
  newThreadProjectOptions: NewThreadProjectOption[]; skillsCwd: string; skillsProjectLabel: string
  missionStages: readonly { id: string; label: string; hint: string }[]; activeMissionStage: string; homeSurface: 'brief' | 'console'
  newThreadCwd: string; newThreadProjectLabel: string; allThreads: UiThread[]; allPendingServerRequests: UiServerRequest[]
  rateLimitSnapshot: UiRateLimitSnapshot | null; newThreadFolderOptions: { value: string; label: string }[]
  composerThreadContextId: string; isSendingMessage: boolean; promptInsertion: PromptInsertion | null; availableModelIds: string[]
  selectedModelId: string; selectedReasoningEffort: ReasoningEffort | ''; collaborationModeOptions: UiCollaborationModeOption[]
  selectedCollaborationModeName: string; selectedPermissionMode: UiComposerPermissionMode; homeComposerBusyLabel: string
  filteredMessages: UiMessage[]; isLoadingMessages: boolean; selectedThread: UiThread | null; selectedMessageLoadError: string
  selectedThreadScrollState: ThreadScrollState | null; liveOverlay: UiLiveOverlay | null; selectedThreadServerRequests: UiServerRequest[]
  threadComposerBusyLabel: string; isSelectedThreadInProgress: boolean; isInterruptingTurn: boolean
}>()
const emit = defineEmits<{
  selectThread: [string]; respondServerRequest: [UiServerRequestReply]; selectNewThreadFolder: [string]
  submitMessage: [UiComposerSubmitPayload]; selectModel: [string]; selectReasoningEffort: [ReasoningEffort | '']
  selectCollaborationMode: [string]; selectPermissionMode: [UiComposerPermissionMode]
  updateScrollState: [{ threadId: string; state: ThreadScrollState }]; retryLoad: []; interrupt: []
}>()
const { t } = useLocale()
</script>
