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
  type FeishuTransportState,
  type FeishuTurnPort,
} from './feishuBotService'
import { listFeishuOutbox, retryFeishuOutbox } from './feishuBotStore'
import { FeishuReliableTransport } from './feishuReliableTransport'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cody-feishu-inbound-retry-'))
  process.env.CODY_WEB_UI_SETTINGS_DB = join(tempDir, 'settings.sqlite3')
})

afterEach(async () => {
  delete process.env.CODY_WEB_UI_SETTINGS_DB
  await rm(tempDir, { recursive: true, force: true })
})

const bot: FeishuBotDefinition = {
  botId: 'bot-retry', appId: 'cli_retry', appSecret: 'secret', enabled: true,
  allowedOpenIds: ['ou_user'], botOpenId: 'ou_bot', botName: 'Cody',
}

const binding: FeishuSessionBinding = {
  botId: bot.botId,
  bindingKey: `${bot.botId}:group:chat-1:chat-1`,
  chatId: 'chat-1',
  rootId: '',
  chatType: 'group',
  senderOpenId: 'ou_user',
  projectKey: '/repo',
  projectLabel: 'Repo',
  cwd: '/repo',
  threadId: 'thread-1',
  threadTitle: 'Shared session',
}

function inbound(): Record<string, unknown> {
  return {
    event_id: 'event-retried',
    message: {
      message_id: 'om_inbound',
      chat_id: 'chat-1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '@_user_1 fix it' }),
      mentions: [{ key: '@_user_1', name: 'Cody', id: { open_id: 'ou_bot' } }],
    },
    sender: { sender_type: 'user', sender_id: { open_id: 'ou_user' } },
  }
}

class RetryableEventStore implements FeishuBotStorePort {
  eventState: 'new' | 'processing' | 'failed' | 'processed' = 'new'
  runtime: FeishuRuntimeUpdate[] = []

  async listBots() { return [bot] }
  async updateRuntime(_botId: string, update: FeishuRuntimeUpdate) { this.runtime.push(update) }
  async claimEvent() {
    if (this.eventState === 'processing' || this.eventState === 'processed') return false
    this.eventState = 'processing'
    return true
  }
  async completeEvent() { this.eventState = 'processed' }
  async failEvent() { this.eventState = 'failed' }
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

class FailingCardTransport implements FeishuTransport {
  handlers: FeishuTransportHandlers | null = null
  state: FeishuTransportState = 'idle'
  replyAttempts = 0

  constructor(private failNextReply: boolean) {}

  async start(handlers: FeishuTransportHandlers) {
    this.handlers = handlers
    this.state = 'connected'
    handlers.onState('connected')
  }
  close() { this.state = 'idle' }
  getState() { return this.state }
  async getChatMode() { return 'group' as const }
  async sendText() { return 'text' }
  async replyText() { return 'reply-text' }
  async sendCard() { return 'sent-card' }
  async replyCard(_messageId: string, _card: FeishuCard) {
    this.replyAttempts += 1
    if (this.failNextReply) {
      this.failNextReply = false
      throw new Error('temporary Feishu outage')
    }
    return 'remote-card'
  }
  async updateCard() {}
}

function service(
  store: RetryableEventStore,
  inner: FailingCardTransport,
  startTurn: FeishuTurnPort['startTurn'],
): { service: FeishuBotService; transport: FeishuReliableTransport } {
  const transport = new FeishuReliableTransport(bot, inner, {
    pumpIntervalMs: 60_000,
    logger: { warn: vi.fn(), error: vi.fn() },
  })
  return {
    transport,
    service: new FeishuBotService({
      store,
      catalog: {
        listProjects: async () => [],
        startSession: async () => ({ threadId: 'unused', title: 'unused' }),
      },
      turns: { startTurn },
      transportFactory: () => transport,
      schedule: (work) => work(),
      reconnectCheckMs: 1_000_000,
      streamPatchMs: 1_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }),
  }
}

describe('Feishu inbound retry idempotency', () => {
  it('reuses one outbound operation and starts one Codex turn after a process restart', async () => {
    const store = new RetryableEventStore()
    const startTurn = vi.fn(async () => ({ turnId: 'turn-1' }))
    const firstInner = new FailingCardTransport(true)
    const first = service(store, firstInner, startTurn)
    await first.service.start()

    firstInner.handlers?.onMessage(inbound())
    await vi.waitFor(async () => {
      expect((await listFeishuOutbox({ botId: bot.botId }))[0]?.status).toBe('failed')
    })
    expect(startTurn).not.toHaveBeenCalled()

    // A process shutdown rejects only the live waiter. The durable operation
    // and stable inbound scope survive for the replacement service.
    await first.service.stop()
    await vi.waitFor(() => expect(store.eventState).toBe('failed'))
    const failed = (await listFeishuOutbox({ botId: bot.botId }))[0]!
    await retryFeishuOutbox(failed.id, failed.lastError, '2000-01-01T00:00:00.000Z')

    const secondInner = new FailingCardTransport(false)
    const second = service(store, secondInner, startTurn)
    await second.service.start()
    await second.transport.flush()
    expect(secondInner.replyAttempts).toBe(1)
    expect((await listFeishuOutbox({ botId: bot.botId }))[0]?.status).toBe('sent')

    // Feishu repeats the same event. The scoped dedupe key resolves to the
    // recovered card instead of creating/sending a second logical outbound.
    secondInner.handlers?.onMessage(inbound())
    await vi.waitFor(() => expect(store.eventState).toBe('processed'))
    expect(startTurn).toHaveBeenCalledOnce()
    expect(secondInner.replyAttempts).toBe(1)
    expect(await listFeishuOutbox({ botId: bot.botId })).toHaveLength(1)
    await second.service.stop()
  })
})
