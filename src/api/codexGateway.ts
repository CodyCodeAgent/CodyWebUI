import {
  fetchRpcMethodCatalog,
  fetchRpcNotificationCatalog,
  fetchGatewayDiagnostics,
  fetchPendingServerRequests,
  rpcCall,
  respondServerRequest,
  subscribeProductNotifications,
  subscribeRpcNotifications,
  type ProductNotification,
  type RpcNotification,
} from './codexRpcClient'
import { normalizeCodexApiError } from './codexErrors'
import type {
  UiApprovalDecisionScope,
} from '../types/codex'
export {
  getAvailableSkills,
  uploadComposerImage,
} from './codexComposerClient'
export {
  getAvailableModelIds,
  getCollaborationModes,
  getCurrentModelConfig,
  setDefaultModel,
  type CurrentModelConfig,
} from './codexModelClient'
export {
  getAccountRateLimits,
  normalizeRateLimitSnapshot,
} from './codexRateLimitClient'
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

async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
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

// `thread/loaded/list` returns sessions loaded in memory, not currently running turns.
