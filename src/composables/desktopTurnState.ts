import type {
  ReasoningEffort,
  UiCollaborationModeOption,
  UiComposerSubmitPayload,
} from '../types/codex'
import type {
  TurnActivityState,
  TurnCompletedInfo,
  TurnStartedInfo,
} from './realtimeNotificationReaders'
import type { TurnSummaryState } from './desktopMessageState'
import {
  DEFAULT_COLLABORATION_MODE,
  buildPendingTurnDetails,
} from './desktopTurnPreferences'
import { resolveTurnDurationMs } from './desktopMessageState'
import { omitKey } from './threadGroupState'

export type NormalizedComposerTurnInput = {
  text: string
  images: UiComposerSubmitPayload['images']
  skills: UiComposerSubmitPayload['skills']
  hasContent: boolean
}

export type NormalizedThreadTextTurnInput = NormalizedComposerTurnInput & {
  threadId: string
}

export type NormalizedNewThreadTurnInput = NormalizedComposerTurnInput & {
  targetCwd: string
}

function hasTurnContent(input: Pick<NormalizedComposerTurnInput, 'text' | 'images' | 'skills'>): boolean {
  return input.text.length > 0 || input.images.length > 0 || input.skills.length > 0
}

export function normalizeComposerTurnInput(payload: UiComposerSubmitPayload): NormalizedComposerTurnInput {
  const input = {
    text: payload.text.trim(),
    images: payload.images,
    skills: payload.skills,
  }
  return {
    ...input,
    hasContent: hasTurnContent(input),
  }
}

export function normalizeThreadTextTurnInput(threadId: string, text: string): NormalizedThreadTextTurnInput {
  const input = {
    threadId: threadId.trim(),
    text: text.trim(),
    images: [],
    skills: [],
  }
  return {
    ...input,
    hasContent: hasTurnContent(input),
  }
}

export function normalizeNewThreadTurnInput(
  payload: UiComposerSubmitPayload,
  cwd: string,
): NormalizedNewThreadTurnInput {
  return {
    ...normalizeComposerTurnInput(payload),
    targetCwd: cwd.trim(),
  }
}

export function buildPendingTurnActivity(params: {
  modelId: string
  reasoningEffort: ReasoningEffort | ''
  mode: UiCollaborationModeOption
}): TurnActivityState {
  return {
    label: 'Thinking',
    details: buildPendingTurnDetails(params.modelId, params.reasoningEffort, params.mode),
  }
}

export function buildSteeringTurnActivity(params: {
  modelId: string
  reasoningEffort: ReasoningEffort | ''
}): TurnActivityState {
  return {
    label: 'Steering response',
    details: buildPendingTurnDetails(
      params.modelId,
      params.reasoningEffort,
      DEFAULT_COLLABORATION_MODE,
    ),
  }
}

export function setActiveTurnForThread(
  activeTurnIdByThreadId: Record<string, string>,
  threadId: string,
  turnId: string,
): Record<string, string> {
  if (!threadId || !turnId) return activeTurnIdByThreadId
  if (activeTurnIdByThreadId[threadId] === turnId) return activeTurnIdByThreadId
  return {
    ...activeTurnIdByThreadId,
    [threadId]: turnId,
  }
}

export function clearActiveTurnForThread(
  activeTurnIdByThreadId: Record<string, string>,
  threadId: string,
): Record<string, string> {
  if (!threadId || !activeTurnIdByThreadId[threadId]) return activeTurnIdByThreadId
  return omitKey(activeTurnIdByThreadId, threadId)
}

export function shouldClearUnreadForStartedTurn(
  eventUnreadByThreadId: Record<string, boolean>,
  startedTurn: TurnStartedInfo,
): boolean {
  return eventUnreadByThreadId[startedTurn.threadId] === true
}

export function buildCompletedTurnSummary(input: {
  completedTurn: TurnCompletedInfo
  startedTurn: TurnStartedInfo | undefined
  explicitDurationMs: number | null
  turnDurationMs: number | null
}): TurnSummaryState {
  return {
    turnId: input.completedTurn.turnId,
    durationMs: resolveTurnDurationMs({
      explicitDurationMs: input.explicitDurationMs,
      turnDurationMs: input.turnDurationMs,
      completedStartedAtMs: input.completedTurn.startedAtMs,
      completedAtMs: input.completedTurn.completedAtMs,
      pendingStartedAtMs: input.startedTurn?.startedAtMs,
    }),
  }
}
