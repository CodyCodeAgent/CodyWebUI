import {
  fetchRpcMethodCatalog,
  fetchRpcNotificationCatalog,
  fetchPendingServerRequests,
  rpcCall,
  respondServerRequest,
  subscribeRpcNotifications,
  uploadLocalImage,
  type RpcNotification,
  type UploadedLocalImage,
} from './codexRpcClient'
import type {
  ConfigReadResponse,
  GetAccountRateLimitsResponse,
  ModelListResponse,
  RateLimitSnapshot,
  RateLimitWindow,
  ReasoningEffort,
  SkillMetadata,
  SkillsListResponse,
  ThreadCompactStartResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadSetNameResponse,
  ThreadUnarchiveResponse,
  TurnStartResponse,
} from './appServerDtos'
import { normalizeCodexApiError } from './codexErrors'
import { normalizeThreadGroupsV2, normalizeThreadMessagesV2 } from './normalizers/v2'
import type {
  UiComposerImage,
  UiComposerSkill,
  UiMessage,
  UiProjectGroup,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../types/codex'

type CurrentModelConfig = {
  model: string
  reasoningEffort: ReasoningEffort | ''
}

type AccountRateLimitsPayload = GetAccountRateLimitsResponse & {
  rateLimitResetCredits?: {
    availableCount?: number | null
  } | null
}

async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  return typeof value === 'string' && allowed.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : ''
}

function normalizeRateLimitWindow(window: RateLimitWindow | null | undefined): UiRateLimitWindow | null {
  if (!window) return null

  return {
    usedPercent: Number.isFinite(window.usedPercent)
      ? Math.min(Math.max(window.usedPercent, 0), 100)
      : 0,
    windowDurationMins: typeof window.windowDurationMins === 'number' ? window.windowDurationMins : null,
    resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt : null,
  }
}

export function normalizeRateLimitSnapshot(
  snapshot: RateLimitSnapshot | null | undefined,
  availableResetCredits: number | null = null,
): UiRateLimitSnapshot | null {
  if (!snapshot) return null

  return {
    limitId: snapshot.limitId ?? '',
    limitName: snapshot.limitName ?? '',
    planType: snapshot.planType ?? '',
    primary: normalizeRateLimitWindow(snapshot.primary),
    secondary: normalizeRateLimitWindow(snapshot.secondary),
    credits: snapshot.credits
      ? {
          hasCredits: snapshot.credits.hasCredits,
          unlimited: snapshot.credits.unlimited,
          balance: snapshot.credits.balance ?? '',
        }
      : null,
    availableResetCredits,
  }
}

function pickPrimaryAccountLimit(payload: AccountRateLimitsPayload): RateLimitSnapshot | null {
  return payload.rateLimitsByLimitId?.codex ?? payload.rateLimits ?? null
}

async function getThreadGroupsV2(archived = false): Promise<UiProjectGroup[]> {
  const payload = await callRpc<ThreadListResponse>('thread/list', {
    archived,
    limit: 100,
    sortKey: 'updated_at',
  })
  return normalizeThreadGroupsV2(payload)
}

async function getThreadMessagesV2(threadId: string): Promise<UiMessage[]> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })
  return normalizeThreadMessagesV2(payload)
}

export async function getThreadGroups(archived = false): Promise<UiProjectGroup[]> {
  try {
    return await getThreadGroupsV2(archived)
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load thread groups', 'thread/list')
  }
}

export async function getThreadMessages(threadId: string): Promise<UiMessage[]> {
  try {
    return await getThreadMessagesV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getMethodCatalog(): Promise<string[]> {
  return fetchRpcMethodCatalog()
}

export async function getNotificationCatalog(): Promise<string[]> {
  return fetchRpcNotificationCatalog()
}

export function subscribeCodexNotifications(onNotification: (value: RpcNotification) => void): () => void {
  return subscribeRpcNotifications(onNotification)
}

export type { RpcNotification }

export async function getAccountRateLimits(): Promise<UiRateLimitSnapshot | null> {
  const payload = await callRpc<AccountRateLimitsPayload>('account/rateLimits/read')
  const resetCredits =
    typeof payload.rateLimitResetCredits?.availableCount === 'number'
      ? payload.rateLimitResetCredits.availableCount
      : null
  return normalizeRateLimitSnapshot(pickPrimaryAccountLimit(payload), resetCredits)
}

export async function replyToServerRequest(
  id: number,
  payload: { result?: unknown; error?: { code?: number; message: string } },
): Promise<void> {
  await respondServerRequest({
    id,
    ...payload,
  })
}

export async function getPendingServerRequests(): Promise<unknown[]> {
  return fetchPendingServerRequests()
}

export async function resumeThread(threadId: string): Promise<void> {
  await callRpc('thread/resume', { threadId })
}

export async function archiveThread(threadId: string): Promise<void> {
  await callRpc('thread/archive', { threadId })
}

export async function unarchiveThread(threadId: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return
  await callRpc<ThreadUnarchiveResponse>('thread/unarchive', { threadId: normalizedThreadId })
}

export async function renameThread(threadId: string, name: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedName = name.trim()
  if (!normalizedThreadId || !normalizedName) return

  await callRpc<ThreadSetNameResponse>('thread/name/set', {
    threadId: normalizedThreadId,
    name: normalizedName,
  })
}

export async function forkThread(threadId: string): Promise<string> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return ''

  const payload = await callRpc<ThreadForkResponse>('thread/fork', {
    threadId: normalizedThreadId,
    persistExtendedHistory: true,
  })
  return payload.thread.id
}

export async function compactThread(threadId: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return
  await callRpc<ThreadCompactStartResponse>('thread/compact/start', {
    threadId: normalizedThreadId,
  })
}

function normalizeThreadIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>

  const thread = record.thread
  if (thread && typeof thread === 'object') {
    const threadId = (thread as Record<string, unknown>).id
    if (typeof threadId === 'string' && threadId.length > 0) {
      return threadId
    }
  }
  return ''
}

export async function startThread(cwd?: string, model?: string): Promise<string> {
  try {
    const params: Record<string, unknown> = {}
    if (typeof cwd === 'string' && cwd.trim().length > 0) {
      params.cwd = cwd.trim()
    }
    if (typeof model === 'string' && model.trim().length > 0) {
      params.model = model.trim()
    }
    const payload = await callRpc<{ thread?: { id?: string } }>('thread/start', params)
    const threadId = normalizeThreadIdFromPayload(payload)
    if (!threadId) {
      throw new Error('thread/start did not return a thread id')
    }
    return threadId
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to start a new thread', 'thread/start')
  }
}

export async function startThreadTurn(
  threadId: string,
  text: string,
  images: UiComposerImage[],
  skills: UiComposerSkill[],
  model?: string,
  effort?: ReasoningEffort,
): Promise<string> {
  try {
    const params: Record<string, unknown> = {
      threadId,
      input: buildTurnInput(text, images, skills),
    }
    if (typeof model === 'string' && model.length > 0) {
      params.model = model
    }
    if (typeof effort === 'string' && effort.length > 0) {
      params.effort = effort
    }
    const payload = await callRpc<TurnStartResponse>('turn/start', params)
    const turnId = payload.turn.id.trim()
    if (!turnId) {
      throw new Error('turn/start did not return a turn id')
    }
    return turnId
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to start turn for thread ${threadId}`, 'turn/start')
  }
}

function buildTurnInput(
  text: string,
  images: UiComposerImage[],
  skills: UiComposerSkill[] = [],
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = []
  for (const skill of skills) {
    const name = skill.name.trim()
    const path = skill.path.trim()
    if (name.length > 0 && path.length > 0) {
      input.push({ type: 'skill', name, path })
    }
  }
  const normalizedText = text.trim()
  if (normalizedText.length > 0) {
    input.push({ type: 'text', text: normalizedText, text_elements: [] })
  }
  for (const image of images) {
    const path = image.path.trim()
    if (path.length > 0) {
      input.push({ type: 'localImage', path })
    }
  }
  return input
}

export async function steerThreadTurn(
  threadId: string,
  expectedTurnId: string,
  text: string,
  images: UiComposerImage[],
  skills: UiComposerSkill[],
): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTurnId = expectedTurnId.trim()
  if (!normalizedThreadId) return

  try {
    if (!normalizedTurnId) {
      throw new Error('turn/steer requires an active turn id')
    }
    await callRpc('turn/steer', {
      threadId: normalizedThreadId,
      expectedTurnId: normalizedTurnId,
      input: buildTurnInput(text, images, skills),
    })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to steer turn for thread ${normalizedThreadId}`, 'turn/steer')
  }
}

function toComposerSkill(skill: SkillMetadata): UiComposerSkill | null {
  const name = skill.name.trim()
  const path = skill.path.trim()
  if (!name || !path || skill.enabled !== true) return null

  const displayName = skill.interface?.displayName?.trim() || name
  const description =
    skill.interface?.shortDescription?.trim() ||
    skill.shortDescription?.trim() ||
    skill.description.trim()

  return {
    name,
    path,
    displayName,
    description,
  }
}

export async function getAvailableSkills(cwd?: string): Promise<UiComposerSkill[]> {
  try {
    const params: Record<string, unknown> = {}
    const normalizedCwd = cwd?.trim() ?? ''
    if (normalizedCwd.length > 0) {
      params.cwds = [normalizedCwd]
    }

    const payload = await callRpc<SkillsListResponse>('skills/list', params)
    const byKey = new Map<string, UiComposerSkill>()
    for (const entry of payload.data) {
      for (const skill of entry.skills) {
        const normalized = toComposerSkill(skill)
        if (!normalized) continue
        byKey.set(`${normalized.name}\n${normalized.path}`, normalized)
      }
    }

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load skills', 'skills/list')
  }
}

export async function uploadComposerImage(file: File): Promise<UploadedLocalImage> {
  try {
    return await uploadLocalImage(file)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to upload ${file.name || 'image'}`, 'uploads/images')
  }
}

export async function interruptThreadTurn(threadId: string, turnId?: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTurnId = turnId?.trim() || ''
  if (!normalizedThreadId) return

  try {
    if (!normalizedTurnId) {
      throw new Error('turn/interrupt requires turnId')
    }
    await callRpc('turn/interrupt', { threadId: normalizedThreadId, turnId: normalizedTurnId })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to interrupt turn for thread ${normalizedThreadId}`, 'turn/interrupt')
  }
}

export async function setDefaultModel(model: string): Promise<void> {
  await callRpc('setDefaultModel', { model })
}

export async function getAvailableModelIds(): Promise<string[]> {
  const payload = await callRpc<ModelListResponse>('model/list', {})
  const ids: string[] = []
  for (const row of payload.data) {
    const candidate = row.id || row.model
    if (!candidate || ids.includes(candidate)) continue
    ids.push(candidate)
  }
  return ids
}

export async function getCurrentModelConfig(): Promise<CurrentModelConfig> {
  const payload = await callRpc<ConfigReadResponse>('config/read', {})
  const model = payload.config.model ?? ''
  const reasoningEffort = normalizeReasoningEffort(payload.config.model_reasoning_effort)
  return { model, reasoningEffort }
}

// `thread/loaded/list` returns sessions loaded in memory, not currently running turns.
