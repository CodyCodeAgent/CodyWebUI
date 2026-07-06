import type {
  RpcEnvelope,
  RpcMethodCatalog,
  UiApprovalGrantList,
  UiAuditTrail,
  UiCodexSessionEventTrail,
  UiDefaultWorkspace,
  UiDirectoryListing,
  UiGatewayDiagnostics,
  UiGitCommitResult,
  UiGitDeliveryDraft,
  UiGitPathActionResult,
  UiGitStatusSnapshot,
  UiNotificationDeliveryReport,
  UiPortsSnapshot,
  UiPreviewProbe,
  UiPreviewScreenshot,
  UiPullRequestCreateResult,
  UiPullRequestDraft,
  UiAuthSessionSnapshot,
  UiApprovalDecisionScope,
  UiReviewComment,
  UiReviewCommentAnchor,
  UiReviewCommentList,
  UiReviewCommentStatus,
  UiReviewFollowUpResult,
  UiTerminalSession,
  UiTerminalSessionList,
  UiToolingCheckpoint,
  UiToolingCheckpointPatch,
  UiToolingDiffSnapshot,
  UiToolingRollbackFileResult,
  UiToolingRollbackHunkResult,
  UiToolingRollbackWorkspaceResult,
  UiToolingStageHunkResult,
  UiSecurityAccessSnapshot,
  UiWorktreeApplyPatchResult,
  UiWorktreeCreateResult,
  UiWorktreeRemoveResult,
  UiWorktreeSnapshot,
  UiTrustedDeviceActionResult,
  UiTrustedDeviceList,
  UiWorkspaceFileContent,
  UiWorkspaceFileList,
  UiWorkspaceFileWriteResult,
  UiWorkspaceScriptRun,
  UiWorkspaceSecuritySnapshot,
  UiWorkspaceSessionSummaryTrail,
  UiWorkspaceReviewDraft,
  UiWorkspaceSnapshot,
  UiWorkspaceValidationRunHistory,
  UiWorkflowDashboard,
  UiWorkflowDeliveryDraft,
  UiWorkflowDeliveryStatusResult,
  UiWorkflowImplementationApplyResult,
  UiWorkflowImplementationDiscardResult,
  UiWorkflowReplay,
  UiWorkflowRun,
  UiWorkflowValidationResult,
} from '../types/codex'
import { CodexApiError, extractErrorMessage } from './codexErrors'

type RpcRequestBody = {
  method: string
  params?: unknown
}

export type RpcNotification = {
  method: string
  params: unknown
  atIso: string
}

export type ProductNotification = {
  id: string
  kind: string
  title: string
  summary: string
  severity: 'info' | 'success' | 'warning' | 'danger'
  createdAtIso: string
  threadId: string
  turnId: string
  method: string
}

type ServerRequestReplyBody = {
  id: number
  approvalScope?: UiApprovalDecisionScope
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

type BridgeWebSocketMessage =
  | {
      type: 'ready'
      atIso?: string
    }
  | {
      type: 'rpc'
      notification?: unknown
      atIso?: string
    }
  | {
      type: 'product'
      notification?: unknown
      atIso?: string
    }

export type UploadedLocalImage = {
  id: string
  name: string
  path: string
  url: string
  mimeType: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Image file could not be read'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Image file could not be read'))
    }
    reader.readAsDataURL(file)
  })
}

export async function rpcCall<T>(method: string, params?: unknown): Promise<T> {
  const body: RpcRequestBody = { method, params: params ?? null }

  let response: Response
  try {
    response = await fetch('/codex-api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : `RPC ${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `RPC ${method} failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const envelope = payload as RpcEnvelope<T> | null
  if (!envelope || typeof envelope !== 'object' || !('result' in envelope)) {
    throw new CodexApiError(`RPC ${method} returned malformed envelope`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return envelope.result
}

export async function fetchRpcMethodCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/methods')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Method catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/methods',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchRpcNotificationCatalog(): Promise<string[]> {
  const response = await fetch('/codex-api/meta/notifications')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification catalog failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/notifications',
        status: response.status,
      },
    )
  }

  const catalog = payload as RpcMethodCatalog
  return Array.isArray(catalog.data) ? catalog.data : []
}

export async function fetchGatewayDiagnostics(): Promise<UiGatewayDiagnostics> {
  let response: Response
  try {
    response = await fetch('/codex-api/meta/diagnostics')
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Gateway diagnostics failed before request was sent',
      { code: 'network_error', method: 'meta/diagnostics' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Gateway diagnostics failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/diagnostics',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const appServer = asRecord(result?.appServer)
  const methodCatalog = asRecord(result?.methodCatalog)
  if (
    !result ||
    !appServer ||
    !methodCatalog ||
    typeof result.generatedAtIso !== 'string' ||
    !Array.isArray(appServer.mcpServers) ||
    !Array.isArray(methodCatalog.methods) ||
    !Array.isArray(methodCatalog.notifications)
  ) {
    throw new CodexApiError('Gateway diagnostics returned malformed response', {
      code: 'invalid_response',
      method: 'meta/diagnostics',
      status: response.status,
    })
  }

  return result as UiGatewayDiagnostics
}

export async function fetchSecurityAccessSnapshot(): Promise<UiSecurityAccessSnapshot> {
  let response: Response
  try {
    response = await fetch('/codex-api/meta/access-security')
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Security access status failed before request was sent',
      { code: 'network_error', method: 'meta/access-security' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Security access status failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'meta/access-security',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const auth = asRecord(result?.auth)
  const network = asRecord(result?.network)
  if (
    !result ||
    !auth ||
    !network ||
    typeof result.generatedAtIso !== 'string' ||
    typeof auth.enabled !== 'boolean' ||
    !Array.isArray(result.risks) ||
    !Array.isArray(result.recommendations)
  ) {
    throw new CodexApiError('Security access status returned malformed response', {
      code: 'invalid_response',
      method: 'meta/access-security',
      status: response.status,
    })
  }

  return result as UiSecurityAccessSnapshot
}

export async function fetchAuthSessionSnapshot(): Promise<UiAuthSessionSnapshot> {
  let response: Response
  try {
    response = await fetch('/auth/session')
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Auth session status failed before request was sent',
      { code: 'network_error', method: 'auth/session' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.status === 401) {
    return { authenticated: false }
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Auth session status failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'auth/session',
        status: response.status,
      },
    )
  }

  const result = asRecord(payload)
  if (!result || typeof result.authenticated !== 'boolean') {
    throw new CodexApiError('Auth session status returned malformed response', {
      code: 'invalid_response',
      method: 'auth/session',
      status: response.status,
    })
  }

  return result as UiAuthSessionSnapshot
}

export async function fetchApprovalGrants(cwd: string): Promise<UiApprovalGrantList> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/approval-grants?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Approval grants failed before request was sent',
      { code: 'network_error', method: 'tooling/approval-grants' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Approval grants failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/approval-grants',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.grants)) {
    throw new CodexApiError('Approval grants returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/approval-grants',
      status: response.status,
    })
  }

  return result as UiApprovalGrantList
}

export async function revokeApprovalGrant(cwd: string, grantId: string): Promise<UiApprovalGrantList> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/approval-grants/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, grantId }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Approval grant revoke failed before request was sent',
      { code: 'network_error', method: 'tooling/approval-grants/revoke' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Approval grant revoke failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/approval-grants/revoke',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.grants)) {
    throw new CodexApiError('Approval grant revoke returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/approval-grants/revoke',
      status: response.status,
    })
  }

  return result as UiApprovalGrantList
}

export async function fetchTrustedDevices(): Promise<UiTrustedDeviceList> {
  let response: Response
  try {
    response = await fetch('/auth/devices')
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Trusted devices failed before request was sent',
      { code: 'network_error', method: 'auth/devices' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Trusted devices failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'auth/devices',
        status: response.status,
      },
    )
  }

  const result = asRecord(payload)
  if (!result || !Array.isArray(result.devices)) {
    throw new CodexApiError('Trusted devices returned malformed response', {
      code: 'invalid_response',
      method: 'auth/devices',
      status: response.status,
    })
  }

  return result as UiTrustedDeviceList
}

async function postDeviceTrustAction(path: string, method: string): Promise<UiTrustedDeviceActionResult> {
  let response: Response
  try {
    response = await fetch(path, { method: 'POST' })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : `${method} failed before request was sent`,
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `${method} failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const result = asRecord(payload)
  if (!result || typeof result.ok !== 'boolean' || typeof result.deviceId !== 'string') {
    throw new CodexApiError(`${method} returned malformed response`, {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }

  return result as UiTrustedDeviceActionResult
}

export async function trustCurrentDevice(): Promise<UiTrustedDeviceActionResult> {
  return postDeviceTrustAction('/auth/device/trust', 'auth/device/trust')
}

export async function revokeCurrentDeviceTrust(): Promise<UiTrustedDeviceActionResult> {
  return postDeviceTrustAction('/auth/device/revoke', 'auth/device/revoke')
}

export async function reloadMcpServers(): Promise<void> {
  await rpcCall<unknown>('config/mcpServer/reload', null)
}

function toNotification(value: unknown): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : new Date().toISOString()

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
  }
}

function toProductNotification(value: unknown): ProductNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.id !== 'string' || record.id.length === 0) return null
  if (typeof record.kind !== 'string' || record.kind.length === 0) return null
  if (typeof record.title !== 'string' || record.title.length === 0) return null
  if (typeof record.summary !== 'string') return null
  if (
    record.severity !== 'info' &&
    record.severity !== 'success' &&
    record.severity !== 'warning' &&
    record.severity !== 'danger'
  ) {
    return null
  }

  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    severity: record.severity,
    createdAtIso: typeof record.createdAtIso === 'string' && record.createdAtIso.length > 0
      ? record.createdAtIso
      : new Date().toISOString(),
    threadId: typeof record.threadId === 'string' ? record.threadId : '',
    turnId: typeof record.turnId === 'string' ? record.turnId : '',
    method: typeof record.method === 'string' ? record.method : '',
  }
}

const rpcNotificationListeners = new Set<(value: RpcNotification) => void>()
const productNotificationListeners = new Set<(value: ProductNotification) => void>()
let bridgeSocket: WebSocket | null = null
let bridgeSocketReconnectTimer: number | null = null
let bridgeSocketReconnectDelayMs = 500

function hasBridgeSocketListeners(): boolean {
  return rpcNotificationListeners.size > 0 || productNotificationListeners.size > 0
}

function bridgeWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/codex-api/ws`
}

function clearBridgeSocketReconnect(): void {
  if (bridgeSocketReconnectTimer === null || typeof window === 'undefined') return
  window.clearTimeout(bridgeSocketReconnectTimer)
  bridgeSocketReconnectTimer = null
}

function scheduleBridgeSocketReconnect(): void {
  if (typeof window === 'undefined') return
  if (!hasBridgeSocketListeners()) return
  if (bridgeSocketReconnectTimer !== null) return

  const delayMs = bridgeSocketReconnectDelayMs
  bridgeSocketReconnectDelayMs = Math.min(10_000, bridgeSocketReconnectDelayMs * 1.6)
  bridgeSocketReconnectTimer = window.setTimeout(() => {
    bridgeSocketReconnectTimer = null
    ensureBridgeSocket()
  }, delayMs)
}

function closeBridgeSocketIfIdle(): void {
  if (hasBridgeSocketListeners()) return
  clearBridgeSocketReconnect()
  bridgeSocket?.close()
  bridgeSocket = null
}

function handleBridgeSocketMessage(rawData: MessageEvent['data']): void {
  try {
    const parsed = JSON.parse(String(rawData)) as BridgeWebSocketMessage
    if (parsed.type === 'rpc') {
      const notification = toNotification({
        ...(asRecord(parsed.notification) ?? {}),
        atIso: parsed.atIso,
      })
      if (!notification) return
      for (const listener of rpcNotificationListeners) {
        listener(notification)
      }
      return
    }

    if (parsed.type === 'product') {
      const notification = toProductNotification(parsed.notification)
      if (!notification) return
      for (const listener of productNotificationListeners) {
        listener(notification)
      }
    }
  } catch {
    // Ignore malformed websocket payloads and keep the connection alive.
  }
}

function ensureBridgeSocket(): void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return
  if (!hasBridgeSocketListeners()) return
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING)) {
    return
  }

  clearBridgeSocketReconnect()
  const socket = new WebSocket(bridgeWebSocketUrl())
  bridgeSocket = socket

  socket.addEventListener('open', () => {
    bridgeSocketReconnectDelayMs = 500
  })

  socket.addEventListener('message', (event) => {
    handleBridgeSocketMessage(event.data)
  })

  socket.addEventListener('close', () => {
    if (bridgeSocket === socket) {
      bridgeSocket = null
    }
    scheduleBridgeSocketReconnect()
  })

  socket.addEventListener('error', () => {
    socket.close()
  })
}

export function subscribeRpcNotifications(onNotification: (value: RpcNotification) => void): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {}
  }

  rpcNotificationListeners.add(onNotification)
  ensureBridgeSocket()

  return () => {
    rpcNotificationListeners.delete(onNotification)
    closeBridgeSocketIfIdle()
  }
}

export function subscribeProductNotifications(onNotification: (value: ProductNotification) => void): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {}
  }

  productNotificationListeners.add(onNotification)
  ensureBridgeSocket()

  return () => {
    productNotificationListeners.delete(onNotification)
    closeBridgeSocketIfIdle()
  }
}

export async function respondServerRequest(body: ServerRequestReplyBody): Promise<void> {
  let response: Response
  try {
    response = await fetch('/codex-api/server-requests/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Failed to reply to server request',
      { code: 'network_error', method: 'server-requests/respond' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Server request reply failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/respond',
        status: response.status,
      },
    )
  }
}

export async function fetchPendingServerRequests(): Promise<unknown[]> {
  const response = await fetch('/codex-api/server-requests/pending')

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pending server requests failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'server-requests/pending',
        status: response.status,
      },
    )
  }

  const record = asRecord(payload)
  const data = record?.data
  return Array.isArray(data) ? data : []
}

export async function fetchDirectoryListing(path: string): Promise<UiDirectoryListing> {
  const params = new URLSearchParams()
  const normalizedPath = path.trim()
  if (normalizedPath.length > 0) {
    params.set('path', normalizedPath)
  }

  const response = await fetch(`/codex-api/fs/directories?${params.toString()}`)

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Directory listing failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'fs/directories',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const directories = Array.isArray(result?.directories) ? result.directories : []
  const pathValue = typeof result?.path === 'string' ? result.path : ''
  const parentPath = typeof result?.parentPath === 'string' ? result.parentPath : pathValue

  return {
    path: pathValue,
    parentPath,
    directories: directories
      .map((entry) => {
        const record = asRecord(entry)
        const name = typeof record?.name === 'string' ? record.name : ''
        const entryPath = typeof record?.path === 'string' ? record.path : ''
        return name && entryPath ? { name, path: entryPath } : null
      })
      .filter((entry): entry is { name: string; path: string } => entry !== null),
  }
}

export async function uploadLocalImage(file: File): Promise<UploadedLocalImage> {
  const dataUrl = await readFileAsDataUrl(file)

  let response: Response
  try {
    response = await fetch('/codex-api/uploads/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type,
        dataUrl,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Image upload failed before request was sent',
      { code: 'network_error', method: 'uploads/images' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Image upload failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'uploads/images',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const id = typeof result?.id === 'string' ? result.id : ''
  const name = typeof result?.name === 'string' ? result.name : file.name
  const path = typeof result?.path === 'string' ? result.path : ''
  const url = typeof result?.url === 'string' ? result.url : ''
  const mimeType = typeof result?.mimeType === 'string' ? result.mimeType : file.type

  if (!id || !path || !url) {
    throw new CodexApiError('Image upload returned malformed response', {
      code: 'invalid_response',
      method: 'uploads/images',
      status: response.status,
    })
  }

  return { id, name, path, url, mimeType }
}

export async function rollbackWorkspaceFile(cwd: string, filePath: string): Promise<UiToolingRollbackFileResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/rollback-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd,
        filePath,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'File rollback failed before request was sent',
      { code: 'network_error', method: 'tooling/rollback-file' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `File rollback failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/rollback-file',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const checkpoint = asRecord(result?.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const relativePath = typeof result?.relativePath === 'string' ? result.relativePath : ''

  if (!result || !checkpoint || !id || !relativePath) {
    throw new CodexApiError('File rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-file',
      status: response.status,
    })
  }

  return result as UiToolingRollbackFileResult
}

export async function rollbackWorkspaceHunk(
  cwd: string,
  filePath: string,
  hunkIndex: number,
): Promise<UiToolingRollbackHunkResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/rollback-hunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd,
        filePath,
        hunkIndex,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Hunk rollback failed before request was sent',
      { code: 'network_error', method: 'tooling/rollback-hunk' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Hunk rollback failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/rollback-hunk',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const checkpoint = asRecord(result?.checkpoint)
  if (!result || !checkpoint || typeof result.relativePath !== 'string' || typeof result.hunkIndex !== 'number') {
    throw new CodexApiError('Hunk rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-hunk',
      status: response.status,
    })
  }

  return result as UiToolingRollbackHunkResult
}

export async function rollbackWorkspaceChanges(cwd: string): Promise<UiToolingRollbackWorkspaceResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/rollback-workspace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace rollback failed before request was sent',
      { code: 'network_error', method: 'tooling/rollback-workspace' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace rollback failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/rollback-workspace',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const checkpoint = asRecord(result?.checkpoint)
  const status = asRecord(result?.remainingStatus)
  if (!result || !checkpoint || !status || typeof result.rollbackApplied !== 'boolean') {
    throw new CodexApiError('Workspace rollback returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/rollback-workspace',
      status: response.status,
    })
  }

  return result as UiToolingRollbackWorkspaceResult
}

export async function stageWorkspaceHunk(
  cwd: string,
  filePath: string,
  hunkIndex: number,
): Promise<UiToolingStageHunkResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/stage-hunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd,
        filePath,
        hunkIndex,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Hunk stage failed before request was sent',
      { code: 'network_error', method: 'tooling/stage-hunk' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Hunk stage failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/stage-hunk',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const status = asRecord(result?.status)
  if (!result || !status || typeof result.relativePath !== 'string' || typeof result.hunkIndex !== 'number') {
    throw new CodexApiError('Hunk stage returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/stage-hunk',
      status: response.status,
    })
  }

  return result as UiToolingStageHunkResult
}

export async function fetchToolingCheckpoints(cwd: string, limit = 10): Promise<UiToolingCheckpoint[]> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 100))))

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/checkpoints?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Checkpoint list failed before request was sent',
      { code: 'network_error', method: 'tooling/checkpoints' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Checkpoint list failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/checkpoints',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = envelope?.result
  return Array.isArray(result) ? (result as UiToolingCheckpoint[]) : []
}

export async function fetchToolingCheckpointPatch(
  cwd: string,
  checkpointId: string,
): Promise<UiToolingCheckpointPatch> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('checkpointId', checkpointId)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/checkpoint-patch?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Checkpoint patch failed before request was sent',
      { code: 'network_error', method: 'tooling/checkpoint-patch' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Checkpoint patch failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/checkpoint-patch',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const checkpoint = asRecord(result?.checkpoint)
  const id = typeof checkpoint?.id === 'string' ? checkpoint.id : ''
  const patch = typeof result?.patch === 'string' ? result.patch : null

  if (!result || !checkpoint || !id || patch === null) {
    throw new CodexApiError('Checkpoint patch returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/checkpoint-patch',
      status: response.status,
    })
  }

  return result as UiToolingCheckpointPatch
}

export async function fetchWorkspaceAuditEvents(cwd: string, limit = 30): Promise<UiAuditTrail> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 200))))

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/audit-events?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Audit trail request failed before it was sent',
      { code: 'network_error', method: 'tooling/audit-events' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Audit trail request failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/audit-events',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Audit trail returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/audit-events',
      status: response.status,
    })
  }

  return result as UiAuditTrail
}

export async function fetchWorkspaceReviewComments(cwd: string): Promise<UiReviewCommentList> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/review-comments?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Review comments request failed before it was sent',
      { code: 'network_error', method: 'tooling/review-comments' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Review comments request failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/review-comments',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.comments)) {
    throw new CodexApiError('Review comments returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/review-comments',
      status: response.status,
    })
  }

  return result as UiReviewCommentList
}

export async function createWorkspaceReviewComment(
  cwd: string,
  anchor: UiReviewCommentAnchor,
  body: string,
): Promise<UiReviewComment> {
  return postReviewCommentAction<UiReviewComment>('/codex-api/tooling/review-comments', {
    cwd,
    anchor,
    body,
  }, 'tooling/review-comments')
}

export async function updateWorkspaceReviewCommentStatus(
  cwd: string,
  commentId: string,
  status: UiReviewCommentStatus,
): Promise<UiReviewComment> {
  return postReviewCommentAction<UiReviewComment>('/codex-api/tooling/review-comments/status', {
    cwd,
    commentId,
    status,
  }, 'tooling/review-comments/status')
}

export async function createWorkspaceReviewFollowUp(
  cwd: string,
  commentId: string,
): Promise<UiReviewFollowUpResult> {
  return postReviewCommentAction<UiReviewFollowUpResult>('/codex-api/tooling/review-comments/follow-up', {
    cwd,
    commentId,
  }, 'tooling/review-comments/follow-up')
}

async function postReviewCommentAction<T>(
  path: string,
  body: Record<string, unknown>,
  method: string,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Review comment action failed before it was sent',
      { code: 'network_error', method },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Review comment action failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method,
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result) {
    throw new CodexApiError('Review comment action returned malformed response', {
      code: 'invalid_response',
      method,
      status: response.status,
    })
  }
  return result as T
}

export async function fetchCodexSessionEvents(
  cwd: string,
  threadId = '',
  limit = 80,
): Promise<UiCodexSessionEventTrail> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 300))))
  if (threadId.trim()) params.set('threadId', threadId.trim())

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/session-events?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Session replay request failed before it was sent',
      { code: 'network_error', method: 'tooling/session-events' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Session replay request failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/session-events',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Session replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/session-events',
      status: response.status,
    })
  }

  return result as UiCodexSessionEventTrail
}

export async function fetchWorkspaceRecentSessions(
  cwd: string,
  limit = 12,
): Promise<UiWorkspaceSessionSummaryTrail> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 100))))

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/recent-sessions?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Recent sessions request failed before it was sent',
      { code: 'network_error', method: 'tooling/recent-sessions' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Recent sessions request failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/recent-sessions',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.sessions) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Recent sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/recent-sessions',
      status: response.status,
    })
  }

  return result as UiWorkspaceSessionSummaryTrail
}

export async function fetchWorkspaceSnapshot(cwd: string): Promise<UiWorkspaceSnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workspace-snapshot?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace snapshot failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-snapshot' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace snapshot failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-snapshot',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const gitStatus = asRecord(result?.gitStatus)

  if (!result || typeof result.cwd !== 'string' || typeof result.repoRoot !== 'string' || !gitStatus) {
    throw new CodexApiError('Workspace snapshot returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-snapshot',
      status: response.status,
    })
  }

  return result as UiWorkspaceSnapshot
}

export async function fetchWorkspaceSecuritySnapshot(cwd: string): Promise<UiWorkspaceSecuritySnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workspace-security?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace security scan failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-security' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace security scan failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-security',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.findings) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Workspace security scan returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-security',
      status: response.status,
    })
  }

  return result as UiWorkspaceSecuritySnapshot
}

export async function testWorkspaceNotifications(cwd: string): Promise<UiNotificationDeliveryReport> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/notifications/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Notification test failed before request was sent',
      { code: 'network_error', method: 'tooling/notifications:test' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Notification test failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/notifications:test',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.results) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Notification test returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/notifications:test',
      status: response.status,
    })
  }

  return result as UiNotificationDeliveryReport
}

export async function fetchWorkspaceDiff(cwd: string): Promise<UiToolingDiffSnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/diff?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace diff failed before request was sent',
      { code: 'network_error', method: 'tooling/diff' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(extractErrorMessage(payload, `Workspace diff failed with HTTP ${response.status}`), {
      code: 'http_error',
      method: 'tooling/diff',
      status: response.status,
    })
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (
    !result ||
    typeof result.cwd !== 'string' ||
    typeof result.repoRoot !== 'string' ||
    typeof result.status !== 'string' ||
    typeof result.patch !== 'string'
  ) {
    throw new CodexApiError('Workspace diff returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/diff',
      status: response.status,
    })
  }

  return result as UiToolingDiffSnapshot
}

export async function fetchDefaultWorkspace(): Promise<UiDefaultWorkspace> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/default-workspace')
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Default workspace failed before request was sent',
      { code: 'network_error', method: 'tooling/default-workspace' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Default workspace failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/default-workspace',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.cwd !== 'string') {
    throw new CodexApiError('Default workspace returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/default-workspace',
      status: response.status,
    })
  }

  return result as UiDefaultWorkspace
}

export async function fetchGitStatus(cwd: string): Promise<UiGitStatusSnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/git-status?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Git status failed before request was sent',
      { code: 'network_error', method: 'tooling/git-status' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Git status failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/git-status',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.repoRoot !== 'string' || !Array.isArray(result.files)) {
    throw new CodexApiError('Git status returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-status',
      status: response.status,
    })
  }

  return result as UiGitStatusSnapshot
}

export async function fetchGitDeliveryDraft(cwd: string): Promise<UiGitDeliveryDraft> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/git-delivery-draft?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Git delivery draft failed before request was sent',
      { code: 'network_error', method: 'tooling/git-delivery-draft' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Git delivery draft failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/git-delivery-draft',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.commitMessage !== 'string' || typeof result.prBody !== 'string') {
    throw new CodexApiError('Git delivery draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-delivery-draft',
      status: response.status,
    })
  }

  return result as UiGitDeliveryDraft
}

export async function fetchWorkspaceReviewDraft(cwd: string): Promise<UiWorkspaceReviewDraft> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/review-draft?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace review draft failed before request was sent',
      { code: 'network_error', method: 'tooling/review-draft' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace review draft failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/review-draft',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (
    !result ||
    typeof result.commitMessage !== 'string' ||
    typeof result.prBody !== 'string' ||
    typeof result.hasReviewChanges !== 'boolean' ||
    !Array.isArray(result.riskSummary) ||
    !Array.isArray(result.validationPlan) ||
    !Array.isArray(result.untrackedFiles) ||
    !Array.isArray(result.warnings)
  ) {
    throw new CodexApiError('Workspace review draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/review-draft',
      status: response.status,
    })
  }

  return result as UiWorkspaceReviewDraft
}

export async function commitStagedChanges(cwd: string, commitMessage: string): Promise<UiGitCommitResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/git-commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd,
        commitMessage,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Git commit failed before request was sent',
      { code: 'network_error', method: 'tooling/git-commit' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Git commit failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/git-commit',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const status = asRecord(result?.status)
  if (!result || !status || typeof result.commitHash !== 'string' || typeof result.commitMessage !== 'string') {
    throw new CodexApiError('Git commit returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/git-commit',
      status: response.status,
    })
  }

  return result as UiGitCommitResult
}

export async function fetchPullRequestDraft(cwd: string, baseBranch?: string): Promise<UiPullRequestDraft> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  if (baseBranch?.trim()) params.set('baseBranch', baseBranch.trim())

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/pull-request-draft?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Pull request draft failed before request was sent',
      { code: 'network_error', method: 'tooling/pull-request-draft' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pull request draft failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/pull-request-draft',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.title !== 'string' || typeof result.body !== 'string' || !Array.isArray(result.files)) {
    throw new CodexApiError('Pull request draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/pull-request-draft',
      status: response.status,
    })
  }

  return result as UiPullRequestDraft
}

export async function createPullRequest(params: {
  cwd: string
  title: string
  body: string
  baseBranch: string
  draft: boolean
  dryRun: boolean
}): Promise<UiPullRequestCreateResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/pull-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Pull request create failed before request was sent',
      { code: 'network_error', method: 'tooling/pull-request' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Pull request create failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/pull-request',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.title !== 'string' || !Array.isArray(result.command) || typeof result.dryRun !== 'boolean') {
    throw new CodexApiError('Pull request create returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/pull-request',
      status: response.status,
    })
  }

  return result as UiPullRequestCreateResult
}

export async function fetchWorkspaceWorktrees(cwd: string): Promise<UiWorktreeSnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/worktrees?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Worktrees failed before request was sent',
      { code: 'network_error', method: 'tooling/worktrees' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Worktrees failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/worktrees',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.repoRoot !== 'string' || !Array.isArray(result.worktrees)) {
    throw new CodexApiError('Worktrees returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees',
      status: response.status,
    })
  }

  return result as UiWorktreeSnapshot
}

export async function createWorkspaceWorktree(
  cwd: string,
  branchName: string,
  baseRef: string,
): Promise<UiWorktreeCreateResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/worktrees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, branchName, baseRef }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Create worktree failed before request was sent',
      { code: 'network_error', method: 'tooling/worktrees:create' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Create worktree failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/worktrees:create',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const snapshot = asRecord(result?.snapshot)
  if (!result || !snapshot || !Array.isArray(snapshot.worktrees)) {
    throw new CodexApiError('Create worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:create',
      status: response.status,
    })
  }

  return result as UiWorktreeCreateResult
}

export async function removeWorkspaceWorktree(cwd: string, path: string): Promise<UiWorktreeRemoveResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/worktrees/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, path }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Remove worktree failed before request was sent',
      { code: 'network_error', method: 'tooling/worktrees:remove' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Remove worktree failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/worktrees:remove',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const snapshot = asRecord(result?.snapshot)
  if (!result || typeof result.removedPath !== 'string' || !snapshot || !Array.isArray(snapshot.worktrees)) {
    throw new CodexApiError('Remove worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:remove',
      status: response.status,
    })
  }

  return result as UiWorktreeRemoveResult
}

export async function applyWorkspacePatchToWorktree(cwd: string, path: string): Promise<UiWorktreeApplyPatchResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/worktrees/apply-patch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, path }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Apply patch to worktree failed before request was sent',
      { code: 'network_error', method: 'tooling/worktrees:apply-patch' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Apply patch to worktree failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/worktrees:apply-patch',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const snapshot = asRecord(result?.snapshot)
  const targetStatus = asRecord(result?.targetStatus)
  if (!result || !snapshot || !Array.isArray(snapshot.worktrees) || !targetStatus || !Array.isArray(targetStatus.files)) {
    throw new CodexApiError('Apply patch to worktree returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/worktrees:apply-patch',
      status: response.status,
    })
  }

  return result as UiWorktreeApplyPatchResult
}

export async function fetchWorkspacePorts(cwd: string): Promise<UiPortsSnapshot> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/ports?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Ports snapshot failed before request was sent',
      { code: 'network_error', method: 'tooling/ports' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Ports snapshot failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/ports',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.ports)) {
    throw new CodexApiError('Ports snapshot returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/ports',
      status: response.status,
    })
  }

  return result as UiPortsSnapshot
}

export async function probeWorkspacePreview(cwd: string, url: string): Promise<UiPreviewProbe> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/preview-probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, url }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Preview probe failed before request was sent',
      { code: 'network_error', method: 'tooling/preview-probe' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Preview probe failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/preview-probe',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.url !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Preview probe returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/preview-probe',
      status: response.status,
    })
  }

  return result as UiPreviewProbe
}

export async function captureWorkspacePreviewScreenshot(
  cwd: string,
  url: string,
  options: { width?: number; height?: number } = {},
): Promise<UiPreviewScreenshot> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/preview-screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cwd,
        url,
        width: options.width,
        height: options.height,
      }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Preview screenshot failed before request was sent',
      { code: 'network_error', method: 'tooling/preview-screenshot' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Preview screenshot failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/preview-screenshot',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.url !== 'string' || typeof result.dataUrl !== 'string' || typeof result.source !== 'string') {
    throw new CodexApiError('Preview screenshot returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/preview-screenshot',
      status: response.status,
    })
  }

  return result as UiPreviewScreenshot
}

export async function fetchTerminalSessions(cwd: string): Promise<UiTerminalSessionList> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/terminal-sessions?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Terminal sessions failed before request was sent',
      { code: 'network_error', method: 'tooling/terminal-sessions' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Terminal sessions failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/terminal-sessions',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.sessions)) {
    throw new CodexApiError('Terminal sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions',
      status: response.status,
    })
  }

  return result as UiTerminalSessionList
}

export async function fetchWorkspaceValidationRuns(cwd: string, limit = 10): Promise<UiWorkspaceValidationRunHistory> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 50))))

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/validation-runs?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Validation runs failed before request was sent',
      { code: 'network_error', method: 'tooling/validation-runs' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Validation runs failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/validation-runs',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.runs) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Validation runs returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/validation-runs',
      status: response.status,
    })
  }

  return result as UiWorkspaceValidationRunHistory
}

export async function fetchWorkspaceWorkflows(cwd: string, limit = 20): Promise<UiWorkflowDashboard> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('limit', String(Math.max(1, Math.min(limit, 100))))

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workflows?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow dashboard failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow dashboard failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.templates) || !Array.isArray(result.runs)) {
    throw new CodexApiError('Workflow dashboard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows',
      status: response.status,
    })
  }

  return result as UiWorkflowDashboard
}

export async function fetchWorkspaceWorkflowReplay(cwd: string, runId: string): Promise<UiWorkflowReplay> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('runId', runId)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workflows/replay?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow replay failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/replay' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow replay failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/replay',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || !Array.isArray(result.events) || !Array.isArray(result.agentSnapshots)) {
    throw new CodexApiError('Workflow replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/replay',
      status: response.status,
    })
  }

  return result as UiWorkflowReplay
}

export async function fetchWorkspaceWorkflowDeliveryDraft(cwd: string, runId: string): Promise<UiWorkflowDeliveryDraft> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('runId', runId)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workflows/delivery-draft?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow delivery draft failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/delivery-draft' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow delivery draft failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/delivery-draft',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.title !== 'string' || typeof result.body !== 'string' || typeof result.commitMessage !== 'string') {
    throw new CodexApiError('Workflow delivery draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/delivery-draft',
      status: response.status,
    })
  }

  return result as UiWorkflowDeliveryDraft
}

export async function markWorkspaceWorkflowReadyToMerge(
  cwd: string,
  runId: string,
  note = '',
): Promise<UiWorkflowDeliveryStatusResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/ready-to-merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, note }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow ready-to-merge failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/ready-to-merge' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow ready-to-merge failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/ready-to-merge',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const run = asRecord(result?.run)
  const deliveryState = asRecord(result?.deliveryState)
  if (!result || !run || typeof run.id !== 'string' || !deliveryState) {
    throw new CodexApiError('Workflow ready-to-merge returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/ready-to-merge',
      status: response.status,
    })
  }

  return result as UiWorkflowDeliveryStatusResult
}

export async function markWorkspaceWorkflowMerged(params: {
  cwd: string
  runId: string
  commitHash?: string
  pullRequestUrl?: string
  note?: string
}): Promise<UiWorkflowDeliveryStatusResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/merged', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow merged failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/merged' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow merged failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/merged',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const run = asRecord(result?.run)
  const deliveryState = asRecord(result?.deliveryState)
  if (!result || !run || typeof run.id !== 'string' || !deliveryState) {
    throw new CodexApiError('Workflow merged returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/merged',
      status: response.status,
    })
  }

  return result as UiWorkflowDeliveryStatusResult
}

export async function createWorkspaceWorkflowRun(
  cwd: string,
  templateId: string,
  goal: string,
): Promise<UiWorkflowRun> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, templateId, goal }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow creation failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows:create' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow creation failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows:create',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow creation returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows:create',
      status: response.status,
    })
  }

  return result as UiWorkflowRun
}

export async function updateWorkspaceWorkflowAgentStatus(
  cwd: string,
  runId: string,
  agentId: string,
  status: UiWorkflowRun['agents'][number]['status'],
  note = '',
): Promise<UiWorkflowRun> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/agent-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, agentId, status, note }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow status update failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/agent-status' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow status update failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/agent-status',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow status update returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/agent-status',
      status: response.status,
    })
  }

  return result as UiWorkflowRun
}

export async function provisionWorkspaceWorkflowAgentWorktree(
  cwd: string,
  runId: string,
  agentId: string,
  baseRef = '',
): Promise<UiWorkflowRun> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/agent-worktree', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, agentId, baseRef }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow worktree provisioning failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/agent-worktree' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow worktree provisioning failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/agent-worktree',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError('Workflow worktree provisioning returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/agent-worktree',
      status: response.status,
    })
  }

  return result as UiWorkflowRun
}

export async function applyWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
): Promise<UiWorkflowImplementationApplyResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/apply-implementation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, agentId }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow implementation apply failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/apply-implementation' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow implementation apply failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/apply-implementation',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const run = asRecord(result?.run)
  const appliedImplementation = asRecord(result?.appliedImplementation)
  const targetStatus = asRecord(result?.targetStatus)
  if (
    !result ||
    !run ||
    typeof run.id !== 'string' ||
    !appliedImplementation ||
    typeof appliedImplementation.agentId !== 'string' ||
    !targetStatus ||
    !Array.isArray(targetStatus.files)
  ) {
    throw new CodexApiError('Workflow implementation apply returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/apply-implementation',
      status: response.status,
    })
  }

  return result as UiWorkflowImplementationApplyResult
}

export async function discardWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
  reason = '',
): Promise<UiWorkflowImplementationDiscardResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/discard-implementation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, agentId, reason }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow implementation discard failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/discard-implementation' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow implementation discard failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/discard-implementation',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const run = asRecord(result?.run)
  const discardedImplementation = asRecord(result?.discardedImplementation)
  if (
    !result ||
    !run ||
    typeof run.id !== 'string' ||
    !discardedImplementation ||
    typeof discardedImplementation.agentId !== 'string'
  ) {
    throw new CodexApiError('Workflow implementation discard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/discard-implementation',
      status: response.status,
    })
  }

  return result as UiWorkflowImplementationDiscardResult
}

export async function runWorkspaceWorkflowValidation(
  cwd: string,
  runId: string,
  scriptName: string,
): Promise<UiWorkflowValidationResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workflows/validation-run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, runId, scriptName }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workflow validation failed before request was sent',
      { code: 'network_error', method: 'tooling/workflows/validation-run' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workflow validation failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workflows/validation-run',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const run = asRecord(result?.run)
  const validationRun = asRecord(result?.validationRun)
  const replay = asRecord(result?.replay)
  if (!result || !run || !validationRun || !replay || typeof run.id !== 'string' || typeof validationRun.command !== 'string') {
    throw new CodexApiError('Workflow validation returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/validation-run',
      status: response.status,
    })
  }

  return result as UiWorkflowValidationResult
}

export async function startTerminalSession(cwd: string, scriptName: string): Promise<UiTerminalSession> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/terminal-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, scriptName }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Terminal session start failed before request was sent',
      { code: 'network_error', method: 'tooling/terminal-sessions:start' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Terminal session start failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/terminal-sessions:start',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.id !== 'string' || typeof result.output !== 'string') {
    throw new CodexApiError('Terminal session start returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:start',
      status: response.status,
    })
  }

  return result as UiTerminalSession
}

export async function stopTerminalSession(cwd: string, sessionId: string): Promise<UiTerminalSession> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/terminal-sessions/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, sessionId }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Terminal session stop failed before request was sent',
      { code: 'network_error', method: 'tooling/terminal-sessions:stop' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Terminal session stop failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/terminal-sessions:stop',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.id !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Terminal session stop returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:stop',
      status: response.status,
    })
  }

  return result as UiTerminalSession
}

async function runGitPathAction(
  endpoint: 'git-stage' | 'git-unstage',
  cwd: string,
  paths: string[],
): Promise<UiGitPathActionResult> {
  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, paths }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Git action failed before request was sent',
      { code: 'network_error', method: `tooling/${endpoint}` },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Git action failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: `tooling/${endpoint}`,
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const status = asRecord(result?.status)
  if (!result || !status || !Array.isArray(result.paths) || !Array.isArray(status.files)) {
    throw new CodexApiError('Git action returned malformed response', {
      code: 'invalid_response',
      method: `tooling/${endpoint}`,
      status: response.status,
    })
  }

  return result as UiGitPathActionResult
}

export async function stageGitPaths(cwd: string, paths: string[]): Promise<UiGitPathActionResult> {
  return runGitPathAction('git-stage', cwd, paths)
}

export async function unstageGitPaths(cwd: string, paths: string[]): Promise<UiGitPathActionResult> {
  return runGitPathAction('git-unstage', cwd, paths)
}

export async function fetchWorkspaceFiles(cwd: string, path = ''): Promise<UiWorkspaceFileList> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  if (path) params.set('path', path)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workspace-files?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace files failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-files' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace files failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-files',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.root !== 'string' || !Array.isArray(result.entries)) {
    throw new CodexApiError('Workspace files returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-files',
      status: response.status,
    })
  }

  return result as UiWorkspaceFileList
}

export async function fetchWorkspaceFile(cwd: string, path: string): Promise<UiWorkspaceFileContent> {
  const params = new URLSearchParams()
  params.set('cwd', cwd)
  params.set('path', path)

  let response: Response
  try {
    response = await fetch(`/codex-api/tooling/workspace-file?${params.toString()}`)
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace file failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-file' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace file failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-file',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.path !== 'string' || typeof result.content !== 'string') {
    throw new CodexApiError('Workspace file returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-file',
      status: response.status,
    })
  }

  return result as UiWorkspaceFileContent
}

export async function saveWorkspaceFile(
  cwd: string,
  path: string,
  content: string,
): Promise<UiWorkspaceFileWriteResult> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workspace-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, path, content }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace file save failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-file:write' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace file save failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-file:write',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  const file = asRecord(result?.file)
  const checkpoint = asRecord(result?.checkpoint)
  if (!result || !file || !checkpoint || typeof file.path !== 'string' || typeof checkpoint.id !== 'string') {
    throw new CodexApiError('Workspace file save returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-file:write',
      status: response.status,
    })
  }

  return result as UiWorkspaceFileWriteResult
}

export async function runWorkspaceScript(cwd: string, scriptName: string): Promise<UiWorkspaceScriptRun> {
  let response: Response
  try {
    response = await fetch('/codex-api/tooling/workspace-script/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd, scriptName }),
    })
  } catch (error) {
    throw new CodexApiError(
      error instanceof Error ? error.message : 'Workspace script failed before request was sent',
      { code: 'network_error', method: 'tooling/workspace-script/run' },
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(
      extractErrorMessage(payload, `Workspace script failed with HTTP ${response.status}`),
      {
        code: 'http_error',
        method: 'tooling/workspace-script/run',
        status: response.status,
      },
    )
  }

  const envelope = asRecord(payload)
  const result = asRecord(envelope?.result)
  if (!result || typeof result.scriptName !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Workspace script returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-script/run',
      status: response.status,
    })
  }

  return result as UiWorkspaceScriptRun
}
