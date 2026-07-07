import {
  fetchRpcMethodCatalog,
  fetchRpcNotificationCatalog,
  fetchGatewayDiagnostics,
  fetchPendingServerRequests,
  rpcCall,
  respondServerRequest,
  subscribeProductNotifications,
  subscribeRpcNotifications,
  uploadLocalImage,
  type ProductNotification,
  type RpcNotification,
  type UploadedLocalImage,
} from './codexRpcClient'
import type {
  CollaborationModeListResponse,
  ConfigReadResponse,
  GetAccountRateLimitsResponse,
  ModelListResponse,
  RateLimitSnapshot,
  RateLimitWindow,
  ReasoningEffort,
  SkillMetadata,
  SkillsListResponse,
} from './appServerDtos'
import { normalizeCodexApiError } from './codexErrors'
import type {
  UiApprovalDecisionScope,
  UiComposerSkill,
  UiCollaborationModeOption,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../types/codex'
export {
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
  type TurnCollaborationMode,
} from './codexThreadClient'

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

function normalizeCollaborationModeLabel(name: string, mode: UiCollaborationModeOption['mode']): string {
  const normalizedName = name.trim()
  if (normalizedName.length > 0) {
    return normalizedName
      .replace(/[-_]+/gu, ' ')
      .replace(/\b\w/gu, (letter) => letter.toUpperCase())
  }
  return mode === 'plan' ? 'Plan' : 'Default'
}

function normalizeCollaborationModeOption(row: CollaborationModeListResponse['data'][number]): UiCollaborationModeOption | null {
  const mode = row.mode === 'plan' || row.mode === 'default' ? row.mode : null
  if (!mode) return null
  const name = row.name.trim() || mode
  return {
    name,
    mode,
    label: normalizeCollaborationModeLabel(name, mode),
    model: row.model?.trim() ?? '',
    reasoningEffort: normalizeReasoningEffort(row.reasoning_effort),
    developerInstructions: row.developer_instructions,
  }
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

export async function getMethodCatalog(): Promise<string[]> {
  return fetchRpcMethodCatalog()
}

export async function getNotificationCatalog(): Promise<string[]> {
  return fetchRpcNotificationCatalog()
}

export async function getGatewayDiagnostics() {
  return fetchGatewayDiagnostics()
}

export function subscribeCodexNotifications(onNotification: (value: RpcNotification) => void): () => void {
  return subscribeRpcNotifications(onNotification)
}

export function subscribeLocalProductNotifications(onNotification: (value: ProductNotification) => void): () => void {
  return subscribeProductNotifications(onNotification)
}

export type { ProductNotification, RpcNotification }

export async function getAccountRateLimits(): Promise<UiRateLimitSnapshot | null> {
  const payload = await callRpc<AccountRateLimitsPayload>('account/rateLimits/read')
  const resetCredits =
    typeof payload.rateLimitResetCredits?.availableCount === 'number'
      ? payload.rateLimitResetCredits.availableCount
      : null
  return normalizeRateLimitSnapshot(pickPrimaryAccountLimit(payload), resetCredits)
}

export async function getCollaborationModes(): Promise<UiCollaborationModeOption[]> {
  const payload = await callRpc<CollaborationModeListResponse>('collaborationMode/list', {})
  const options: UiCollaborationModeOption[] = []
  const seen = new Set<string>()

  for (const row of payload.data) {
    const option = normalizeCollaborationModeOption(row)
    if (!option) continue
    if (seen.has(option.name)) continue
    seen.add(option.name)
    options.push(option)
  }

  return options
}

export async function replyToServerRequest(
  id: number,
  payload: { approvalScope?: UiApprovalDecisionScope; result?: unknown; error?: { code?: number; message: string } },
): Promise<void> {
  await respondServerRequest({
    id,
    ...payload,
  })
}

export async function getPendingServerRequests(): Promise<unknown[]> {
  return fetchPendingServerRequests()
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
