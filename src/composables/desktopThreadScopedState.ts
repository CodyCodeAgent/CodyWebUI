import type { TurnActivityState } from './realtimeNotificationReaders'
import type { TurnErrorState, TurnSummaryState } from './desktopMessageState'
import { pruneServerRequestsToThreads } from './desktopServerRequests'
import { pruneThreadStateMap } from './threadGroupState'
import type { ThreadScrollState, UiMessage, UiServerRequest } from '../types/codex'

export type DesktopThreadScopedState = {
  readStateByThreadId: Record<string, string>
  scrollStateByThreadId: Record<string, ThreadScrollState>
  loadedMessagesByThreadId: Record<string, boolean>
  loadedVersionByThreadId: Record<string, string>
  resumedThreadById: Record<string, boolean>
  persistedMessagesByThreadId: Record<string, UiMessage[]>
  liveAgentMessagesByThreadId: Record<string, UiMessage[]>
  liveReasoningTextByThreadId: Record<string, string>
  turnSummaryByThreadId: Record<string, TurnSummaryState>
  turnActivityByThreadId: Record<string, TurnActivityState>
  turnErrorByThreadId: Record<string, TurnErrorState>
  activeTurnIdByThreadId: Record<string, string>
  eventUnreadByThreadId: Record<string, boolean>
  inProgressById: Record<string, boolean>
  pendingServerRequestsByThreadId: Record<string, UiServerRequest[]>
}

export function pruneDesktopThreadScopedState(
  state: DesktopThreadScopedState,
  activeThreadIds: Set<string>,
): DesktopThreadScopedState {
  return {
    readStateByThreadId: pruneThreadStateMap(state.readStateByThreadId, activeThreadIds),
    scrollStateByThreadId: pruneThreadStateMap(state.scrollStateByThreadId, activeThreadIds),
    loadedMessagesByThreadId: pruneThreadStateMap(state.loadedMessagesByThreadId, activeThreadIds),
    loadedVersionByThreadId: pruneThreadStateMap(state.loadedVersionByThreadId, activeThreadIds),
    resumedThreadById: pruneThreadStateMap(state.resumedThreadById, activeThreadIds),
    persistedMessagesByThreadId: pruneThreadStateMap(state.persistedMessagesByThreadId, activeThreadIds),
    liveAgentMessagesByThreadId: pruneThreadStateMap(state.liveAgentMessagesByThreadId, activeThreadIds),
    liveReasoningTextByThreadId: pruneThreadStateMap(state.liveReasoningTextByThreadId, activeThreadIds),
    turnSummaryByThreadId: pruneThreadStateMap(state.turnSummaryByThreadId, activeThreadIds),
    turnActivityByThreadId: pruneThreadStateMap(state.turnActivityByThreadId, activeThreadIds),
    turnErrorByThreadId: pruneThreadStateMap(state.turnErrorByThreadId, activeThreadIds),
    activeTurnIdByThreadId: pruneThreadStateMap(state.activeTurnIdByThreadId, activeThreadIds),
    eventUnreadByThreadId: pruneThreadStateMap(state.eventUnreadByThreadId, activeThreadIds),
    inProgressById: pruneThreadStateMap(state.inProgressById, activeThreadIds),
    pendingServerRequestsByThreadId: pruneServerRequestsToThreads(
      state.pendingServerRequestsByThreadId,
      activeThreadIds,
    ),
  }
}
