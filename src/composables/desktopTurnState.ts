import type {
  ReasoningEffort,
  UiCollaborationModeOption,
  UiComposerSubmitPayload,
} from '../types/codex'
import type { TurnActivityState } from './realtimeNotificationReaders'
import {
  DEFAULT_COLLABORATION_MODE,
  buildPendingTurnDetails,
} from './desktopTurnPreferences'

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
