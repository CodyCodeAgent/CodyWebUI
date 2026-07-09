import { computed, ref } from 'vue'
import {
  getAvailableModelIds,
  getCollaborationModes,
  getCurrentModelConfig,
} from '../api/codexModelClient'
import {
  getAccountRateLimits,
  normalizeRateLimitSnapshot,
} from '../api/codexRateLimitClient'
import {
  fetchUserSetting,
  writeUserSetting,
} from '../api/codexSettingsClient'
import {
  archiveThread,
  compactThread,
  forkThread,
  getThreadGroups,
  getThreadMessages,
  interruptThreadTurn,
  renameThread,
  resumeThread,
  startThread,
  startThreadTurn,
  steerThreadTurn,
  unarchiveThread,
} from '../api/codexThreadClient'
import {
  fetchPendingServerRequests,
  respondServerRequest,
} from '../api/codexBridgeClient'
import {
  subscribeRpcNotifications,
  type RpcNotification,
} from '../api/codexRealtimeClient'
import {
  extractThreadIdFromNotification,
  isAgentContentEvent,
  liveReasoningMessageId,
  readAgentMessageCompleted,
  readAgentMessageDelta,
  readAgentMessageStartedId,
  readPlanMessageCompleted,
  readPlanMessageDelta,
  readPlanUpdatedMessage,
  readRateLimitSnapshotPayload,
  readReasoningCompletedId,
  readReasoningDelta,
  readReasoningSectionBreakMessageId,
  readReasoningStartedItemId,
  readStartedThread,
  readTurnActivity,
  readTurnCompletedInfo,
  readTurnDurationHints,
  readTurnErrorMessage,
  readTurnStartedInfo,
  readUserMessageCompleted,
  type TurnActivityState,
  type TurnCompletedInfo,
  type TurnStartedInfo,
} from './realtimeNotificationReaders'
import { shouldQueueEventDrivenSyncForMethod } from './realtimeSyncPolicy'
import {
  clearDesktopRealtimeSyncQueue,
  consumeDesktopRealtimeSyncQueue,
  createDesktopRealtimeSyncQueue,
  hasPendingDesktopRealtimeSync,
  queueDesktopRealtimeSync,
} from './desktopRealtimeSyncQueue'
import {
  appendLiveReasoningDeltaForThread,
  appendLiveReasoningSectionBreakForThread,
  buildDisplayedMessages,
  buildLiveOverlay,
  buildRollbackAuditMessage,
  clearLiveReasoningTextForThread,
  mergeMessages,
  removeMessageById,
  removeRedundantLiveAgentMessages,
  updateLiveReasoningTextForThread,
  updateMessagesForThread,
  upsertLiveAssistantDeltaForThread,
  upsertMessage,
  updateTurnActivityState,
  updateTurnErrorState,
  updateTurnSummaryState,
  type TurnErrorState,
  type TurnSummaryState,
} from './desktopMessageState'
import {
  flattenServerRequests,
  normalizeServerRequest,
  readResolvedServerRequestId,
  removeServerRequestById,
  selectServerRequestsForThread,
  upsertServerRequest,
} from './desktopServerRequests'
import {
  markThreadMessagesLoaded,
  markThreadResumed,
  pruneDesktopThreadScopedState,
  setThreadLoadedVersion,
  shouldShowMessagesLoading,
} from './desktopThreadScopedState'
import {
  DEFAULT_COLLABORATION_MODE,
  FALLBACK_PLAN_COLLABORATION_MODE,
  buildTurnCollaborationMode,
  mergeAvailableModelsWithCurrent,
  mergeCollaborationModeOptions,
  normalizeSelectedReasoningEffort,
  reconcileSelectedCollaborationModeName,
  selectCollaborationModeName,
  selectModelId,
  selectReasoningEffortFromPreference,
  type CurrentModelPreference,
} from './desktopTurnPreferences'
import {
  buildCompletedTurnSummary,
  buildPendingTurnActivity,
  buildSteeringTurnActivity,
  clearActiveTurnForThread,
  normalizeComposerTurnInput,
  normalizeNewThreadTurnInput,
  normalizeThreadTextTurnInput,
  setActiveTurnForThread,
  shouldClearUnreadForStartedTurn,
} from './desktopTurnState'
import {
  loadAutoRefreshEnabled,
  loadDesktopTurnPreferences,
  loadProjectDisplayNames,
  loadProjectOrder,
  loadReadStateMap,
  loadSelectedThreadId,
  loadThreadScrollStateMap,
  normalizeDesktopTurnPreferences,
  normalizeThreadScrollState,
  saveAutoRefreshEnabled,
  saveDesktopTurnPreferences,
  saveProjectDisplayNames,
  saveProjectOrder,
  saveReadStateMap,
  saveSelectedThreadId,
  saveThreadScrollStateMap,
} from './desktopStateStorage'
import {
  areStringArraysEqual,
  buildThreadGroupsWithFlags,
  flattenThreads,
  markThreadReadState,
  markThreadUnreadState,
  mergeProjectOrder,
  mergeThreadGroups,
  moveProjectInOrder,
  omitKey,
  orderGroupsByProjectOrder,
  reconcileOptimisticThreads,
  removeProjectDisplayName,
  removeProjectFromGroups,
  removeProjectFromOrder,
  renameProjectDisplayName,
  renameThreadInGroups,
  updateThreadBooleanState,
  upsertThreadInGroups,
} from './threadGroupState'
import type {
  ReasoningEffort,
  UiCollaborationModeOption,
  UiComposerSubmitPayload,
  ThreadScrollState,
  UiMessage,
  UiProjectGroup,
  UiRateLimitSnapshot,
  UiServerRequest,
  UiServerRequestReply,
  UiThread,
  UiToolingRollbackFileResult,
} from '../types/codex'

export { buildRollbackAuditMessage } from './desktopMessageState'

const EVENT_SYNC_DEBOUNCE_MS = 220
const AUTO_REFRESH_INTERVAL_MS = 4000
const TURN_PREFERENCES_SETTING_KEY = 'desktop.turn-preferences.v1'

export function useDesktopState() {
  const projectGroups = ref<UiProjectGroup[]>([])
  const sourceGroups = ref<UiProjectGroup[]>([])
  const optimisticThreadById = ref<Record<string, UiThread>>({})
  const selectedThreadId = ref(loadSelectedThreadId())
  const isArchiveView = ref(false)
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveAgentMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveReasoningTextByThreadId = ref<Record<string, string>>({})
  const inProgressById = ref<Record<string, boolean>>({})
  const eventUnreadByThreadId = ref<Record<string, boolean>>({})
  const initialTurnPreferences = loadDesktopTurnPreferences()
  const availableModelIds = ref<string[]>([])
  const selectedModelId = ref(initialTurnPreferences.modelId)
  const selectedReasoningEffort = ref<ReasoningEffort | ''>(initialTurnPreferences.reasoningEffort)
  const collaborationModeOptions = ref<UiCollaborationModeOption[]>([
    DEFAULT_COLLABORATION_MODE,
    FALLBACK_PLAN_COLLABORATION_MODE,
  ])
  const selectedCollaborationModeName = ref(initialTurnPreferences.collaborationModeName)
  const readStateByThreadId = ref<Record<string, string>>(loadReadStateMap())
  const scrollStateByThreadId = ref<Record<string, ThreadScrollState>>(loadThreadScrollStateMap())
  const projectOrder = ref<string[]>(loadProjectOrder())
  const projectDisplayNameById = ref<Record<string, string>>(loadProjectDisplayNames())
  const loadedVersionByThreadId = ref<Record<string, string>>({})
  const loadedMessagesByThreadId = ref<Record<string, boolean>>({})
  const resumedThreadById = ref<Record<string, boolean>>({})
  const turnSummaryByThreadId = ref<Record<string, TurnSummaryState>>({})
  const turnActivityByThreadId = ref<Record<string, TurnActivityState>>({})
  const turnErrorByThreadId = ref<Record<string, TurnErrorState>>({})
  const activeTurnIdByThreadId = ref<Record<string, string>>({})
  const pendingServerRequestsByThreadId = ref<Record<string, UiServerRequest[]>>({})
  const rateLimitSnapshot = ref<UiRateLimitSnapshot | null>(null)

  const isLoadingThreads = ref(false)
  const loadingMessagesByThreadId = ref<Record<string, boolean>>({})
  const isSendingMessage = ref(false)
  const isInterruptingTurn = ref(false)
  const isLoadingRateLimits = ref(false)
  const error = ref('')
  const isPolling = ref(false)
  const hasLoadedThreads = ref(false)
  const isAutoRefreshEnabled = ref(loadAutoRefreshEnabled())
  const autoRefreshSecondsLeft = ref(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000))
  let stopNotificationStream: (() => void) | null = null
  let eventSyncTimer: number | null = null
  let autoRefreshIntervalTimer: number | null = null
  let autoRefreshCountdownTimer: number | null = null
  const realtimeSyncQueue = createDesktopRealtimeSyncQueue()
  const activeReasoningItemIdByThreadId = new Map<string, string>()
  let shouldAutoScrollOnNextAgentEvent = false
  const pendingTurnStartsById = new Map<string, TurnStartedInfo>()
  const livePlanMessageIdByTurnId = new Map<string, string>()
  const latestMessageLoadRequestIdByThreadId = new Map<string, number>()
  let nextMessageLoadRequestId = 0
  let nextOptimisticUserMessageId = 0
  let hasHydratedTurnPreferences = false

  const allThreads = computed(() => flattenThreads(projectGroups.value))
  const selectedThread = computed(() =>
    allThreads.value.find((thread) => thread.id === selectedThreadId.value) ?? null,
  )
  const selectedThreadScrollState = computed<ThreadScrollState | null>(
    () => scrollStateByThreadId.value[selectedThreadId.value] ?? null,
  )
  const selectedThreadServerRequests = computed<UiServerRequest[]>(() => {
    return selectServerRequestsForThread(pendingServerRequestsByThreadId.value, selectedThreadId.value)
  })
  const isLoadingMessages = computed(() => loadingMessagesByThreadId.value[selectedThreadId.value] === true)
  const allPendingServerRequests = computed<UiServerRequest[]>(() => {
    return flattenServerRequests(pendingServerRequestsByThreadId.value)
  })
  const selectedCollaborationMode = computed<UiCollaborationModeOption>(() => {
    const selected = collaborationModeOptions.value.find(
      (option) => option.name === selectedCollaborationModeName.value,
    )
    return selected ?? DEFAULT_COLLABORATION_MODE
  })
  const selectedLiveOverlay = computed(() =>
    buildLiveOverlay(
      selectedThreadId.value,
      turnActivityByThreadId.value,
      liveReasoningTextByThreadId.value,
      turnErrorByThreadId.value,
    ),
  )
  const messages = computed<UiMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const liveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
    return buildDisplayedMessages(persisted, liveAgent, turnSummaryByThreadId.value[threadId])
  })

  function setSelectedThreadId(nextThreadId: string): void {
    if (selectedThreadId.value === nextThreadId) return
    selectedThreadId.value = nextThreadId
    saveSelectedThreadId(nextThreadId)
    shouldAutoScrollOnNextAgentEvent = false
  }

  function setMessagesLoadingForThread(threadId: string, isLoading: boolean): void {
    if (!threadId) return
    const previous = loadingMessagesByThreadId.value[threadId] === true
    if (previous === isLoading) return

    if (!isLoading) {
      loadingMessagesByThreadId.value = omitKey(loadingMessagesByThreadId.value, threadId)
      return
    }

    loadingMessagesByThreadId.value = {
      ...loadingMessagesByThreadId.value,
      [threadId]: true,
    }
  }

  function clearError(): void {
    error.value = ''
  }

  function currentTurnPreferences() {
    return normalizeDesktopTurnPreferences({
      modelId: selectedModelId.value,
      reasoningEffort: selectedReasoningEffort.value,
      collaborationModeName: selectedCollaborationModeName.value,
    })
  }

  function persistTurnPreferences(): void {
    const preferences = currentTurnPreferences()
    saveDesktopTurnPreferences(preferences)
    if (!hasHydratedTurnPreferences) return
    void writeUserSetting(TURN_PREFERENCES_SETTING_KEY, preferences).catch(() => {
      // localStorage remains the immediate fallback when the optional settings store is unavailable.
    })
  }

  async function hydrateTurnPreferencesFromSettingsStore(): Promise<void> {
    if (hasHydratedTurnPreferences) return
    hasHydratedTurnPreferences = true

    try {
      const setting = await fetchUserSetting<unknown>(TURN_PREFERENCES_SETTING_KEY)
      if (setting) {
        const preferences = normalizeDesktopTurnPreferences(setting.value)
        selectedModelId.value = preferences.modelId
        selectedReasoningEffort.value = preferences.reasoningEffort
        selectedCollaborationModeName.value = preferences.collaborationModeName
        saveDesktopTurnPreferences(preferences)
        return
      }
    } catch {
      // Keep localStorage preferences if the optional settings store cannot be read.
    }

    const localPreferences = currentTurnPreferences()
    saveDesktopTurnPreferences(localPreferences)
    void writeUserSetting(TURN_PREFERENCES_SETTING_KEY, localPreferences).catch(() => {
      // optional remote persistence
    })
  }

  function setSelectedModelId(modelId: string): void {
    selectedModelId.value = modelId.trim()
    persistTurnPreferences()
  }

  function setSelectedReasoningEffort(effort: ReasoningEffort | ''): void {
    const normalizedEffort = normalizeSelectedReasoningEffort(effort)
    if (normalizedEffort === null) return
    selectedReasoningEffort.value = normalizedEffort
    persistTurnPreferences()
  }

  function setSelectedCollaborationModeName(name: string): void {
    const nextName = selectCollaborationModeName(name, collaborationModeOptions.value)
    if (!nextName) return
    selectedCollaborationModeName.value = nextName
    persistTurnPreferences()
  }

  async function refreshCollaborationModes(): Promise<void> {
    let remoteOptions: UiCollaborationModeOption[] = []
    try {
      remoteOptions = await getCollaborationModes()
    } catch {
      remoteOptions = []
    }

    const nextOptions = mergeCollaborationModeOptions(remoteOptions)
    collaborationModeOptions.value = nextOptions
    selectedCollaborationModeName.value = reconcileSelectedCollaborationModeName(
      selectedCollaborationModeName.value,
      nextOptions,
    )
    persistTurnPreferences()
  }

  async function refreshModelPreferences(): Promise<void> {
    let modelIds: string[] = []
    let currentConfig: CurrentModelPreference = {
      model: '',
      reasoningEffort: '',
    }

    try {
      modelIds = await getAvailableModelIds()
    } catch {
      modelIds = []
    }

    try {
      currentConfig = await getCurrentModelConfig()
    } catch {
      currentConfig = { model: '', reasoningEffort: '' }
    }

    modelIds = mergeAvailableModelsWithCurrent(modelIds, currentConfig.model)
    availableModelIds.value = modelIds

    selectedModelId.value = selectModelId(selectedModelId.value, modelIds, currentConfig.model)
    selectedReasoningEffort.value = selectReasoningEffortFromPreference(
      selectedReasoningEffort.value,
      currentConfig,
    )
    persistTurnPreferences()
  }

  async function refreshRateLimits(): Promise<void> {
    isLoadingRateLimits.value = true
    try {
      rateLimitSnapshot.value = await getAccountRateLimits()
    } catch {
      // Rate limit status is advisory; keep the rest of the app usable if it is unavailable.
    } finally {
      isLoadingRateLimits.value = false
    }
  }

  function applyThreadFlags(): void {
    const flaggedGroups = buildThreadGroupsWithFlags(sourceGroups.value, {
      selectedThreadId: selectedThreadId.value,
      inProgressById: inProgressById.value,
      readStateByThreadId: readStateByThreadId.value,
      eventUnreadByThreadId: eventUnreadByThreadId.value,
    })
    projectGroups.value = mergeThreadGroups(projectGroups.value, flaggedGroups)
  }

  function addOptimisticThread(thread: UiThread): void {
    optimisticThreadById.value = {
      ...optimisticThreadById.value,
      [thread.id]: thread,
    }
    sourceGroups.value = upsertThreadInGroups(sourceGroups.value, thread)
    applyThreadFlags()
  }

  function updateOptimisticThreadTitle(threadId: string, title: string): void {
    const optimisticThread = optimisticThreadById.value[threadId]
    if (!optimisticThread) return

    optimisticThreadById.value = {
      ...optimisticThreadById.value,
      [threadId]: {
        ...optimisticThread,
        title,
        preview: title,
      },
    }
  }

  function pruneThreadScopedState(flatThreads: UiThread[]): void {
    const activeThreadIds = new Set(flatThreads.map((thread) => thread.id))
    const pruned = pruneDesktopThreadScopedState({
      readStateByThreadId: readStateByThreadId.value,
      scrollStateByThreadId: scrollStateByThreadId.value,
      loadedMessagesByThreadId: loadedMessagesByThreadId.value,
      loadedVersionByThreadId: loadedVersionByThreadId.value,
      resumedThreadById: resumedThreadById.value,
      persistedMessagesByThreadId: persistedMessagesByThreadId.value,
      liveAgentMessagesByThreadId: liveAgentMessagesByThreadId.value,
      liveReasoningTextByThreadId: liveReasoningTextByThreadId.value,
      turnSummaryByThreadId: turnSummaryByThreadId.value,
      turnActivityByThreadId: turnActivityByThreadId.value,
      turnErrorByThreadId: turnErrorByThreadId.value,
      activeTurnIdByThreadId: activeTurnIdByThreadId.value,
      eventUnreadByThreadId: eventUnreadByThreadId.value,
      inProgressById: inProgressById.value,
      pendingServerRequestsByThreadId: pendingServerRequestsByThreadId.value,
    }, activeThreadIds)

    if (pruned.readStateByThreadId !== readStateByThreadId.value) {
      readStateByThreadId.value = pruned.readStateByThreadId
      saveReadStateMap(pruned.readStateByThreadId)
    }
    if (pruned.scrollStateByThreadId !== scrollStateByThreadId.value) {
      scrollStateByThreadId.value = pruned.scrollStateByThreadId
      saveThreadScrollStateMap(pruned.scrollStateByThreadId)
    }
    loadedMessagesByThreadId.value = pruned.loadedMessagesByThreadId
    loadedVersionByThreadId.value = pruned.loadedVersionByThreadId
    resumedThreadById.value = pruned.resumedThreadById
    persistedMessagesByThreadId.value = pruned.persistedMessagesByThreadId
    liveAgentMessagesByThreadId.value = pruned.liveAgentMessagesByThreadId
    liveReasoningTextByThreadId.value = pruned.liveReasoningTextByThreadId
    turnSummaryByThreadId.value = pruned.turnSummaryByThreadId
    turnActivityByThreadId.value = pruned.turnActivityByThreadId
    turnErrorByThreadId.value = pruned.turnErrorByThreadId
    activeTurnIdByThreadId.value = pruned.activeTurnIdByThreadId
    eventUnreadByThreadId.value = pruned.eventUnreadByThreadId
    inProgressById.value = pruned.inProgressById
    pendingServerRequestsByThreadId.value = pruned.pendingServerRequestsByThreadId
    loadingMessagesByThreadId.value = Object.fromEntries(
      Object.entries(loadingMessagesByThreadId.value).filter(([threadId]) => activeThreadIds.has(threadId)),
    )
    for (const threadId of latestMessageLoadRequestIdByThreadId.keys()) {
      if (!activeThreadIds.has(threadId)) {
        latestMessageLoadRequestIdByThreadId.delete(threadId)
      }
    }
  }

  function markThreadAsRead(threadId: string): void {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    if (!thread) return

    const nextState = markThreadReadState(readStateByThreadId.value, eventUnreadByThreadId.value, thread)
    let didChange = false
    if (nextState.readStateByThreadId !== readStateByThreadId.value) {
      readStateByThreadId.value = nextState.readStateByThreadId
      saveReadStateMap(nextState.readStateByThreadId)
      didChange = true
    }
    if (nextState.eventUnreadByThreadId !== eventUnreadByThreadId.value) {
      eventUnreadByThreadId.value = nextState.eventUnreadByThreadId
      didChange = true
    }
    if (didChange) {
      applyThreadFlags()
    }
  }

  function setTurnSummaryForThread(threadId: string, summary: TurnSummaryState | null): void {
    const nextState = updateTurnSummaryState(turnSummaryByThreadId.value, threadId, summary)
    if (nextState !== turnSummaryByThreadId.value) {
      turnSummaryByThreadId.value = nextState
    }
  }

  function setThreadInProgress(threadId: string, nextInProgress: boolean): void {
    const nextState = updateThreadBooleanState(inProgressById.value, threadId, nextInProgress)
    if (nextState === inProgressById.value) return
    inProgressById.value = nextState
    applyThreadFlags()
  }

  function markThreadUnreadByEvent(threadId: string): void {
    const nextState = markThreadUnreadState(eventUnreadByThreadId.value, threadId, selectedThreadId.value)
    if (nextState !== eventUnreadByThreadId.value) {
      eventUnreadByThreadId.value = nextState
      applyThreadFlags()
    }
  }

  function setTurnActivityForThread(threadId: string, activity: TurnActivityState | null): void {
    const nextState = updateTurnActivityState(turnActivityByThreadId.value, threadId, activity)
    if (nextState !== turnActivityByThreadId.value) {
      turnActivityByThreadId.value = nextState
    }
  }

  function setTurnErrorForThread(threadId: string, message: string | null): void {
    const nextState = updateTurnErrorState(turnErrorByThreadId.value, threadId, message)
    if (nextState !== turnErrorByThreadId.value) {
      turnErrorByThreadId.value = nextState
    }
  }

  function currentThreadVersion(threadId: string): string {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    return thread?.updatedAtIso ?? ''
  }

  function setThreadScrollState(threadId: string, nextState: ThreadScrollState): void {
    if (!threadId) return

    const normalizedState = normalizeThreadScrollState(nextState)
    if (!normalizedState) return

    const previousState = scrollStateByThreadId.value[threadId]
    if (
      previousState &&
      previousState.scrollTop === normalizedState.scrollTop &&
      previousState.isAtBottom === normalizedState.isAtBottom &&
      previousState.scrollRatio === normalizedState.scrollRatio
    ) {
      return
    }

    scrollStateByThreadId.value = {
      ...scrollStateByThreadId.value,
      [threadId]: normalizedState,
    }
    saveThreadScrollStateMap(scrollStateByThreadId.value)
  }

  function setPersistedMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    persistedMessagesByThreadId.value = updateMessagesForThread(
      persistedMessagesByThreadId.value,
      threadId,
      nextMessages,
    )
  }

  function setLiveAgentMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    liveAgentMessagesByThreadId.value = updateMessagesForThread(
      liveAgentMessagesByThreadId.value,
      threadId,
      nextMessages,
    )
  }

  function recordRollbackAudit(result: UiToolingRollbackFileResult): void {
    const threadId = selectedThreadId.value
    if (!threadId) return

    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    setPersistedMessagesForThread(threadId, upsertMessage(previous, buildRollbackAuditMessage(result)))
  }

  function addOptimisticUserMessage(
    threadId: string,
    turnInput: {
      text: string
      images: UiComposerSubmitPayload['images']
      skills: UiComposerSubmitPayload['skills']
    },
  ): string {
    if (!threadId) return ''

    nextOptimisticUserMessageId += 1
    const messageId = `optimistic-user:${threadId}:${String(nextOptimisticUserMessageId)}`
    const message: UiMessage = {
      id: messageId,
      role: 'user',
      text: turnInput.text,
      images: turnInput.images.map((image) => image.url).filter((url) => url.trim().length > 0),
      skills: turnInput.skills,
      messageType: 'userMessage.optimistic',
    }
    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    setPersistedMessagesForThread(threadId, upsertMessage(previous, message))
    return messageId
  }

  function removeOptimisticUserMessage(threadId: string, messageId: string): void {
    if (!threadId || !messageId) return
    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    setPersistedMessagesForThread(threadId, removeMessageById(previous, messageId))
  }

  function beginPendingTurnForThread(
    threadId: string,
    mode: UiCollaborationModeOption = selectedCollaborationMode.value,
  ): void {
    shouldAutoScrollOnNextAgentEvent = true
    setTurnSummaryForThread(threadId, null)
    setTurnActivityForThread(
      threadId,
      buildPendingTurnActivity({
        modelId: selectedModelId.value,
        reasoningEffort: selectedReasoningEffort.value,
        mode,
      }),
    )
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)
  }

  function failPendingTurnForThread(
    threadId: string,
    unknownError: unknown,
    fallbackMessage: string,
  ): Error {
    shouldAutoScrollOnNextAgentEvent = false
    setThreadInProgress(threadId, false)
    setTurnActivityForThread(threadId, null)
    const errorMessage = unknownError instanceof Error ? unknownError.message : fallbackMessage
    setTurnErrorForThread(threadId, errorMessage)
    error.value = errorMessage
    return unknownError instanceof Error ? unknownError : new Error(errorMessage)
  }

  function beginSteeringTurnForThread(threadId: string): void {
    shouldAutoScrollOnNextAgentEvent = true
    setTurnActivityForThread(
      threadId,
      buildSteeringTurnActivity({
        modelId: selectedModelId.value,
        reasoningEffort: selectedReasoningEffort.value,
      }),
    )
    setTurnErrorForThread(threadId, null)
  }

  function upsertLiveAgentMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, nextMessage)
    setLiveAgentMessagesForThread(threadId, next)
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    liveReasoningTextByThreadId.value = updateLiveReasoningTextForThread(
      liveReasoningTextByThreadId.value,
      threadId,
      text,
    )
  }

  function appendLiveReasoningText(threadId: string, delta: string): void {
    liveReasoningTextByThreadId.value = appendLiveReasoningDeltaForThread(
      liveReasoningTextByThreadId.value,
      threadId,
      delta,
    )
  }

  function clearLiveReasoningForThread(threadId: string): void {
    liveReasoningTextByThreadId.value = clearLiveReasoningTextForThread(
      liveReasoningTextByThreadId.value,
      threadId,
    )
  }

  function upsertPendingServerRequest(request: UiServerRequest): void {
    pendingServerRequestsByThreadId.value = upsertServerRequest(
      pendingServerRequestsByThreadId.value,
      request,
    )
  }

  function removePendingServerRequestById(requestId: number): void {
    pendingServerRequestsByThreadId.value = removeServerRequestById(
      pendingServerRequestsByThreadId.value,
      requestId,
    )
  }

  function handleServerRequestNotification(notification: RpcNotification): boolean {
    if (notification.method === 'server/request') {
      const request = normalizeServerRequest(notification.params)
      if (!request) return true
      upsertPendingServerRequest(request)
      return true
    }

    if (notification.method === 'server/request/resolved') {
      const id = readResolvedServerRequestId(notification.params)
      if (id !== null) {
        removePendingServerRequestById(id)
      }
      return true
    }

    return false
  }

  function applyRateLimitNotification(notification: RpcNotification): boolean {
    const rateLimits = readRateLimitSnapshotPayload(notification)
    if (!rateLimits) return false

    const nextSnapshot = normalizeRateLimitSnapshot(
      rateLimits as Parameters<typeof normalizeRateLimitSnapshot>[0],
      rateLimitSnapshot.value?.availableResetCredits ?? null,
    )
    if (nextSnapshot) {
      rateLimitSnapshot.value = nextSnapshot
    }
    return true
  }

  function applyRealtimeUpdates(notification: RpcNotification): void {
    if (applyRateLimitNotification(notification)) {
      return
    }

    const startedThread = readStartedThread(notification)
    if (startedThread) {
      addOptimisticThread(startedThread)
    }

    if (handleServerRequestNotification(notification)) {
      return
    }

    const turnActivity = readTurnActivity(notification)
    if (turnActivity) {
      setTurnActivityForThread(turnActivity.threadId, turnActivity.activity)
    }

    const startedTurn = readTurnStartedInfo(notification)
    if (startedTurn) {
      pendingTurnStartsById.set(startedTurn.turnId, startedTurn)
      activeTurnIdByThreadId.value = setActiveTurnForThread(
        activeTurnIdByThreadId.value,
        startedTurn.threadId,
        startedTurn.turnId,
      )
      setTurnSummaryForThread(startedTurn.threadId, null)
      setTurnErrorForThread(startedTurn.threadId, null)
      setThreadInProgress(startedTurn.threadId, true)
      if (shouldClearUnreadForStartedTurn(eventUnreadByThreadId.value, startedTurn)) {
        eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, startedTurn.threadId)
      }
    }

    const completedTurn = readTurnCompletedInfo(notification)
    if (completedTurn) {
      const startedTurnState = pendingTurnStartsById.get(completedTurn.turnId)
      if (startedTurnState) {
        pendingTurnStartsById.delete(completedTurn.turnId)
      }

      const durationHints = readTurnDurationHints(notification)
      setTurnSummaryForThread(completedTurn.threadId, buildCompletedTurnSummary({
        completedTurn,
        startedTurn: startedTurnState,
        explicitDurationMs: durationHints.explicitDurationMs,
        turnDurationMs: durationHints.turnDurationMs,
      }))
      activeTurnIdByThreadId.value = clearActiveTurnForThread(
        activeTurnIdByThreadId.value,
        completedTurn.threadId,
      )
      livePlanMessageIdByTurnId.delete(completedTurn.turnId)
      setThreadInProgress(completedTurn.threadId, false)
      setTurnActivityForThread(completedTurn.threadId, null)
      markThreadUnreadByEvent(completedTurn.threadId)
    }

    const turnErrorMessage = readTurnErrorMessage(notification)
    if (turnErrorMessage) {
      const failedThreadId = completedTurn?.threadId || extractThreadIdFromNotification(notification)
      if (failedThreadId) {
        setTurnErrorForThread(failedThreadId, turnErrorMessage)
      }
      error.value = turnErrorMessage
    } else if (completedTurn) {
      setTurnErrorForThread(completedTurn.threadId, null)
    }

    if (notification.method === 'thread/compacted') {
      const compactedThreadId = extractThreadIdFromNotification(notification)
      if (compactedThreadId) {
        setThreadInProgress(compactedThreadId, false)
        setTurnActivityForThread(compactedThreadId, null)
        setTurnErrorForThread(compactedThreadId, null)
      }
    }

    const notificationThreadId = extractThreadIdFromNotification(notification)
    if (!notificationThreadId) return
    const isSelectedNotificationThread = notificationThreadId === selectedThreadId.value

    const completedUserMessages = readUserMessageCompleted(notification)
    if (completedUserMessages.length > 0) {
      const previousMessages = persistedMessagesByThreadId.value[notificationThreadId] ?? []
      setPersistedMessagesForThread(
        notificationThreadId,
        mergeMessages(previousMessages, completedUserMessages, { preserveMissing: true }),
      )
    }

    const startedAgentMessageId = readAgentMessageStartedId(notification)
    if (startedAgentMessageId) {
      activeReasoningItemIdByThreadId.delete(notificationThreadId)
    }

    const liveAgentMessageDelta = readAgentMessageDelta(notification)
    if (liveAgentMessageDelta) {
      liveAgentMessagesByThreadId.value = upsertLiveAssistantDeltaForThread(
        liveAgentMessagesByThreadId.value,
        notificationThreadId,
        {
          messageId: liveAgentMessageDelta.messageId,
          textDelta: liveAgentMessageDelta.delta,
          messageType: 'agentMessage.live',
        },
      )
    }

    const completedAgentMessage = readAgentMessageCompleted(notification)
    if (completedAgentMessage) {
      upsertLiveAgentMessage(notificationThreadId, completedAgentMessage)
    }

    const livePlanMessageDelta = readPlanMessageDelta(notification)
    if (livePlanMessageDelta) {
      if (livePlanMessageDelta.turnId) {
        livePlanMessageIdByTurnId.set(livePlanMessageDelta.turnId, livePlanMessageDelta.messageId)
      }
      liveAgentMessagesByThreadId.value = upsertLiveAssistantDeltaForThread(
        liveAgentMessagesByThreadId.value,
        notificationThreadId,
        {
          messageId: livePlanMessageDelta.messageId,
          textDelta: livePlanMessageDelta.delta,
          messageType: 'plan.live',
        },
      )
    }

    const updatedPlanMessage = readPlanUpdatedMessage(
      notification,
      (turnId) => livePlanMessageIdByTurnId.get(turnId),
    )
    if (updatedPlanMessage) {
      upsertLiveAgentMessage(notificationThreadId, updatedPlanMessage)
    }

    const completedPlanMessage = readPlanMessageCompleted(notification)
    if (completedPlanMessage) {
      upsertLiveAgentMessage(notificationThreadId, completedPlanMessage)
    }

    const startedReasoningItemId = readReasoningStartedItemId(notification)
    if (startedReasoningItemId) {
      activeReasoningItemIdByThreadId.set(notificationThreadId, startedReasoningItemId)
    }

    const liveReasoningDelta = readReasoningDelta(notification)
    if (liveReasoningDelta) {
      appendLiveReasoningText(notificationThreadId, liveReasoningDelta.delta)
    }

    const sectionBreakMessageId = readReasoningSectionBreakMessageId(notification)
    if (sectionBreakMessageId) {
      liveReasoningTextByThreadId.value = appendLiveReasoningSectionBreakForThread(
        liveReasoningTextByThreadId.value,
        notificationThreadId,
      )
    }

    const completedReasoningMessageId = readReasoningCompletedId(notification)
    if (completedReasoningMessageId) {
      const activeReasoningItemId = activeReasoningItemIdByThreadId.get(notificationThreadId) ?? ''
      if (completedReasoningMessageId === liveReasoningMessageId(activeReasoningItemId)) {
        activeReasoningItemIdByThreadId.delete(notificationThreadId)
      }
    }

    if (isAgentContentEvent(notification)) {
      if (isSelectedNotificationThread && shouldAutoScrollOnNextAgentEvent && selectedThreadId.value) {
        setThreadScrollState(selectedThreadId.value, {
          scrollTop: 0,
          isAtBottom: true,
          scrollRatio: 1,
        })
      }
      activeReasoningItemIdByThreadId.delete(notificationThreadId)
      clearLiveReasoningForThread(notificationThreadId)
    }

    if (notification.method === 'turn/completed') {
      activeReasoningItemIdByThreadId.delete(notificationThreadId)
      if (isSelectedNotificationThread) {
        shouldAutoScrollOnNextAgentEvent = false
      }
      clearLiveReasoningForThread(notificationThreadId)
    }

  }

  function queueEventDrivenSync(notification: RpcNotification): void {
    if (!shouldQueueEventDrivenSyncForMethod(notification.method)) return

    const threadId = extractThreadIdFromNotification(notification)
    queueDesktopRealtimeSync(realtimeSyncQueue, threadId || undefined)

    if (eventSyncTimer !== null || typeof window === 'undefined') return
    eventSyncTimer = window.setTimeout(() => {
      eventSyncTimer = null
      void syncFromNotifications()
    }, EVENT_SYNC_DEBOUNCE_MS)
  }

  async function loadThreads() {
    if (!hasLoadedThreads.value) {
      isLoadingThreads.value = true
    }

    try {
      const groups = await getThreadGroups(isArchiveView.value)

      const nextProjectOrder = mergeProjectOrder(projectOrder.value, groups)
      if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
        projectOrder.value = nextProjectOrder
        saveProjectOrder(projectOrder.value)
      }

      const orderedGroups = orderGroupsByProjectOrder(groups, projectOrder.value)
      const optimisticResult = reconcileOptimisticThreads(orderedGroups, optimisticThreadById.value)
      if (optimisticResult.optimisticThreadById !== optimisticThreadById.value) {
        optimisticThreadById.value = optimisticResult.optimisticThreadById
      }
      const groupsWithOptimisticThreads = optimisticResult.groups
      sourceGroups.value = mergeThreadGroups(sourceGroups.value, groupsWithOptimisticThreads)
      applyThreadFlags()
      hasLoadedThreads.value = true

      const flatThreads = flattenThreads(projectGroups.value)
      pruneThreadScopedState(flatThreads)

      const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)

      if (!currentExists) {
        setSelectedThreadId(flatThreads[0]?.id ?? '')
      }
    } finally {
      isLoadingThreads.value = false
    }
  }

  async function loadMessages(threadId: string, options: { silent?: boolean } = {}) {
    if (!threadId) {
      return
    }

    const requestId = nextMessageLoadRequestId + 1
    nextMessageLoadRequestId = requestId
    latestMessageLoadRequestIdByThreadId.set(threadId, requestId)
    const shouldShowLoading = shouldShowMessagesLoading({
      loadedMessagesByThreadId: loadedMessagesByThreadId.value,
      threadId,
      silent: options.silent === true,
    })
    if (shouldShowLoading) {
      setMessagesLoadingForThread(threadId, true)
    }

    try {
      if (resumedThreadById.value[threadId] !== true) {
        await resumeThread(threadId)
        resumedThreadById.value = markThreadResumed(resumedThreadById.value, threadId)
      }

      const nextMessages = await getThreadMessages(threadId)
      if (latestMessageLoadRequestIdByThreadId.get(threadId) !== requestId) {
        return
      }
      const previousPersisted = persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
        preserveMissing: options.silent === true,
      })
      setPersistedMessagesForThread(threadId, mergedMessages)

      const previousLiveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
      const nextLiveAgent = removeRedundantLiveAgentMessages(previousLiveAgent, nextMessages)
      setLiveAgentMessagesForThread(threadId, nextLiveAgent)

      loadedMessagesByThreadId.value = markThreadMessagesLoaded(loadedMessagesByThreadId.value, threadId)

      const version = currentThreadVersion(threadId)
      loadedVersionByThreadId.value = setThreadLoadedVersion(
        loadedVersionByThreadId.value,
        threadId,
        version,
      )
      markThreadAsRead(threadId)
    } finally {
      if (latestMessageLoadRequestIdByThreadId.get(threadId) === requestId) {
        latestMessageLoadRequestIdByThreadId.delete(threadId)
        setMessagesLoadingForThread(threadId, false)
      }
    }
  }

  async function refreshAll() {
    error.value = ''

    try {
      await hydrateTurnPreferencesFromSettingsStore()
      await Promise.all([
        loadThreads(),
        refreshModelPreferences(),
        refreshCollaborationModes(),
        refreshRateLimits(),
      ])
      await loadMessages(selectedThreadId.value)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function selectThread(threadId: string) {
    setSelectedThreadId(threadId)

    try {
      await loadMessages(threadId)
    } catch (unknownError) {
      if (selectedThreadId.value === threadId) {
        error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      }
    }
  }

  async function archiveThreadById(threadId: string) {
    try {
      await archiveThread(threadId)
      await loadThreads()

      if (selectedThreadId.value === threadId) {
        await loadMessages(selectedThreadId.value)
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function unarchiveThreadById(threadId: string): Promise<void> {
    try {
      await unarchiveThread(threadId)
      await loadThreads()

      if (selectedThreadId.value === threadId) {
        await loadMessages(selectedThreadId.value)
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to restore thread'
    }
  }

  async function forkThreadById(threadId: string): Promise<string> {
    try {
      const forkedThreadId = await forkThread(threadId)
      await loadThreads()
      if (forkedThreadId) {
        setSelectedThreadId(forkedThreadId)
        await loadMessages(forkedThreadId)
      }
      return forkedThreadId
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to fork thread'
      return ''
    }
  }

  async function compactThreadById(threadId: string): Promise<void> {
    try {
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(threadId, { label: 'Compacting context', details: [] })
      setTurnErrorForThread(threadId, null)
      setThreadInProgress(threadId, true)
      await compactThread(threadId)
      queueDesktopRealtimeSync(realtimeSyncQueue, threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to compact thread'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    }
  }

  async function setArchiveView(nextValue: boolean): Promise<void> {
    if (isArchiveView.value === nextValue) return
    isArchiveView.value = nextValue
    sourceGroups.value = []
    projectGroups.value = []
    loadedMessagesByThreadId.value = {}
    loadingMessagesByThreadId.value = {}
    latestMessageLoadRequestIdByThreadId.clear()
    persistedMessagesByThreadId.value = {}
    liveAgentMessagesByThreadId.value = {}
    liveReasoningTextByThreadId.value = {}
    activeReasoningItemIdByThreadId.clear()
    shouldAutoScrollOnNextAgentEvent = false

    try {
      await loadThreads()
      await loadMessages(selectedThreadId.value)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function renameThreadById(threadId: string, title: string): Promise<void> {
    const normalizedThreadId = threadId.trim()
    const normalizedTitle = title.trim()
    if (!normalizedThreadId || !normalizedTitle) return

    const previousSourceGroups = sourceGroups.value
    const previousProjectGroups = projectGroups.value
    const previousOptimisticThreads = optimisticThreadById.value

    updateOptimisticThreadTitle(normalizedThreadId, normalizedTitle)
    sourceGroups.value = renameThreadInGroups(sourceGroups.value, normalizedThreadId, normalizedTitle)
    projectGroups.value = renameThreadInGroups(projectGroups.value, normalizedThreadId, normalizedTitle)

    try {
      await renameThread(normalizedThreadId, normalizedTitle)
      await loadThreads()
    } catch (unknownError) {
      optimisticThreadById.value = previousOptimisticThreads
      sourceGroups.value = previousSourceGroups
      projectGroups.value = previousProjectGroups
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to rename thread'
      throw unknownError
    }
  }

  async function sendMessageToSelectedThread(payload: UiComposerSubmitPayload): Promise<void> {
    const threadId = selectedThreadId.value
    const turnInput = normalizeComposerTurnInput(payload)
    if (!threadId || !turnInput.hasContent) return

    if (inProgressById.value[threadId] === true) {
      await steerActiveTurn(threadId, turnInput.text, turnInput.images, turnInput.skills)
      return
    }

    isSendingMessage.value = true
    error.value = ''
    beginPendingTurnForThread(threadId)
    const optimisticMessageId = addOptimisticUserMessage(threadId, turnInput)

    try {
      await startTurnForThread(threadId, turnInput.text, turnInput.images, turnInput.skills)
    } catch (unknownError) {
      removeOptimisticUserMessage(threadId, optimisticMessageId)
      throw failPendingTurnForThread(threadId, unknownError, 'Unknown application error')
    } finally {
      isSendingMessage.value = false
    }
  }

  async function sendTextToThreadById(threadId: string, text: string): Promise<void> {
    const turnInput = normalizeThreadTextTurnInput(threadId, text)
    if (!turnInput.threadId || !turnInput.hasContent) return

    if (!allThreads.value.some((thread) => thread.id === turnInput.threadId)) {
      throw new Error('Thread was not found')
    }

    if (inProgressById.value[turnInput.threadId] === true) {
      await steerActiveTurn(turnInput.threadId, turnInput.text, turnInput.images, turnInput.skills)
      return
    }

    isSendingMessage.value = true
    error.value = ''
    beginPendingTurnForThread(turnInput.threadId)
    const optimisticMessageId = addOptimisticUserMessage(turnInput.threadId, turnInput)

    try {
      await startTurnForThread(turnInput.threadId, turnInput.text, turnInput.images, turnInput.skills)
    } catch (unknownError) {
      removeOptimisticUserMessage(turnInput.threadId, optimisticMessageId)
      throw failPendingTurnForThread(turnInput.threadId, unknownError, 'Unknown application error')
    } finally {
      isSendingMessage.value = false
    }
  }

  async function steerActiveTurn(
    threadId: string,
    nextText: string,
    nextImages: UiComposerSubmitPayload['images'],
    nextSkills: UiComposerSubmitPayload['skills'],
  ): Promise<void> {
    const turnId = activeTurnIdByThreadId.value[threadId]
    if (!turnId) {
      const errorMessage = 'The current turn is still starting. Wait a moment and try again.'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      throw new Error(errorMessage)
    }

    isSendingMessage.value = true
    error.value = ''
    beginSteeringTurnForThread(threadId)
    const optimisticMessageId = addOptimisticUserMessage(threadId, {
      text: nextText,
      images: nextImages,
      skills: nextSkills,
    })

    try {
      await steerThreadTurn(threadId, turnId, nextText, nextImages, nextSkills)
      queueDesktopRealtimeSync(realtimeSyncQueue, threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      removeOptimisticUserMessage(threadId, optimisticMessageId)
      shouldAutoScrollOnNextAgentEvent = false
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to steer active turn'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      throw unknownError
    } finally {
      isSendingMessage.value = false
    }
  }

  async function sendMessageToNewThread(payload: UiComposerSubmitPayload, cwd: string): Promise<string> {
    const turnInput = normalizeNewThreadTurnInput(payload, cwd)
    const selectedModel = selectedModelId.value.trim()
    if (!turnInput.hasContent) return ''

    isSendingMessage.value = true
    error.value = ''
    let threadId = ''

    try {
      threadId = await startThread(turnInput.targetCwd || undefined, selectedModel || undefined)
      if (!threadId) return ''

      const createdAtIso = new Date().toISOString()
      setSelectedThreadId(threadId)
      addOptimisticThread({
        id: threadId,
        title: 'Untitled thread',
        projectName: turnInput.targetCwd || 'unknown-project',
        cwd: turnInput.targetCwd,
        createdAtIso,
        updatedAtIso: createdAtIso,
        preview: turnInput.text,
        unread: false,
        inProgress: false,
      })
      setThreadInProgress(threadId, true)

      void loadThreads().catch(() => {
        queueDesktopRealtimeSync(realtimeSyncQueue)
      })

      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }
      beginPendingTurnForThread(threadId)
      const optimisticMessageId = addOptimisticUserMessage(threadId, turnInput)

      void startTurnForThread(threadId, turnInput.text, turnInput.images, turnInput.skills).catch((unknownError) => {
        removeOptimisticUserMessage(threadId, optimisticMessageId)
        failPendingTurnForThread(threadId, unknownError, 'Unknown application error')
      })
      return threadId
    } catch (unknownError) {
      if (threadId) {
        throw failPendingTurnForThread(threadId, unknownError, 'Unknown application error')
      }
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      shouldAutoScrollOnNextAgentEvent = false
      error.value = errorMessage
      throw unknownError
    } finally {
      isSendingMessage.value = false
    }
  }

  async function startTurnForThread(
    threadId: string,
    nextText: string,
    nextImages: UiComposerSubmitPayload['images'],
    nextSkills: UiComposerSubmitPayload['skills'],
  ): Promise<void> {
    const modelId = selectedModelId.value.trim()
    const reasoningEffort = selectedReasoningEffort.value
    const collaborationMode = buildTurnCollaborationMode(
      selectedCollaborationMode.value,
      modelId,
      reasoningEffort,
    )

    try {
      if (resumedThreadById.value[threadId] !== true) {
        await resumeThread(threadId)
      }

      const turnId = await startThreadTurn(
        threadId,
        nextText,
        nextImages,
        nextSkills,
        modelId || undefined,
        reasoningEffort || undefined,
        collaborationMode,
      )
      activeTurnIdByThreadId.value = setActiveTurnForThread(
        activeTurnIdByThreadId.value,
        threadId,
        turnId,
      )

      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }

      queueDesktopRealtimeSync(realtimeSyncQueue, threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      throw unknownError
    }
  }

  async function interruptTurnForThread(threadId: string): Promise<void> {
    if (!threadId) return
    if (inProgressById.value[threadId] !== true) return
    const turnId = activeTurnIdByThreadId.value[threadId]
    if (!turnId) {
      const errorMessage = 'The current turn is still starting. Wait a moment before interrupting.'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      return
    }

    isInterruptingTurn.value = true
    error.value = ''
    try {
      await interruptThreadTurn(threadId, turnId)
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      activeTurnIdByThreadId.value = clearActiveTurnForThread(activeTurnIdByThreadId.value, threadId)
      queueDesktopRealtimeSync(realtimeSyncQueue, threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to interrupt active turn'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    } finally {
      isInterruptingTurn.value = false
    }
  }

  async function interruptSelectedThreadTurn(): Promise<void> {
    await interruptTurnForThread(selectedThreadId.value)
  }

  async function interruptThreadTurnById(threadId: string): Promise<void> {
    const normalizedThreadId = threadId.trim()
    await interruptTurnForThread(normalizedThreadId)
  }

  function renameProject(projectName: string, displayName: string): void {
    const nextDisplayNames = renameProjectDisplayName(projectDisplayNameById.value, projectName, displayName)
    if (nextDisplayNames === projectDisplayNameById.value) return
    projectDisplayNameById.value = nextDisplayNames
    saveProjectDisplayNames(nextDisplayNames)
  }

  function removeProject(projectName: string): void {
    if (projectName.length === 0) return

    const nextProjectOrder = removeProjectFromOrder(projectOrder.value, projectName)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }

    sourceGroups.value = removeProjectFromGroups(sourceGroups.value, projectName)

    const nextDisplayNames = removeProjectDisplayName(projectDisplayNameById.value, projectName)
    if (nextDisplayNames !== projectDisplayNameById.value) {
      projectDisplayNameById.value = nextDisplayNames
      saveProjectDisplayNames(nextDisplayNames)
    }

    applyThreadFlags()

    const flatThreads = flattenThreads(projectGroups.value)
    pruneThreadScopedState(flatThreads)

    const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)
    if (!currentExists) {
      setSelectedThreadId(flatThreads[0]?.id ?? '')
    }
  }

  function reorderProject(projectName: string, toIndex: number): void {
    const nextProjectOrder = moveProjectInOrder(projectOrder.value, projectName, toIndex)
    if (nextProjectOrder === projectOrder.value) return

    projectOrder.value = nextProjectOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
  }

  async function syncThreadStatus(): Promise<void> {
    if (isPolling.value) return
    isPolling.value = true

    try {
      await loadThreads()

      if (!selectedThreadId.value) return

      const threadId = selectedThreadId.value
      const currentVersion = currentThreadVersion(threadId)
      const loadedVersion = loadedVersionByThreadId.value[threadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion
      const isInProgress = inProgressById.value[threadId] === true

      if (isInProgress || hasVersionChange) {
        await loadMessages(threadId, { silent: true })
      }
    } catch {
      // ignore poll failures and keep last known state
    } finally {
      isPolling.value = false
    }
  }

  async function syncFromNotifications(): Promise<void> {
    if (isPolling.value) {
      if (typeof window !== 'undefined' && eventSyncTimer === null) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
      return
    }

    isPolling.value = true

    const syncBatch = consumeDesktopRealtimeSyncQueue(realtimeSyncQueue)
    const shouldRefreshThreads = syncBatch.shouldRefreshThreads
    const threadIdsToRefresh = syncBatch.threadIdsToRefresh

    try {
      if (shouldRefreshThreads) {
        await loadThreads()
      }

      const activeThreadId = selectedThreadId.value
      if (!activeThreadId) return

      const isActiveDirty = threadIdsToRefresh.has(activeThreadId)
      const isInProgress = inProgressById.value[activeThreadId] === true
      const currentVersion = currentThreadVersion(activeThreadId)
      const loadedVersion = loadedVersionByThreadId.value[activeThreadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion

      if (isActiveDirty || isInProgress || hasVersionChange || shouldRefreshThreads) {
        await loadMessages(activeThreadId, { silent: true })
      }
    } catch {
      // Keep UI stable on transient event sync failures.
    } finally {
      isPolling.value = false

      if (
        hasPendingDesktopRealtimeSync(realtimeSyncQueue) &&
        typeof window !== 'undefined' &&
        eventSyncTimer === null
      ) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
    }
  }

  function startRealtimeSync(): void {
    if (typeof window === 'undefined') return

    if (stopNotificationStream) return
    void hydrateTurnPreferencesFromSettingsStore()
    if (isAutoRefreshEnabled.value) {
      startAutoRefreshTimer()
    }
    void loadPendingServerRequestsFromBridge()
    void refreshRateLimits()
    stopNotificationStream = subscribeRpcNotifications((notification) => {
      applyRealtimeUpdates(notification)
      queueEventDrivenSync(notification)
    })
  }

  async function loadPendingServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await fetchPendingServerRequests()
      for (const row of rows) {
        const request = normalizeServerRequest(row)
        if (request) {
          upsertPendingServerRequest(request)
        }
      }
    } catch {
      // Keep UI usable when pending request endpoint is temporarily unavailable.
    }
  }

  async function respondToPendingServerRequest(reply: UiServerRequestReply): Promise<void> {
    try {
      await respondServerRequest({
        id: reply.id,
        approvalScope: reply.approvalScope,
        result: reply.result,
        error: reply.error,
      })
      removePendingServerRequestById(reply.id)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to reply to server request'
    }
  }

  function stopAutoRefreshTimer(options: { updatePreference?: boolean } = {}): void {
    const updatePreference = options.updatePreference ?? true

    if (autoRefreshIntervalTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(autoRefreshIntervalTimer)
      autoRefreshIntervalTimer = null
    }
    if (autoRefreshCountdownTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(autoRefreshCountdownTimer)
      autoRefreshCountdownTimer = null
    }
    if (updatePreference) {
      isAutoRefreshEnabled.value = false
      saveAutoRefreshEnabled(false)
    }
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
  }

  function startAutoRefreshTimer(): void {
    if (typeof window === 'undefined') return
    if (autoRefreshIntervalTimer !== null || autoRefreshCountdownTimer !== null) return

    isAutoRefreshEnabled.value = true
    saveAutoRefreshEnabled(true)
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)

    autoRefreshIntervalTimer = window.setInterval(() => {
      autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
      void syncThreadStatus()
    }, AUTO_REFRESH_INTERVAL_MS)

    autoRefreshCountdownTimer = window.setInterval(() => {
      autoRefreshSecondsLeft.value = Math.max(0, autoRefreshSecondsLeft.value - 1)
    }, 1000)
  }

  function toggleAutoRefreshTimer(): void {
    if (isAutoRefreshEnabled.value) {
      stopAutoRefreshTimer()
      return
    }
    startAutoRefreshTimer()
  }

  function stopRealtimeSync(): void {
    stopAutoRefreshTimer({ updatePreference: false })

    if (stopNotificationStream) {
      stopNotificationStream()
      stopNotificationStream = null
    }

    clearDesktopRealtimeSyncQueue(realtimeSyncQueue)
    pendingTurnStartsById.clear()
    livePlanMessageIdByTurnId.clear()
    latestMessageLoadRequestIdByThreadId.clear()
    if (eventSyncTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(eventSyncTimer)
      eventSyncTimer = null
    }
    activeReasoningItemIdByThreadId.clear()
    shouldAutoScrollOnNextAgentEvent = false
    loadingMessagesByThreadId.value = {}
    persistedMessagesByThreadId.value = {}
    liveAgentMessagesByThreadId.value = {}
    liveReasoningTextByThreadId.value = {}
    turnActivityByThreadId.value = {}
    turnSummaryByThreadId.value = {}
    turnErrorByThreadId.value = {}
    activeTurnIdByThreadId.value = {}
  }

  return {
    projectGroups,
    projectDisplayNameById,
    selectedThread,
    selectedThreadScrollState,
    selectedThreadServerRequests,
    allPendingServerRequests,
    selectedLiveOverlay,
    selectedThreadId,
    isArchiveView,
    rateLimitSnapshot,
    availableModelIds,
    selectedModelId,
    selectedReasoningEffort,
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
    error,
    clearError,
    refreshAll,
    refreshRateLimits,
    selectThread,
    setThreadScrollState,
    archiveThreadById,
    unarchiveThreadById,
    forkThreadById,
    compactThreadById,
    setArchiveView,
    renameThreadById,
    sendMessageToSelectedThread,
    sendTextToThreadById,
    sendMessageToNewThread,
    interruptSelectedThreadTurn,
    interruptThreadTurnById,
    setSelectedModelId,
    setSelectedReasoningEffort,
    setSelectedCollaborationModeName,
    respondToPendingServerRequest,
    recordRollbackAudit,
    renameProject,
    removeProject,
    reorderProject,
    toggleAutoRefreshTimer,
    startRealtimeSync,
    stopRealtimeSync,
  }
}
