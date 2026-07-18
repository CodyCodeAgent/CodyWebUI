import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeishuCard } from './feishuCards'
import {
  FeishuBotService,
  type FeishuBotDefinition,
  type FeishuBotStorePort,
  type FeishuPendingInbound,
  type FeishuRuntimeUpdate,
  type FeishuSessionBinding,
  type FeishuTransport,
  type FeishuTransportHandlers,
} from './feishuBotService'
import {
  createFeishuTurn,
  findFeishuCard,
  listFeishuCards,
  listFeishuTurns,
  updateFeishuTurn,
  upsertFeishuBot,
  upsertFeishuCard,
} from './feishuBotStore'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cody-feishu-lifecycle-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
  await upsertFeishuBot({ id: 'bot-life', name: 'Life', appId: 'cli_life', appSecret: 'secret', enabled: true })
})

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await rm(tempDir, { recursive: true, force: true })
})

const bot: FeishuBotDefinition = {
  botId: 'bot-life', appId: 'cli_life', appSecret: 'secret', enabled: true,
  allowAllUsers: true, allowedOpenIds: [], botOpenId: 'ou_bot',
  groupMentionMode: 'bound',
}

const binding: FeishuSessionBinding = {
  botId: bot.botId,
  bindingKey: `${bot.botId}:group:chat:chat`,
  chatId: 'chat', rootId: '', chatType: 'group', senderOpenId: 'ou_user',
  projectKey: '/repo', projectLabel: 'Repo', cwd: '/repo',
  threadId: 'thread-shared', threadTitle: 'Shared',
}

function inbound(sequence: number): Record<string, unknown> {
  return {
    event_id: `event-${String(sequence)}`,
    message: {
      message_id: `message-${String(sequence)}`, chat_id: 'chat', chat_type: 'group', message_type: 'text',
      content: JSON.stringify({ text: `task ${String(sequence)}` }), mentions: [],
    },
    sender: { sender_type: 'user', sender_id: { open_id: 'ou_user' } },
  }
}

class Store implements FeishuBotStorePort {
  seen = new Set<string>()
  async listBots() { return [bot] }
  async updateRuntime(_botId: string, _update: FeishuRuntimeUpdate) {}
  async claimEvent(_botId: string, key: string) { if (this.seen.has(key)) return false; this.seen.add(key); return true }
  async completeEvent() {}
  async failEvent() {}
  async findBinding() { return binding }
  async listBindings() { return [binding] }
  async upsertBinding() {}
  async touchBinding() {}
  async deleteBinding() {}
  async savePendingMessage(_message: FeishuPendingInbound) {}
  async peekPendingMessage() { return null }
  async deletePendingMessage() {}
  async claimPendingMessage() { return null }
  async releasePendingMessageClaim() {}
}

class Transport implements FeishuTransport {
  handlers: FeishuTransportHandlers | null = null
  cardSequence = 0
  async start(handlers: FeishuTransportHandlers) { this.handlers = handlers; handlers.onState('connected') }
  close() {}
  getState() { return 'connected' as const }
  async getChatMode() { return 'group' as const }
  async sendText() { return 'text' }
  async replyText() { return 'reply' }
  async sendCard() { return `card-${String(++this.cardSequence)}` }
  async sendUserCard() { return `card-${String(++this.cardSequence)}` }
  async replyCard(_messageId: string, _card: FeishuCard) { return `card-${String(++this.cardSequence)}` }
  async updateCard() {}
}

const lifecycle = {
  createTurn: createFeishuTurn,
  updateTurn: updateFeishuTurn,
  listTurns: listFeishuTurns,
  upsertCard: upsertFeishuCard,
  findCard: findFeishuCard,
  listCards: listFeishuCards,
}

function makeService(
  store: Store,
  transport: Transport,
  startTurn: (input: never) => Promise<{ turnId: string }>,
  isThreadBusy: () => Promise<boolean> = async () => false,
  readTurnState?: () => Promise<{ status: 'running' | 'completed' | 'failed' | 'cancelled' | 'missing'; responseText?: string }>,
  resolveApproval?: (input: { requestId: string; decision: string; scope: string }) => Promise<void>,
  requestPending = true,
) {
  return new FeishuBotService({
    store,
    catalog: { listProjects: async () => [], startSession: async () => ({ threadId: '', title: '' }) },
    turns: { startTurn, isThreadBusy, ...(readTurnState ? { readTurnState } : {}) },
    lifecycle,
    serverRequests: { isPending: async () => requestPending, respond: async () => undefined },
    ...(resolveApproval ? { approvals: { resolve: resolveApproval } } : {}),
    transportFactory: () => transport,
    schedule: (work) => work(),
    reconnectCheckMs: 1_000_000,
    streamPatchMs: 1,
  })
}

describe('Feishu durable turn/card lifecycle', () => {
  it('restores a running turn and FIFO queued turn, then continues from notifications', async () => {
    const store = new Store()
    let turnNumber = 0
    const startTurn = vi.fn(async () => ({ turnId: `turn-${String(++turnNumber)}` }))
    const firstTransport = new Transport()
    const first = makeService(store, firstTransport, startTurn as never)
    await first.start()
    firstTransport.handlers?.onMessage(inbound(1))
    firstTransport.handlers?.onMessage(inbound(2))

    await vi.waitFor(async () => {
      const turns = await listFeishuTurns({ botId: bot.botId })
      expect(turns.map((turn) => turn.status).sort()).toEqual(['queued', 'running'])
    })
    expect(startTurn).toHaveBeenCalledOnce()
    await first.stop()

    const secondTransport = new Transport()
    const second = makeService(store, secondTransport, startTurn as never)
    await second.start()
    expect(startTurn).toHaveBeenCalledOnce()

    second.handleAppServerNotification({
      method: 'item/agentMessage/delta', params: { threadId: binding.threadId, turnId: 'turn-1', delta: 'done' },
    })
    second.handleAppServerNotification({
      method: 'turn/completed', params: { threadId: binding.threadId, turnId: 'turn-1', turn: { id: 'turn-1' } },
    })
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2))

    const turns = await listFeishuTurns({ botId: bot.botId })
    expect(turns.find((turn) => turn.turnId === 'turn-1')).toMatchObject({ status: 'completed', responseText: 'done' })
    expect(turns.find((turn) => turn.turnId === 'turn-2')).toMatchObject({ status: 'running' })
    const cards = await listFeishuCards({ botId: bot.botId })
    const terminal = cards.find((card) => card.status === 'completed')
    expect(terminal?.version).toBeGreaterThan(1)
    await second.stop()
  })

  it('queues behind a Web-origin turn and starts once after its terminal notification', async () => {
    const store = new Store()
    let webBusy = true
    const startTurn = vi.fn(async () => ({ turnId: 'feishu-turn' }))
    const transport = new Transport()
    const service = makeService(store, transport, startTurn as never, async () => webBusy)
    await service.start()
    transport.handlers?.onMessage(inbound(1))
    await vi.waitFor(async () => expect(await listFeishuTurns({ botId: bot.botId })).toHaveLength(1))
    expect(startTurn).not.toHaveBeenCalled()
    expect((await listFeishuTurns({ botId: bot.botId }))[0]?.status).toBe('queued')

    webBusy = false
    service.handleAppServerNotification({
      method: 'turn/completed', params: { threadId: binding.threadId, turnId: 'web-turn' },
    })
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce())
    expect((await listFeishuTurns({ botId: bot.botId }))[0]).toMatchObject({ status: 'running', turnId: 'feishu-turn' })
    await service.stop()
  })

  it('reconciles a turn that completed while offline and drains its durable queue', async () => {
    const store = new Store()
    let turnNumber = 0
    const startTurn = vi.fn(async () => ({ turnId: `turn-${String(++turnNumber)}` }))
    const firstTransport = new Transport()
    const first = makeService(store, firstTransport, startTurn as never)
    await first.start()
    firstTransport.handlers?.onMessage(inbound(1))
    firstTransport.handlers?.onMessage(inbound(2))
    await vi.waitFor(async () => {
      expect(startTurn).toHaveBeenCalledOnce()
      expect((await listFeishuTurns({ botId: bot.botId })).map((turn) => turn.status).sort()).toEqual(['queued', 'running'])
    })
    await first.stop()

    const second = makeService(
      store,
      new Transport(),
      startTurn as never,
      async () => false,
      async () => ({ status: 'completed', responseText: 'finished while offline' }),
    )
    await second.start()
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledTimes(2))
    const turns = await listFeishuTurns({ botId: bot.botId })
    expect(turns.find((turn) => turn.turnId === 'turn-1')).toMatchObject({
      status: 'completed', responseText: 'finished while offline',
    })
    expect(turns.find((turn) => turn.turnId === 'turn-2')?.status).toBe('running')
    await second.stop()
  })

  it('restores pending approval ownership from SQLite after restart', async () => {
    await upsertFeishuCard({
      id: 'request:bot-life:42',
      botId: bot.botId,
      bindingKey: binding.bindingKey,
      messageId: 'approval-card',
      purpose: 'approval',
      status: 'streaming',
      version: 1,
      state: {
        requestId: '42', botId: bot.botId, binding, messageId: 'approval-card',
        requesterOpenId: 'ou_user', kind: 'approval', title: 'Approve', summary: 'command',
        questions: [], selections: {},
      },
    })
    const resolve = vi.fn(async () => undefined)
    const service = makeService(
      new Store(), new Transport(), vi.fn(async () => ({ turnId: 'unused' })) as never,
      async () => false, undefined, resolve,
    )
    await service.start()

    await service.handleCardAction(bot.botId, {
      operator: { operator_id: { open_id: 'ou_user' } },
      action: { value: {
        action: 'cody_feishu_approve', request_id: '42', decision: 'accept', scope: 'single',
        requester_open_id: 'ou_attacker_forged',
      } },
    })
    expect(resolve).toHaveBeenCalledOnce()
    await vi.waitFor(async () => expect((await findFeishuCard('request:bot-life:42'))?.status).toBe('completed'))
    await service.stop()
  })

  it('invalidates a persisted request when the app-server no longer owns its id', async () => {
    await upsertFeishuCard({
      id: 'request:bot-life:stale', botId: bot.botId, bindingKey: binding.bindingKey,
      messageId: 'stale-card', purpose: 'approval', status: 'streaming', version: 1,
      state: {
        requestId: '51', botId: bot.botId, binding, messageId: 'stale-card', requesterOpenId: 'ou_user',
        kind: 'approval', title: 'Old approval', summary: 'stale', questions: [], selections: {},
      },
    })
    const service = makeService(
      new Store(), new Transport(), vi.fn(async () => ({ turnId: 'unused' })) as never,
      async () => false, undefined, undefined, false,
    )
    await service.start()
    expect((await findFeishuCard('request:bot-life:stale'))?.status).toBe('failed')
    const response = await service.handleCardAction(bot.botId, {
      operator: { operator_id: { open_id: 'ou_user' } },
      action: { value: { action: 'cody_feishu_approve', request_id: '51', decision: 'accept' } },
    })
    expect(JSON.stringify(response)).toContain('失效')
    await service.stop()
  })
})
