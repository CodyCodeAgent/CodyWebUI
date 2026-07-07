import { describe, expect, it } from 'vitest'
import {
  GLOBAL_SERVER_REQUEST_SCOPE,
  flattenServerRequests,
  normalizeServerRequest,
  pruneServerRequestsToThreads,
  readResolvedServerRequestId,
  removeServerRequestById,
  selectServerRequestsForThread,
  upsertServerRequest,
} from './desktopServerRequests'
import type { UiServerRequest } from '../types/codex'

function request(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 1,
    method: 'apply_patch',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-07-07T00:00:00.000Z',
    params: { threadId: 'thread-1' },
    ...overrides,
  }
}

describe('desktopServerRequests', () => {
  it('normalizes server requests and falls back to the global scope', () => {
    expect(normalizeServerRequest({
      id: 5,
      method: 'approval',
      params: { turnId: 'turn-1', itemId: 'item-1' },
    }, { receivedAtIso: '2026-07-07T01:00:00.000Z' })).toEqual({
      id: 5,
      method: 'approval',
      threadId: GLOBAL_SERVER_REQUEST_SCOPE,
      turnId: 'turn-1',
      itemId: 'item-1',
      receivedAtIso: '2026-07-07T01:00:00.000Z',
      params: { turnId: 'turn-1', itemId: 'item-1' },
    })

    expect(normalizeServerRequest({ id: 'bad', method: 'approval' })).toBeNull()
    expect(normalizeServerRequest({ id: 1, method: '' })).toBeNull()
  })

  it('reads resolved request ids only when they are integer numbers', () => {
    expect(readResolvedServerRequestId({ id: 42 })).toBe(42)
    expect(readResolvedServerRequestId({ id: 1.5 })).toBeNull()
    expect(readResolvedServerRequestId({ id: '42' })).toBeNull()
  })

  it('upserts requests into thread buckets sorted by receive time', () => {
    const late = request({ id: 2, receivedAtIso: '2026-07-07T02:00:00.000Z' })
    const early = request({ id: 1, receivedAtIso: '2026-07-07T01:00:00.000Z' })

    const afterLate = upsertServerRequest({}, late)
    const afterEarly = upsertServerRequest(afterLate, early)

    expect(afterEarly['thread-1'].map((row) => row.id)).toEqual([1, 2])
    expect(upsertServerRequest(afterEarly, early)).toBe(afterEarly)
  })

  it('removes requests by id and preserves state when nothing changes', () => {
    const state = {
      'thread-1': [request({ id: 1 }), request({ id: 2 })],
      'thread-2': [request({ id: 3, threadId: 'thread-2' })],
    }

    expect(removeServerRequestById(state, 2)).toEqual({
      'thread-1': [state['thread-1'][0]],
      'thread-2': state['thread-2'],
    })
    expect(removeServerRequestById(state, 99)).toBe(state)
  })

  it('prunes thread-scoped requests but keeps global requests', () => {
    const state = {
      [GLOBAL_SERVER_REQUEST_SCOPE]: [request({ id: 1, threadId: GLOBAL_SERVER_REQUEST_SCOPE })],
      'thread-1': [request({ id: 2, threadId: 'thread-1' })],
      'thread-2': [request({ id: 3, threadId: 'thread-2' })],
    }

    expect(pruneServerRequestsToThreads(state, new Set(['thread-2']))).toEqual({
      [GLOBAL_SERVER_REQUEST_SCOPE]: state[GLOBAL_SERVER_REQUEST_SCOPE],
      'thread-2': state['thread-2'],
    })
    expect(pruneServerRequestsToThreads(state, new Set(['thread-1', 'thread-2']))).toBe(state)
  })

  it('selects scoped and global requests in receive-time order', () => {
    const global = request({
      id: 1,
      threadId: GLOBAL_SERVER_REQUEST_SCOPE,
      receivedAtIso: '2026-07-07T02:00:00.000Z',
    })
    const selected = request({
      id: 2,
      threadId: 'thread-1',
      receivedAtIso: '2026-07-07T01:00:00.000Z',
    })
    const other = request({
      id: 3,
      threadId: 'thread-2',
      receivedAtIso: '2026-07-07T00:00:00.000Z',
    })
    const state = {
      [GLOBAL_SERVER_REQUEST_SCOPE]: [global],
      'thread-1': [selected],
      'thread-2': [other],
    }

    expect(selectServerRequestsForThread(state, 'thread-1').map((row) => row.id)).toEqual([2, 1])
    expect(flattenServerRequests(state).map((row) => row.id)).toEqual([3, 2, 1])
  })
})
