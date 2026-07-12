import type { StructuredPlanUpdate } from './realtimeNotificationReaders'

export type DesktopPlanState = StructuredPlanUpdate & {
  revision: number
  lifecycle: 'active' | 'ended'
  possiblyStale: boolean
}

export function applyStructuredPlanUpdate(
  state: Record<string, DesktopPlanState>,
  update: StructuredPlanUpdate,
  revision: number,
): Record<string, DesktopPlanState> {
  return {
    ...state,
    [update.threadId]: { ...update, revision, lifecycle: 'active', possiblyStale: false },
  }
}

export function endStructuredPlan(state: Record<string, DesktopPlanState>, threadId: string, turnId: string): Record<string, DesktopPlanState> {
  const current = state[threadId]
  if (!current || current.turnId !== turnId || current.lifecycle === 'ended') return state
  return { ...state, [threadId]: { ...current, lifecycle: 'ended', possiblyStale: current.steps.some((step) => step.status !== 'completed') } }
}

export function clearStructuredPlan(state: Record<string, DesktopPlanState>, threadId: string): Record<string, DesktopPlanState> {
  if (!(threadId in state)) return state
  const next = { ...state }; delete next[threadId]; return next
}
