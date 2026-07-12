<template>
  <DesktopLayout
    :is-sidebar-collapsed="isEffectiveSidebarCollapsed"
    :class="themeRootClass"
    v-bind="themeAttributes"
  >
    <template #sidebar>
      <section class="sidebar-root">
        <SidebarThreadControls
          v-if="!isEffectiveSidebarCollapsed"
          class="sidebar-thread-controls-host"
          :is-sidebar-collapsed="isEffectiveSidebarCollapsed"
          :is-auto-refresh-enabled="isAutoRefreshEnabled"
          :auto-refresh-button-label="autoRefreshButtonLabel"
          :show-new-thread-button="true"
          @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
          @toggle-auto-refresh="onToggleAutoRefreshTimer"
          @start-new-thread="onStartNewThreadFromToolbar"
        >
          <button
            class="sidebar-search-toggle toolbar-secondary"
            type="button"
            data-theme-toggle="true"
            :aria-pressed="isDarkMode"
            :aria-label="isDarkMode ? t('app.theme.light') : t('app.theme.dark')"
            :title="isDarkMode ? t('app.theme.light') : t('app.theme.dark')"
            @click="toggleDarkMode"
          >
            <IconTablerSun v-if="isDarkMode" class="sidebar-search-toggle-icon" />
            <IconTablerMoon v-else class="sidebar-search-toggle-icon" />
          </button>
          <button
            class="sidebar-search-toggle toolbar-secondary"
            type="button"
            :aria-pressed="isSidebarSearchVisible"
            :aria-label="t('app.searchThreads')"
            :title="t('app.searchThreads')"
            @click="toggleSidebarSearch"
          >
            <IconTablerSearch class="sidebar-search-toggle-icon" />
          </button>
          <button
            class="sidebar-search-toggle toolbar-secondary"
            type="button"
            :aria-label="t('app.addProject')"
            :title="t('app.addProject')"
            @click="openDirectoryPicker"
          >
            <IconTablerFolder class="sidebar-search-toggle-icon" />
          </button>
          <button
            class="sidebar-search-toggle toolbar-secondary"
            type="button"
            :aria-pressed="isSettingsRoute"
            :aria-label="t('nav.settings')"
            :title="t('nav.settings')"
            @click="openSettings"
          >
            <IconTablerSettings class="sidebar-search-toggle-icon" />
          </button>
        </SidebarThreadControls>

        <div v-if="!isEffectiveSidebarCollapsed && isSidebarSearchVisible" class="sidebar-search-bar">
          <IconTablerSearch class="sidebar-search-bar-icon" />
          <input
            ref="sidebarSearchInputRef"
            v-model="sidebarSearchQuery"
            class="sidebar-search-input"
            type="text"
            :placeholder="t('app.filterThreads')"
            @keydown="onSidebarSearchKeydown"
          />
          <button
            v-if="sidebarSearchQuery.length > 0"
            class="sidebar-search-clear"
            type="button"
            :aria-label="t('app.clearSearch')"
            @click="clearSidebarSearch"
          >
            <IconTablerX class="sidebar-search-clear-icon" />
          </button>
        </div>

        <SidebarThreadTree :groups="projectGroups" :project-display-name-by-id="projectDisplayNameById"
          v-if="!isEffectiveSidebarCollapsed"
          :skill-counts-by-cwd="skillCountsByCwd"
          :selected-thread-id="selectedThreadId" :is-loading="isLoadingThreads"
          :selected-project-name="selectedSidebarProjectName"
          :search-query="sidebarSearchQuery" :is-hidden-view="isHiddenView"
          @select="onSelectThread"
          @hide="onHideThread" @restore="onRestoreThread" @fork="onForkThread"
          @compact="onCompactThread" @toggle-hidden-view="onToggleHiddenView"
          @rename-thread="onRenameThread" @select-project="onSelectProject" @start-new-thread="onStartNewThread" @rename-project="onRenameProject"
          @hide-project="onHideProject" @restore-project="onRestoreProject" @reorder-project="onReorderProject"
          @open-project-skills="onOpenProjectSkills" />
      </section>
    </template>

    <template #content>
      <section class="content-root">
        <ContentHeader :title="contentTitle">
          <template #leading>
            <SidebarThreadControls
              v-if="isEffectiveSidebarCollapsed"
              class="sidebar-thread-controls-header-host"
              :is-sidebar-collapsed="isEffectiveSidebarCollapsed"
              :is-auto-refresh-enabled="isAutoRefreshEnabled"
              :auto-refresh-button-label="autoRefreshButtonLabel"
              :show-new-thread-button="true"
              @toggle-sidebar="setSidebarCollapsed(!isSidebarCollapsed)"
              @toggle-auto-refresh="onToggleAutoRefreshTimer"
              @start-new-thread="onStartNewThreadFromToolbar"
            >
              <button
                class="sidebar-search-toggle toolbar-secondary"
                type="button"
                data-theme-toggle="true"
                :aria-pressed="isDarkMode"
                :aria-label="isDarkMode ? t('app.theme.light') : t('app.theme.dark')"
                :title="isDarkMode ? t('app.theme.light') : t('app.theme.dark')"
                @click="toggleDarkMode"
              >
                <IconTablerSun v-if="isDarkMode" class="sidebar-search-toggle-icon" />
                <IconTablerMoon v-else class="sidebar-search-toggle-icon" />
              </button>
              <button
                class="sidebar-search-toggle toolbar-secondary"
                type="button"
                :aria-label="t('app.addProject')"
                :title="t('app.addProject')"
                @click="openDirectoryPicker"
              >
                <IconTablerFolder class="sidebar-search-toggle-icon" />
              </button>
              <button
                class="sidebar-search-toggle toolbar-secondary"
                type="button"
                :aria-pressed="isSettingsRoute"
                :aria-label="t('nav.settings')"
                :title="t('nav.settings')"
                @click="openSettings"
              >
                <IconTablerSettings class="sidebar-search-toggle-icon" />
              </button>
            </SidebarThreadControls>
          </template>
          <template #actions>
            <button
              v-if="!isSettingsRoute && !isSkillsRoute"
              class="content-prompt-trigger"
              type="button"
              :aria-label="t('promptLibrary.open')"
              :title="t('promptLibrary.aria')"
              :aria-expanded="isPromptLibraryOpen"
              @click="isPromptLibraryOpen = true"
            >
              <IconTablerClipboardList />
            </button>
            <ThreadActivityPanel
              v-if="shouldShowWorkLogAction || allPendingServerRequests.length > 0"
              :messages="filteredMessages"
              :pending-requests="allPendingServerRequests"
              :cwd="selectedThread?.cwd ?? ''"
              :thread-id="selectedThreadId"
              @respond-server-request="onRespondServerRequest"
              @rollback-completed="onRollbackCompleted"
            />
            <div class="content-notifications-host">
              <BrowserNotificationsPanel
                :preference="browserNotifications.preference.value"
                :permission="browserNotifications.permission.value"
                :events="browserNotifications.events.value"
                :unread-count="browserNotifications.unreadCount.value"
                :is-supported="browserNotifications.isSupported.value"
                :last-error="browserNotifications.lastError.value"
                @update:preference="browserNotifications.setPreference"
                @request-permission="browserNotifications.requestPermission"
                @clear="browserNotifications.clearEvents"
              />
            </div>
          </template>
        </ContentHeader>

        <div v-if="!isSettingsRoute" class="workspace-context-bar" :aria-label="t('app.workspaceContext')">
          <span class="workspace-context-live" aria-hidden="true" />
          <span><small>{{ t('app.workspace') }}</small>{{ newThreadProjectLabel || t('app.notSelected') }}</span>
          <span><small>{{ t('app.path') }}</small>{{ tokenFlameCwd || '—' }}</span>
          <span><small>{{ t('app.permissions') }}</small>{{ selectedPermissionMode }}</span>
          <button
            v-if="tokenFlameCwd"
            type="button"
            :aria-label="t('skills.openProject')"
            @click="openCurrentWorkspaceSkills"
          >
            ◇ {{ activeWorkspaceSkillCount === null ? t('skills.title') : t('skills.count', { count: String(activeWorkspaceSkillCount) }) }}
          </button>
          <button v-if="isHomeRoute" type="button" @click="homeSurface = homeSurface === 'brief' ? 'console' : 'brief'">
            {{ homeSurface === 'brief' ? 'Open workspace console' : 'Back to brief' }}
          </button>
        </div>

        <RateLimitFloatingStatus
          :snapshot="rateLimitSnapshot"
          :is-loading="isLoadingRateLimits"
          @refresh="refreshRateLimits"
        />
        <TokenFlameWidget
          v-if="!isSettingsRoute && !isSkillsRoute && (!isHomeRoute || homeSurface === 'brief')"
          :cwd="tokenFlameCwd"
        />
        <MissionChecklist
          v-if="!isHomeRoute && !isSettingsRoute && !isSkillsRoute"
          :thread-id="selectedThreadId"
          :plan="selectedStructuredPlan"
          :is-turn-in-progress="isSelectedThreadInProgress"
          :has-pending-approval="selectedThreadServerRequests.length > 0"
        />

        <div v-if="desktopError" class="content-error" role="alert">
          <span class="content-error-text">{{ desktopError }}</span>
          <button class="content-error-dismiss" type="button" :aria-label="t('app.dismissError')" @click="clearError">
            <IconTablerX class="content-error-dismiss-icon" />
          </button>
        </div>

        <section class="content-body">
          <template v-if="isSettingsRoute">
            <AppSettingsPage />
          </template>
          <template v-else-if="isSkillsRoute">
            <WorkspaceSkillsPage :cwd="skillsCwd" :project-label="skillsProjectLabel" />
          </template>
          <template v-else-if="isHomeRoute">
            <nav class="mission-stage-nav" :aria-label="t('app.taskStages')">
              <button v-for="stage in missionStages" :key="stage.id" type="button" :data-active="stage.id === activeMissionStage">
                <span>{{ stage.label }}</span><small>{{ stage.hint }}</small>
              </button>
            </nav>
            <WorkspaceDashboard
              v-if="homeSurface === 'console'"
              :cwd="newThreadCwd"
              :project-label="newThreadProjectLabel"
              :threads="allThreads"
              :pending-requests="allPendingServerRequests"
              :rate-limit-snapshot="rateLimitSnapshot"
              @select-thread="onSelectThread"
              @respond-server-request="onRespondServerRequest"
            />
            <div v-else class="content-grid new-thread-grid">
              <div class="new-thread-empty">
                <div class="new-thread-kicker">
                  <span class="new-thread-kicker-signal" aria-hidden="true" />
                  Agent mission control
                </div>
                <p class="new-thread-hero">{{ t('app.hero') }}</p>
                <p class="new-thread-subtitle">{{ t('app.heroSubtitle') }}</p>
                <ComposerDropdown class="new-thread-folder-dropdown" :model-value="newThreadCwd"
                  :options="newThreadFolderOptions" :placeholder="t('app.chooseFolder')"
                  :disabled="newThreadFolderOptions.length === 0" @update:model-value="onSelectNewThreadFolder" />
              </div>

              <ThreadComposer :active-thread-id="composerThreadContextId" :disabled="isSendingMessage"
                :prompt-insertion="promptInsertion"
                :models="availableModelIds" :selected-model="selectedModelId"
                :selected-reasoning-effort="selectedReasoningEffort"
                :collaboration-modes="collaborationModeOptions"
                :selected-collaboration-mode="selectedCollaborationModeName"
                :selected-permission-mode="selectedPermissionMode"
                :busy-label="homeComposerBusyLabel"
                :is-turn-in-progress="false"
                :is-interrupting-turn="false" :cwd="newThreadCwd" @submit="onSubmitThreadMessage"
                @update:selected-model="onSelectModel" @update:selected-reasoning-effort="onSelectReasoningEffort"
                @update:selected-collaboration-mode="onSelectCollaborationMode"
                @update:selected-permission-mode="onSelectPermissionMode" />

            </div>
          </template>
          <template v-else>
            <div class="content-grid">
              <div class="content-workbench">
                <div class="content-thread">
                  <ThreadConversation :messages="filteredMessages" :is-loading="isLoadingMessages"
                    :cwd="selectedThread?.cwd ?? ''"
                    :load-error="selectedMessageLoadError"
                    :active-thread-id="composerThreadContextId" :scroll-state="selectedThreadScrollState"
                    :live-overlay="liveOverlay"
                    :pending-requests="selectedThreadServerRequests"
                    @update-scroll-state="onUpdateThreadScrollState"
                    @respond-server-request="onRespondServerRequest"
                    @retry-load="onRetryLoadMessages" />
                </div>
              </div>

              <ThreadComposer :active-thread-id="composerThreadContextId"
                :prompt-insertion="promptInsertion"
                :disabled="isSendingMessage" :models="availableModelIds"
                :selected-model="selectedModelId" :selected-reasoning-effort="selectedReasoningEffort"
                :collaboration-modes="collaborationModeOptions"
                :selected-collaboration-mode="selectedCollaborationModeName"
                :selected-permission-mode="selectedPermissionMode"
                :busy-label="threadComposerBusyLabel"
                :cwd="selectedThread?.cwd ?? ''"
                :is-turn-in-progress="isSelectedThreadInProgress" :is-interrupting-turn="isInterruptingTurn"
                @submit="onSubmitThreadMessage" @update:selected-model="onSelectModel"
                @update:selected-reasoning-effort="onSelectReasoningEffort"
                @update:selected-collaboration-mode="onSelectCollaborationMode"
                @update:selected-permission-mode="onSelectPermissionMode" @interrupt="onInterruptTurn" />
            </div>
          </template>
        </section>
      </section>
    </template>
  </DesktopLayout>

  <DirectoryPickerModal
    v-if="isDirectoryPickerOpen"
    :initial-path="directoryPickerInitialPath"
    @close="isDirectoryPickerOpen = false"
    @select="onSelectProjectDirectory"
  />

  <NewThreadSetupModal
    v-if="isNewThreadDialogOpen"
    :projects="newThreadProjectOptions"
    :initial-cwd="newThreadDialogInitialCwd"
    @close="isNewThreadDialogOpen = false"
    @create="onCreateNewThreadFromDialog"
  />
  <PromptLibraryDrawer
    :open="isPromptLibraryOpen"
    :cwd="tokenFlameCwd"
    @close="isPromptLibraryOpen = false"
    @insert="onInsertPrompt"
  />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopLayout from './components/layout/DesktopLayout.vue'
import SidebarThreadTree from './components/sidebar/SidebarThreadTree.vue'
import ContentHeader from './components/content/ContentHeader.vue'
import ThreadConversation from './components/content/ThreadConversation.vue'
import ThreadActivityPanel from './components/content/ThreadActivityPanel.vue'
import ThreadComposer from './components/content/ThreadComposer.vue'
import ComposerDropdown from './components/content/ComposerDropdown.vue'
import DirectoryPickerModal from './components/content/DirectoryPickerModal.vue'
import NewThreadSetupModal, { type NewThreadProjectOption } from './components/content/NewThreadSetupModal.vue'
import RateLimitFloatingStatus from './components/content/RateLimitFloatingStatus.vue'
import AppSettingsPage from './components/content/AppSettingsPage.vue'
import WorkspaceSkillsPage from './components/content/WorkspaceSkillsPage.vue'
import TokenFlameWidget from './components/content/TokenFlameWidget.vue'
import MissionChecklist from './components/content/MissionChecklist.vue'
import BrowserNotificationsPanel from './components/content/BrowserNotificationsPanel.vue'
import PromptLibraryDrawer from './components/content/PromptLibraryDrawer.vue'
import SidebarThreadControls from './components/sidebar/SidebarThreadControls.vue'
import IconTablerFolder from './components/icons/IconTablerFolder.vue'
import IconTablerClipboardList from './components/icons/IconTablerClipboardList.vue'
import IconTablerMoon from './components/icons/IconTablerMoon.vue'
import IconTablerSearch from './components/icons/IconTablerSearch.vue'
import IconTablerSettings from './components/icons/IconTablerSettings.vue'
import IconTablerSun from './components/icons/IconTablerSun.vue'
import IconTablerX from './components/icons/IconTablerX.vue'
import { fetchDefaultWorkspace } from './api/codexWorkspaceResourcesClient'
import {
  autoRefreshLabel,
  buildNewThreadFolderOptions,
  composerThreadContextId as buildComposerThreadContextId,
  directoryPickerInitialPath as buildDirectoryPickerInitialPath,
  filterAppConversationMessages,
  findNewThreadWorkspaceGroup,
  homeComposerBusyLabel as buildHomeComposerBusyLabel,
  knownThreadIds,
  newThreadProjectLabel as buildNewThreadProjectLabel,
  shouldShowThreadWorkLogAction,
  threadComposerBusyLabel as buildThreadComposerBusyLabel,
} from './composables/appShellRules'
import {
  loadDefaultNewThreadCwd,
  normalizeDefaultNewThreadCwd,
  saveDefaultNewThreadCwd,
} from './composables/desktopStateStorage'
import { DESKTOP_SETTING_KEYS, DESKTOP_STORAGE_KEYS } from './composables/desktopSettingsKeys'
import { useBrowserNotifications } from './composables/useBrowserNotifications'
import { useDesktopState } from './composables/useDesktopState'
import { useLocale } from './composables/useLocale'
import { fetchUserSetting, writeUserSetting } from './api/codexSettingsClient'
import { getSkillCatalog } from './api/codexComposerClient'
import { useTheme } from './theme/useTheme'
import type {
  ReasoningEffort,
  ThreadScrollState,
  UiComposerPermissionMode,
  UiComposerSubmitPayload,
  UiServerRequestReply,
  UiToolingRollbackFileResult,
} from './types/codex'
import type { PromptInsertion } from './composables/promptLibraryRules'

const MOBILE_SIDEBAR_BREAKPOINT = 700
const WorkspaceDashboard = defineAsyncComponent(() => import('./components/content/WorkspaceDashboard.vue'))

const {
  projectGroups,
  projectDisplayNameById,
  selectedThread,
  selectedThreadScrollState,
  selectedThreadServerRequests,
  allPendingServerRequests,
  selectedLiveOverlay,
  selectedStructuredPlan,
  selectedMessageLoadError,
  selectedThreadId,
  isHiddenView,
  rateLimitSnapshot,
  availableModelIds,
  selectedModelId,
  selectedReasoningEffort,
  selectedPermissionMode,
  collaborationModeOptions,
  selectedCollaborationModeName,
  messages,
  isLoadingThreads,
  isLoadingMessages,
  isSendingMessage,
  isInterruptingTurn,
  isLoadingRateLimits,
  isAutoRefreshEnabled,
  autoRefreshSecondsLeft,
  error: desktopError,
  clearError,
  refreshAll,
  refreshRateLimits,
  selectThread,
  loadMessages,
  setThreadScrollState,
  hideThreadById,
  restoreThreadById,
  forkThreadById,
  compactThreadById,
  setHiddenView,
  renameThreadById,
  sendMessageToSelectedThread,
  sendMessageToNewThread,
  interruptSelectedThreadTurn,
  setSelectedModelId,
  setSelectedReasoningEffort,
  setSelectedCollaborationModeName,
  setSelectedPermissionMode,
  respondToPendingServerRequest,
  renameProject,
  hideProject,
  restoreProject,
  reorderProject,
  toggleAutoRefreshTimer,
  startRealtimeSync,
  stopRealtimeSync,
  recordRollbackAudit,
} = useDesktopState()
const browserNotifications = useBrowserNotifications()
const {
  isDarkTheme: isDarkMode,
  themeRootClass,
  themeAttributes,
  applyCurrentTheme,
  toggleLightDark,
} = useTheme()
const { t } = useLocale()

const route = useRoute()
const router = useRouter()
const isRouteSyncInProgress = ref(false)
const hasInitialized = ref(false)
const newThreadCwd = ref(loadDefaultNewThreadCwd())
const pendingNewThreadName = ref('')
const newThreadDialogInitialCwd = ref('')
const isNewThreadDialogOpen = ref(false)
const isDirectoryPickerOpen = ref(false)
const isPromptLibraryOpen = ref(false)
const promptInsertion = ref<PromptInsertion | null>(null)
const isSidebarCollapsed = ref(loadSidebarCollapsed())
const isMobileViewport = ref(false)
const sidebarSearchQuery = ref('')
const isSidebarSearchVisible = ref(false)
const homeSurface = ref<'brief' | 'console'>('brief')
const skillCountsByCwd = ref<Record<string, number>>({})
const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)

function onInsertPrompt(insertion: PromptInsertion): void {
  promptInsertion.value = { ...insertion, id: Date.now() }
}

const routeThreadId = computed(() => {
  const rawThreadId = route.params.threadId
  return typeof rawThreadId === 'string' ? rawThreadId : ''
})

const knownThreadIdSet = computed(() => knownThreadIds(projectGroups.value))

const isHomeRoute = computed(() => route.name === 'home')
const isSettingsRoute = computed(() => route.name === 'settings')
const isSkillsRoute = computed(() => route.name === 'skills')
const skillsCwd = computed(() => typeof route.query.cwd === 'string' ? route.query.cwd.trim() : newThreadCwd.value)
const skillsProjectLabel = computed(() => {
  const group = projectGroups.value.find((item) => {
    const cwd = item.cwd?.trim() || item.threads[0]?.cwd?.trim() || ''
    return cwd === skillsCwd.value
  })
  if (!group) return skillsCwd.value
  return projectDisplayNameById.value[group.projectName]?.trim() || group.projectName
})
const isEffectiveSidebarCollapsed = computed(() => isSidebarCollapsed.value || isMobileViewport.value)
const contentTitle = computed(() => {
  if (isSettingsRoute.value) return t('app.title.settings')
  if (isSkillsRoute.value) return t('skills.title')
  if (isHomeRoute.value) return t('app.title.newThread')
  return selectedThread.value?.title ?? t('app.title.chooseThread')
})
const autoRefreshButtonLabel = computed(() => autoRefreshLabel({
  isEnabled: isAutoRefreshEnabled.value,
  secondsLeft: autoRefreshSecondsLeft.value,
}))
const filteredMessages = computed(() => filterAppConversationMessages(messages.value))
const liveOverlay = computed(() => selectedLiveOverlay.value)
const composerThreadContextId = computed(() => buildComposerThreadContextId({
  isHomeRoute: isHomeRoute.value,
  selectedThreadId: selectedThreadId.value,
}))
const isSelectedThreadInProgress = computed(() => !isHomeRoute.value && selectedThread.value?.inProgress === true)
const homeComposerBusyLabel = computed(() => buildHomeComposerBusyLabel(isSendingMessage.value))
const threadComposerBusyLabel = computed(() => buildThreadComposerBusyLabel({
  isSendingMessage: isSendingMessage.value,
  isSelectedThreadInProgress: isSelectedThreadInProgress.value,
}))
const shouldShowWorkLogAction = computed(() => shouldShowThreadWorkLogAction({
  isHomeRoute: isHomeRoute.value,
  isSettingsRoute: isSettingsRoute.value,
  selectedThreadId: selectedThreadId.value,
}))
const directoryPickerInitialPath = computed(() => buildDirectoryPickerInitialPath({
  newThreadCwd: newThreadCwd.value,
  selectedThread: selectedThread.value,
}))
const newThreadProjectOptions = computed<NewThreadProjectOption[]>(() =>
  newThreadFolderOptions.value.map((option) => ({
    cwd: option.value,
    label: option.label,
  })),
)
const newThreadFolderOptions = computed(() => buildNewThreadFolderOptions({
  groups: projectGroups.value,
  projectDisplayNameById: projectDisplayNameById.value,
  selectedCwd: newThreadCwd.value,
}))
const newThreadWorkspaceGroup = computed(() =>
  findNewThreadWorkspaceGroup(projectGroups.value, newThreadCwd.value)
)
const allThreads = computed(() => projectGroups.value.flatMap((group) => group.threads))
const missionStages = computed(() => [
  { id: 'brief', label: t('app.stage.brief'), hint: t('app.stage.briefHint') },
  { id: 'plan', label: t('app.stage.plan'), hint: t('app.stage.planHint') },
  { id: 'build', label: t('app.stage.build'), hint: t('app.stage.buildHint') },
  { id: 'validate', label: t('app.stage.validate'), hint: t('app.stage.validateHint') },
  { id: 'review', label: t('app.stage.review'), hint: t('app.stage.reviewHint') },
  { id: 'deliver', label: t('app.stage.deliver'), hint: t('app.stage.deliverHint') },
] as const)
const activeMissionStage = computed(() => {
  if (allPendingServerRequests.value.length > 0) return 'review'
  if (isSendingMessage.value) return 'build'
  return 'brief'
})
const selectedSidebarProjectName = computed(() =>
  selectedThread.value?.projectName || newThreadWorkspaceGroup.value?.projectName || newThreadCwd.value,
)
const newThreadProjectLabel = computed(() => buildNewThreadProjectLabel({
  group: newThreadWorkspaceGroup.value,
  newThreadCwd: newThreadCwd.value,
  projectDisplayNameById: projectDisplayNameById.value,
}))
const tokenFlameCwd = computed(() => selectedThread.value?.cwd?.trim() || newThreadCwd.value)
const activeWorkspaceSkillCount = computed(() => {
  const count = skillCountsByCwd.value[tokenFlameCwd.value]
  return typeof count === 'number' ? count : null
})
let hasHydratedDefaultNewThreadCwd = false

onMounted(() => {
  applyCurrentTheme()
  updateMobileViewport()
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('resize', updateMobileViewport)
  browserNotifications.start()
  void initialize()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('resize', updateMobileViewport)
  browserNotifications.stop()
  stopRealtimeSync()
})

function updateMobileViewport(): void {
  isMobileViewport.value = window.innerWidth <= MOBILE_SIDEBAR_BREAKPOINT
}

function toggleSidebarSearch(): void {
  isSidebarSearchVisible.value = !isSidebarSearchVisible.value
  if (isSidebarSearchVisible.value) {
    nextTick(() => sidebarSearchInputRef.value?.focus())
  } else {
    sidebarSearchQuery.value = ''
  }
}

function clearSidebarSearch(): void {
  sidebarSearchQuery.value = ''
  sidebarSearchInputRef.value?.focus()
}

function onSidebarSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSidebarSearchVisible.value = false
    sidebarSearchQuery.value = ''
  }
}

function openDirectoryPicker(): void {
  isDirectoryPickerOpen.value = true
}

function openSettings(): void {
  if (route.name === 'settings') return
  void router.push({ name: 'settings' })
}

function onOpenProjectSkills(payload: { cwd: string; projectName: string }): void {
  const cwd = payload.cwd.trim()
  if (!cwd) return
  setNewThreadCwd(cwd)
  void router.push({ name: 'skills', query: { cwd } })
}

function openCurrentWorkspaceSkills(): void {
  const cwd = tokenFlameCwd.value.trim()
  if (!cwd) return
  setNewThreadCwd(cwd)
  void router.push({ name: 'skills', query: { cwd } })
}

function onSelectProjectDirectory(path: string): void {
  const normalizedPath = path.trim()
  if (!normalizedPath) return

  openNewThreadDialog(normalizedPath)
  isDirectoryPickerOpen.value = false
}

function openNewThreadDialog(initialCwd = ''): void {
  newThreadDialogInitialCwd.value = initialCwd.trim() || newThreadCwd.value || selectedThread.value?.cwd || ''
  isNewThreadDialogOpen.value = true
}

function onCreateNewThreadFromDialog(payload: { cwd: string; projectName: string; threadName: string }): void {
  const cwd = payload.cwd.trim()
  if (!cwd) return

  const projectName = payload.projectName.trim()
  if (projectName) {
    renameProject(cwd, projectName)
  }

  newThreadCwd.value = cwd
  persistDefaultNewThreadCwd(cwd)
  pendingNewThreadName.value = payload.threadName.trim()
  isNewThreadDialogOpen.value = false

  if (isHomeRoute.value) return
  void router.push({ name: 'home' })
}

function onSelectThread(threadId: string): void {
  if (!threadId) return
  if (route.name === 'thread' && routeThreadId.value === threadId) return
  void router.push({ name: 'thread', params: { threadId } })
}

function onRetryLoadMessages(): void {
  const threadId = selectedThreadId.value
  if (!threadId) return
  void loadMessages(threadId)
}

function onHideThread(threadId: string): void {
  void hideThreadById(threadId)
}

function onRestoreThread(threadId: string): void {
  void restoreThreadById(threadId)
}

function onForkThread(threadId: string): void {
  void forkThreadById(threadId).then((forkedThreadId) => {
    if (forkedThreadId) {
      void router.push({ name: 'thread', params: { threadId: forkedThreadId } })
    }
  })
}

function onCompactThread(threadId: string): void {
  void compactThreadById(threadId)
}

function onToggleHiddenView(nextValue: boolean): void {
  void setHiddenView(nextValue).then(() => {
    if (selectedThreadId.value) {
      void router.replace({ name: 'thread', params: { threadId: selectedThreadId.value } })
      return
    }
    void router.replace({ name: 'home' })
  })
}

function onRenameThread(payload: { threadId: string; title: string }): void {
  void renameThreadById(payload.threadId, payload.title)
}

function onStartNewThread(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = projectGroup?.cwd?.trim() || projectGroup?.threads[0]?.cwd?.trim() || ''
  openNewThreadDialog(projectCwd)
}

function onSelectProject(projectName: string): void {
  const projectGroup = projectGroups.value.find((group) => group.projectName === projectName)
  const projectCwd = projectGroup?.cwd?.trim() || projectGroup?.threads[0]?.cwd?.trim() || ''
  if (projectCwd) {
    setNewThreadCwd(projectCwd)
  }
  if (route.name !== 'home') {
    void router.push({ name: 'home' })
  }
}

function onStartNewThreadFromToolbar(): void {
  openNewThreadDialog(selectedThread.value?.cwd?.trim() ?? '')
}

function onRenameProject(payload: { projectName: string; displayName: string }): void {
  renameProject(payload.projectName, payload.displayName)
}

function onHideProject(projectName: string): void {
  void hideProject(projectName)
}

function onRestoreProject(projectName: string): void {
  void restoreProject(projectName)
}

function onReorderProject(payload: { projectName: string; toIndex: number }): void {
  reorderProject(payload.projectName, payload.toIndex)
}

function onUpdateThreadScrollState(payload: { threadId: string; state: ThreadScrollState }): void {
  setThreadScrollState(payload.threadId, payload.state)
}

function onRespondServerRequest(payload: UiServerRequestReply): void {
  void respondToPendingServerRequest(payload)
}

function onRollbackCompleted(result: UiToolingRollbackFileResult): void {
  recordRollbackAudit(result)
}

function onToggleAutoRefreshTimer(): void {
  toggleAutoRefreshTimer()
}

function setSidebarCollapsed(nextValue: boolean): void {
  if (isSidebarCollapsed.value === nextValue) return
  isSidebarCollapsed.value = nextValue
  saveSidebarCollapsed(nextValue)
}

function toggleDarkMode(): void {
  toggleLightDark()
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (!event.ctrlKey && !event.metaKey) return
  if (event.shiftKey || event.altKey) return
  if (event.key.toLowerCase() !== 'b') return
  event.preventDefault()
  setSidebarCollapsed(!isSidebarCollapsed.value)
}

function onSubmitThreadMessage(payload: UiComposerSubmitPayload): void {
  if (isHomeRoute.value) {
    void submitFirstMessageForNewThread(payload)
    return
  }
  void sendMessageToSelectedThread(payload)
}

function onSelectNewThreadFolder(cwd: string): void {
  setNewThreadCwd(cwd)
}

function onSelectModel(modelId: string): void {
  setSelectedModelId(modelId)
}

function onSelectReasoningEffort(effort: ReasoningEffort | ''): void {
  setSelectedReasoningEffort(effort)
}

function onSelectCollaborationMode(name: string): void {
  setSelectedCollaborationModeName(name)
}

function onSelectPermissionMode(mode: UiComposerPermissionMode): void {
  setSelectedPermissionMode(mode)
}

function onInterruptTurn(): void {
  void interruptSelectedThreadTurn()
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DESKTOP_STORAGE_KEYS.sidebarCollapsed) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DESKTOP_STORAGE_KEYS.sidebarCollapsed, value ? '1' : '0')
}

function setNewThreadCwd(cwd: string): void {
  const normalizedCwd = normalizeDefaultNewThreadCwd(cwd)
  if (!normalizedCwd || newThreadCwd.value === normalizedCwd) return
  newThreadCwd.value = normalizedCwd
  persistDefaultNewThreadCwd(normalizedCwd)
}

function persistDefaultNewThreadCwd(cwd: string): void {
  const normalizedCwd = normalizeDefaultNewThreadCwd(cwd)
  saveDefaultNewThreadCwd(normalizedCwd)
  if (!hasHydratedDefaultNewThreadCwd) return
  void writeUserSetting(DESKTOP_SETTING_KEYS.defaultNewThreadCwd, normalizedCwd).catch(() => {
    // Keep the browser-local default if remote settings persistence fails.
  })
}

async function hydrateDefaultNewThreadCwdFromSettingsStore(): Promise<void> {
  if (hasHydratedDefaultNewThreadCwd) return
  hasHydratedDefaultNewThreadCwd = true

  try {
    const setting = await fetchUserSetting<unknown>(DESKTOP_SETTING_KEYS.defaultNewThreadCwd)
    const remoteCwd = normalizeDefaultNewThreadCwd(setting?.value)
    if (remoteCwd) {
      newThreadCwd.value = remoteCwd
      saveDefaultNewThreadCwd(remoteCwd)
      return
    }
  } catch {
    // Keep the browser-local/default workspace value when settings cannot be read.
  }

  const localCwd = normalizeDefaultNewThreadCwd(newThreadCwd.value)
  if (localCwd) {
    saveDefaultNewThreadCwd(localCwd)
    void writeUserSetting(DESKTOP_SETTING_KEYS.defaultNewThreadCwd, localCwd).catch(() => {
      // Keep the browser-local default if the initial remote write fails.
    })
  }
}

async function initialize(): Promise<void> {
  startRealtimeSync()
  await hydrateDefaultNewThreadCwdFromSettingsStore()
  await refreshAll({ loadSelectedMessages: false })
  await ensureNewThreadWorkspace()
  hasInitialized.value = true
  await syncThreadSelectionWithRoute()
}

async function ensureNewThreadWorkspace(): Promise<void> {
  if (newThreadCwd.value.trim()) return

  const firstKnownWorkspace = newThreadFolderOptions.value[0]?.value?.trim() ?? ''
  if (firstKnownWorkspace) {
    setNewThreadCwd(firstKnownWorkspace)
    return
  }

  try {
    const workspace = await fetchDefaultWorkspace()
    setNewThreadCwd(workspace.cwd)
  } catch {
    // Keep the home route usable even if the dev server cannot expose its cwd.
  }
}

async function syncThreadSelectionWithRoute(): Promise<void> {
  if (isRouteSyncInProgress.value) return
  isRouteSyncInProgress.value = true

  try {
    if (route.name === 'home' || route.name === 'settings' || route.name === 'skills') {
      if (selectedThreadId.value !== '') {
        await selectThread('')
      }
      return
    }

    if (route.name === 'thread') {
      const threadId = routeThreadId.value
      if (!threadId) return

      if (!knownThreadIdSet.value.has(threadId)) {
        await router.replace({ name: 'home' })
        return
      }

      await selectThread(threadId)
      return
    }

  } finally {
    isRouteSyncInProgress.value = false
  }
}

watch(
  () =>
    [
      route.name,
      routeThreadId.value,
      isLoadingThreads.value,
      knownThreadIdSet.value.has(routeThreadId.value),
      selectedThreadId.value,
    ] as const,
  async () => {
    if (!hasInitialized.value) return
    await syncThreadSelectionWithRoute()
  },
)

watch(
  () => selectedThreadId.value,
  async (threadId) => {
    if (!hasInitialized.value) return
    if (isRouteSyncInProgress.value) return
    if (isHomeRoute.value || isSettingsRoute.value || isSkillsRoute.value) return

    if (!threadId) {
      if (route.name !== 'home') {
        await router.replace({ name: 'home' })
      }
      return
    }

    if (route.name === 'thread' && routeThreadId.value === threadId) return
    await router.replace({ name: 'thread', params: { threadId } })
  },
)

watch(
  () => newThreadFolderOptions.value,
  (options) => {
    if (options.length === 0) {
      if (!newThreadCwd.value.trim()) {
        void ensureNewThreadWorkspace()
      }
      return
    }
    const hasSelected = options.some((option) => option.value === newThreadCwd.value)
    if (!hasSelected) {
      setNewThreadCwd(options[0].value)
    }
  },
  { immediate: true },
)

watch(
  () => projectGroups.value.map((group) => group.cwd?.trim() || group.threads[0]?.cwd?.trim() || '').filter(Boolean),
  async (cwds) => {
    if (cwds.length === 0) {
      skillCountsByCwd.value = {}
      return
    }
    try {
      const entries = await getSkillCatalog(cwds)
      skillCountsByCwd.value = Object.fromEntries(entries.map((entry) => [entry.cwd, entry.skills.length]))
    } catch {
      // Skill counts are a progressive enhancement; the entry remains available without them.
    }
  },
  { immediate: true },
)

async function submitFirstMessageForNewThread(payload: UiComposerSubmitPayload): Promise<void> {
  try {
    const threadName = pendingNewThreadName.value.trim()
    const threadId = await sendMessageToNewThread(payload, newThreadCwd.value)
    if (!threadId) return
    pendingNewThreadName.value = ''
    if (threadName) {
      void renameThreadById(threadId, threadName).catch(() => {
        // Rename errors are already reflected in desktop state; keep the new thread visible.
      })
    }
    await router.replace({ name: 'thread', params: { threadId } })
  } catch {
    // Error is already reflected in state.
  }
}
</script>

<style scoped>
@reference "./style.css";

.sidebar-root {
  @apply min-h-full py-4 px-2 flex flex-col gap-2 select-none;
}

.sidebar-root input,
.sidebar-root textarea {
  @apply select-text;
}

.content-root {
  @apply relative h-full min-h-0 w-full flex flex-col overflow-y-hidden overflow-x-visible theme-bg-panel;
}

.sidebar-thread-controls-host {
  @apply mt-1 -translate-y-px px-2 pb-1;
}

.sidebar-search-toggle {
  @apply h-6.75 w-6.75 rounded-md border border-transparent bg-transparent theme-muted flex items-center justify-center transition hover:theme-border hover:theme-bg-subtle;
}

.sidebar-search-toggle[aria-pressed='true']:not([data-theme-toggle='true']) {
  @apply theme-border theme-bg-control theme-muted;
}

.sidebar-search-toggle-icon {
  @apply w-4 h-4;
}

.sidebar-search-bar {
  @apply flex items-center gap-1.5 mx-2 px-2 py-1 rounded-md border theme-border theme-bg-panel transition-colors focus-within:border-zinc-400;
}

.sidebar-search-bar-icon {
  @apply w-3.5 h-3.5 theme-muted shrink-0;
}

.sidebar-search-input {
  @apply flex-1 min-w-0 bg-transparent text-sm theme-text placeholder-zinc-400 outline-none border-none p-0;
}

.sidebar-search-clear {
  @apply w-4 h-4 rounded theme-muted flex items-center justify-center transition hover:theme-muted;
}

.sidebar-search-clear-icon {
  @apply w-3.5 h-3.5;
}

.sidebar-thread-controls-header-host {
  @apply ml-1;
}

.content-notifications-host {
  @apply flex items-center;
}

.content-prompt-trigger {
  @apply relative inline-flex h-9 w-9 items-center justify-center rounded-md border theme-border theme-bg-panel theme-muted shadow-sm transition hover:border-[var(--color-accent)] hover:theme-bg-subtle hover:theme-text focus-visible:outline-2 focus-visible:outline-offset-2;
}

.content-prompt-trigger::after {
  position: absolute;
  right: .35rem;
  bottom: .28rem;
  width: .27rem;
  height: .27rem;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 7px color-mix(in srgb, var(--color-accent) 64%, transparent);
  content: '';
}

.content-prompt-trigger svg { @apply h-4 w-4; }

.workspace-context-bar {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  gap: 1.1rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-panel) 72%, transparent);
  padding: 0.4rem 1rem;
  color: var(--color-text-muted);
  scrollbar-width: none;
}

.workspace-context-bar > span:not(.workspace-context-live) {
  display: flex;
  min-width: 0;
  max-width: 24rem;
  align-items: baseline;
  gap: 0.4rem;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-context-bar small {
  color: color-mix(in srgb, var(--color-text-muted) 64%, transparent);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-context-live {
  width: 0.45rem;
  height: 0.45rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 10px var(--color-success);
}

.workspace-context-bar button {
  margin-left: auto;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-elevated);
  padding: 0.35rem 0.65rem;
  color: var(--color-text);
  font-size: 0.7rem;
}

.mission-stage-nav {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  margin: 0 var(--ui-content-gutter) 0.4rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-border);
}

.mission-stage-nav button {
  display: grid;
  min-width: 0;
  gap: 0.12rem;
  border: 0;
  background: var(--color-panel);
  padding: 0.48rem 0.65rem;
  color: var(--color-text-muted);
  text-align: left;
}

.mission-stage-nav button[data-active='true'] {
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-elevated));
  color: var(--color-text);
  box-shadow: inset 0 2px 0 var(--color-accent);
}

.mission-stage-nav span {
  font-size: 0.7rem;
  font-weight: 650;
}

.mission-stage-nav small {
  overflow: hidden;
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .toolbar-secondary {
    display: none;
  }

  .workspace-context-bar > span:nth-of-type(3) {
    display: none;
  }

  .mission-stage-nav {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mission-stage-nav button {
    min-width: 6.5rem;
  }
}

.content-body {
  @apply flex-1 min-h-0 w-full flex flex-col gap-3 pt-1 pb-4 overflow-y-hidden overflow-x-visible;
}

.content-error {
  @apply mx-0 mt-1 flex shrink-0 items-start gap-2 rounded-lg border theme-border-danger theme-bg-danger-soft px-3 py-2 text-sm theme-text-danger;
}

.content-error-text {
  @apply min-w-0 flex-1;
}

.content-error-dismiss {
  @apply -mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-rose-500 transition hover:theme-bg-danger-soft hover:theme-text-danger;
}

.content-error-dismiss-icon {
  @apply h-3.5 w-3.5;
}

.content-grid {
  @apply flex-1 min-h-0 flex flex-col gap-3;
}

.new-thread-grid {
  @apply items-center justify-center gap-6 overflow-hidden;
  position: relative;
  isolation: isolate;
}

.new-thread-grid::before {
  content: '';
  position: absolute;
  inset: 7% 8% 10%;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(var(--telemetry-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--telemetry-grid) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at 50% 52%, black 4%, transparent 70%);
  opacity: 0.44;
}

.content-workbench {
  @apply flex-1 min-h-0 flex gap-3 px-0;
}

.content-thread {
  @apply flex flex-1 flex-col min-h-0 overflow-visible;
}

.content-thread :deep(.conversation-root) {
  @apply flex-1;
}

.new-thread-empty {
  @apply shrink-0 flex flex-col items-center justify-center px-6 py-4 text-center;
  max-width: 48rem;
}

.new-thread-hero {
  @apply m-0 font-semibold;
  font-size: clamp(2.6rem, 6vw, 5.4rem);
  line-height: 0.94;
  letter-spacing: -0.065em;
  color: var(--color-text);
}

.new-thread-kicker {
  @apply mb-5 inline-flex items-center gap-2 font-mono text-[0.67rem] font-semibold uppercase;
  color: var(--color-text-muted);
  letter-spacing: 0.16em;
}

.new-thread-kicker-signal {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-success) 13%, transparent), 0 0 16px color-mix(in srgb, var(--color-success) 55%, transparent);
}

.new-thread-subtitle {
  @apply mt-5 mb-4 max-w-xl text-sm leading-6;
  color: var(--color-text-muted);
}

.new-thread-folder-dropdown {
  @apply text-sm;
  color: var(--color-text-muted);
}

.new-thread-folder-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-9 px-3 text-sm leading-none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-panel);
}

.new-thread-folder-dropdown :deep(.composer-dropdown-value) {
  @apply leading-[1.05];
}

.new-thread-folder-dropdown :deep(.composer-dropdown-chevron) {
  @apply h-4 w-4 mt-0;
}

</style>
