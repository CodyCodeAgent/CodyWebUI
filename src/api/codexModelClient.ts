import type {
  CollaborationModeListResponse,
  ConfigReadResponse,
  ModelListResponse,
  ReasoningEffort,
} from './appServerDtos'
import { normalizeCodexApiError } from './codexErrors'
import { rpcCall } from './codexRpcClient'
import type { UiCollaborationModeOption } from '../types/codex'

export type CurrentModelConfig = {
  model: string
  reasoningEffort: ReasoningEffort | ''
}

async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
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

export function normalizeCollaborationModeOption(
  row: CollaborationModeListResponse['data'][number],
): UiCollaborationModeOption | null {
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
