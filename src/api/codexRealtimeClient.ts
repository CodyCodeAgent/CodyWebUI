import { asRecord } from './protocolValueReaders'

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

type ParsedBridgeWebSocketMessage =
  | {
      type: 'rpc'
      notification: RpcNotification
    }
  | {
      type: 'product'
      notification: ProductNotification
    }

type SocketEventMap = {
  open: Event
  message: MessageEvent
  close: CloseEvent
  error: Event
}

type RealtimeSocket = Pick<WebSocket, 'readyState' | 'close'> & {
  addEventListener<K extends keyof SocketEventMap>(
    type: K,
    listener: (event: SocketEventMap[K]) => void,
  ): void
}

type RealtimeSocketConstructor = {
  new(url: string): RealtimeSocket
  readonly OPEN?: number
  readonly CONNECTING?: number
}

type CodexRealtimeClientOptions = {
  getWindow?: () => Window | undefined
  getWebSocket?: () => RealtimeSocketConstructor | undefined
  nowIso?: () => string
}

function defaultNowIso(): string {
  return new Date().toISOString()
}

function defaultWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

function defaultWebSocket(): RealtimeSocketConstructor | undefined {
  return typeof WebSocket === 'undefined' ? undefined : WebSocket
}

export function bridgeWebSocketUrl(windowRef: Pick<Window, 'location'>): string {
  const protocol = windowRef.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${windowRef.location.host}/codex-api/ws`
}

export function normalizeRpcNotification(value: unknown, fallbackAtIso = defaultNowIso()): RpcNotification | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.method !== 'string' || record.method.length === 0) return null

  const atIso = typeof record.atIso === 'string' && record.atIso.length > 0
    ? record.atIso
    : fallbackAtIso

  return {
    method: record.method,
    params: record.params ?? null,
    atIso,
  }
}

export function normalizeProductNotification(
  value: unknown,
  fallbackCreatedAtIso = defaultNowIso(),
): ProductNotification | null {
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
      : fallbackCreatedAtIso,
    threadId: typeof record.threadId === 'string' ? record.threadId : '',
    turnId: typeof record.turnId === 'string' ? record.turnId : '',
    method: typeof record.method === 'string' ? record.method : '',
  }
}

export function parseBridgeWebSocketMessage(
  rawData: MessageEvent['data'],
  nowIso = defaultNowIso,
): ParsedBridgeWebSocketMessage | null {
  try {
    const parsed = JSON.parse(String(rawData)) as BridgeWebSocketMessage
    if (parsed.type === 'rpc') {
      const notification = normalizeRpcNotification({
        ...(asRecord(parsed.notification) ?? {}),
        atIso: parsed.atIso,
      }, nowIso())
      return notification ? { type: 'rpc', notification } : null
    }

    if (parsed.type === 'product') {
      const notification = normalizeProductNotification(parsed.notification, nowIso())
      return notification ? { type: 'product', notification } : null
    }
  } catch {
    return null
  }

  return null
}

export function createCodexRealtimeClient(options: CodexRealtimeClientOptions = {}) {
  const rpcNotificationListeners = new Set<(value: RpcNotification) => void>()
  const productNotificationListeners = new Set<(value: ProductNotification) => void>()
  let bridgeSocket: RealtimeSocket | null = null
  let bridgeSocketReconnectTimer: number | null = null
  let bridgeSocketReconnectDelayMs = 500

  const getWindow = options.getWindow ?? defaultWindow
  const getWebSocket = options.getWebSocket ?? defaultWebSocket
  const nowIso = options.nowIso ?? defaultNowIso

  function hasBridgeSocketListeners(): boolean {
    return rpcNotificationListeners.size > 0 || productNotificationListeners.size > 0
  }

  function clearBridgeSocketReconnect(): void {
    const windowRef = getWindow()
    if (bridgeSocketReconnectTimer === null || !windowRef) return
    windowRef.clearTimeout(bridgeSocketReconnectTimer)
    bridgeSocketReconnectTimer = null
  }

  function scheduleBridgeSocketReconnect(): void {
    const windowRef = getWindow()
    if (!windowRef) return
    if (!hasBridgeSocketListeners()) return
    if (bridgeSocketReconnectTimer !== null) return

    const delayMs = bridgeSocketReconnectDelayMs
    bridgeSocketReconnectDelayMs = Math.min(10_000, bridgeSocketReconnectDelayMs * 1.6)
    bridgeSocketReconnectTimer = windowRef.setTimeout(() => {
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
    const message = parseBridgeWebSocketMessage(rawData, nowIso)
    if (!message) return

    if (message.type === 'rpc') {
      for (const listener of rpcNotificationListeners) {
        listener(message.notification)
      }
      return
    }

    for (const listener of productNotificationListeners) {
      listener(message.notification)
    }
  }

  function ensureBridgeSocket(): void {
    const windowRef = getWindow()
    const WebSocketRef = getWebSocket()
    if (!windowRef || !WebSocketRef) return
    if (!hasBridgeSocketListeners()) return

    const openState = WebSocketRef.OPEN ?? 1
    const connectingState = WebSocketRef.CONNECTING ?? 0
    if (bridgeSocket && (bridgeSocket.readyState === openState || bridgeSocket.readyState === connectingState)) {
      return
    }

    clearBridgeSocketReconnect()
    const socket = new WebSocketRef(bridgeWebSocketUrl(windowRef))
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

  function subscribeRpcNotifications(onNotification: (value: RpcNotification) => void): () => void {
    if (!getWindow() || !getWebSocket()) {
      return () => {}
    }

    rpcNotificationListeners.add(onNotification)
    ensureBridgeSocket()

    return () => {
      rpcNotificationListeners.delete(onNotification)
      closeBridgeSocketIfIdle()
    }
  }

  function subscribeProductNotifications(onNotification: (value: ProductNotification) => void): () => void {
    if (!getWindow() || !getWebSocket()) {
      return () => {}
    }

    productNotificationListeners.add(onNotification)
    ensureBridgeSocket()

    return () => {
      productNotificationListeners.delete(onNotification)
      closeBridgeSocketIfIdle()
    }
  }

  return {
    subscribeProductNotifications,
    subscribeRpcNotifications,
  }
}

const defaultRealtimeClient = createCodexRealtimeClient()

export const subscribeRpcNotifications = defaultRealtimeClient.subscribeRpcNotifications
export const subscribeProductNotifications = defaultRealtimeClient.subscribeProductNotifications
