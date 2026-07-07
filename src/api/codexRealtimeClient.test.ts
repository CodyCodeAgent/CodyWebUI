import { describe, expect, it } from 'vitest'
import {
  bridgeWebSocketUrl,
  createCodexRealtimeClient,
  parseBridgeWebSocketMessage,
} from './codexRealtimeClient'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readonly listeners = new Map<string, Array<(event: any) => void>>()
  readyState = FakeWebSocket.CONNECTING
  closeCount = 0

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 3
  }

  emit(type: string, event: any = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function fakeWindow(protocol = 'http:', host = 'localhost:5173'): Window {
  return {
    location: { protocol, host },
    setTimeout: (() => 1) as Window['setTimeout'],
    clearTimeout: (() => undefined) as Window['clearTimeout'],
  } as unknown as Window
}

describe('codex realtime client', () => {
  it('builds websocket URLs from the current page origin', () => {
    expect(bridgeWebSocketUrl(fakeWindow('http:', '127.0.0.1:5173'))).toBe('ws://127.0.0.1:5173/codex-api/ws')
    expect(bridgeWebSocketUrl(fakeWindow('https:', 'codex.example.com'))).toBe('wss://codex.example.com/codex-api/ws')
  })

  it('parses rpc websocket frames and ignores malformed payloads', () => {
    expect(parseBridgeWebSocketMessage(JSON.stringify({
      type: 'rpc',
      atIso: '2026-07-07T01:00:00.000Z',
      notification: {
        method: 'item/agentMessage/delta',
        params: { delta: 'hello' },
      },
    }), () => 'fallback')).toEqual({
      type: 'rpc',
      notification: {
        method: 'item/agentMessage/delta',
        params: { delta: 'hello' },
        atIso: '2026-07-07T01:00:00.000Z',
      },
    })

    expect(parseBridgeWebSocketMessage('{', () => 'fallback')).toBeNull()
    expect(parseBridgeWebSocketMessage(JSON.stringify({ type: 'ready' }), () => 'fallback')).toBeNull()
  })

  it('parses product websocket frames with safe defaults', () => {
    expect(parseBridgeWebSocketMessage(JSON.stringify({
      type: 'product',
      notification: {
        id: 'n-1',
        kind: 'workflow',
        title: 'Workflow finished',
        summary: '',
        severity: 'success',
      },
    }), () => '2026-07-07T02:00:00.000Z')).toEqual({
      type: 'product',
      notification: {
        id: 'n-1',
        kind: 'workflow',
        title: 'Workflow finished',
        summary: '',
        severity: 'success',
        createdAtIso: '2026-07-07T02:00:00.000Z',
        threadId: '',
        turnId: '',
        method: '',
      },
    })
  })

  it('shares one websocket for rpc and product subscriptions and closes it when idle', () => {
    FakeWebSocket.instances = []
    const receivedRpc: unknown[] = []
    const receivedProduct: unknown[] = []
    const client = createCodexRealtimeClient({
      getWindow: () => fakeWindow(),
      getWebSocket: () => FakeWebSocket,
      nowIso: () => '2026-07-07T03:00:00.000Z',
    })

    const unsubscribeRpc = client.subscribeRpcNotifications((notification) => {
      receivedRpc.push(notification)
    })
    const unsubscribeProduct = client.subscribeProductNotifications((notification) => {
      receivedProduct.push(notification)
    })

    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:5173/codex-api/ws')

    socket.emit('message', {
      data: JSON.stringify({
        type: 'rpc',
        notification: { method: 'turn/started', params: { threadId: 'thread-1' } },
      }),
    })
    socket.emit('message', {
      data: JSON.stringify({
        type: 'product',
        notification: {
          id: 'n-1',
          kind: 'workflow',
          title: 'Workflow done',
          summary: 'ok',
          severity: 'success',
        },
      }),
    })

    expect(receivedRpc).toMatchObject([
      { method: 'turn/started', params: { threadId: 'thread-1' } },
    ])
    expect(receivedProduct).toMatchObject([
      { id: 'n-1', title: 'Workflow done' },
    ])

    unsubscribeRpc()
    expect(socket.closeCount).toBe(0)
    unsubscribeProduct()
    expect(socket.closeCount).toBe(1)
  })
})
