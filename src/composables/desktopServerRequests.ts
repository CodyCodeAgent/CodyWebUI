import type { UiServerRequest } from '../types/codex'
import { asRecord, readString } from '../api/protocolValueReaders'

export const GLOBAL_SERVER_REQUEST_SCOPE = '__global__'

function readProtocolString(record: Record<string, unknown> | null | undefined, camelKey: string, snakeKey: string): string {
  return readString(record?.[camelKey]) || readString(record?.[snakeKey])
}

function areServerRequestsEqual(first: UiServerRequest, second: UiServerRequest): boolean {
  return (
    first.id === second.id &&
    first.method === second.method &&
    first.threadId === second.threadId &&
    first.turnId === second.turnId &&
    first.itemId === second.itemId &&
    first.receivedAtIso === second.receivedAtIso &&
    first.params === second.params
  )
}

export function normalizeServerRequest(
  params: unknown,
  options: { receivedAtIso?: string } = {},
): UiServerRequest | null {
  const row = asRecord(params)
  if (!row) return null

  const id = row.id
  const method = readString(row.method)
  const requestParams = row.params
  if (typeof id !== 'number' || !Number.isInteger(id) || !method) {
    return null
  }

  const requestParamRecord = asRecord(requestParams)
  const threadId = readProtocolString(requestParamRecord, 'threadId', 'thread_id') || GLOBAL_SERVER_REQUEST_SCOPE
  const turnId = readProtocolString(requestParamRecord, 'turnId', 'turn_id')
  const itemId = readProtocolString(requestParamRecord, 'itemId', 'item_id')
  const receivedAtIso = readProtocolString(row, 'receivedAtIso', 'received_at_iso') || options.receivedAtIso || new Date().toISOString()

  return {
    id,
    method,
    threadId,
    turnId,
    itemId,
    receivedAtIso,
    params: requestParams ?? null,
  }
}

export function readResolvedServerRequestId(params: unknown): number | null {
  const row = asRecord(params)
  const id = row?.id ?? row?.requestId ?? row?.request_id
  return typeof id === 'number' && Number.isInteger(id) ? id : null
}

export function upsertServerRequest(
  requestsByThreadId: Record<string, UiServerRequest[]>,
  request: UiServerRequest,
): Record<string, UiServerRequest[]> {
  const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
  const current = requestsByThreadId[threadId] ?? []
  const index = current.findIndex((row) => row.id === request.id)
  const nextRows = [...current]
  if (index >= 0) {
    if (areServerRequestsEqual(current[index], request)) {
      return requestsByThreadId
    }
    nextRows.splice(index, 1, request)
  } else {
    nextRows.push(request)
  }

  return {
    ...requestsByThreadId,
    [threadId]: nextRows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
  }
}

export function removeServerRequestById(
  requestsByThreadId: Record<string, UiServerRequest[]>,
  requestId: number,
): Record<string, UiServerRequest[]> {
  const next: Record<string, UiServerRequest[]> = {}
  let didChange = false
  for (const [threadId, requests] of Object.entries(requestsByThreadId)) {
    const filtered = requests.filter((request) => request.id !== requestId)
    if (filtered.length !== requests.length) {
      didChange = true
    }
    if (filtered.length > 0) {
      next[threadId] = filtered
    }
  }
  return didChange ? next : requestsByThreadId
}

export function pruneServerRequestsToThreads(
  requestsByThreadId: Record<string, UiServerRequest[]>,
  activeThreadIds: Set<string>,
): Record<string, UiServerRequest[]> {
  const next: Record<string, UiServerRequest[]> = {}
  let didChange = false
  for (const [threadId, requests] of Object.entries(requestsByThreadId)) {
    if (threadId === GLOBAL_SERVER_REQUEST_SCOPE || activeThreadIds.has(threadId)) {
      next[threadId] = requests
    } else {
      didChange = true
    }
  }
  return didChange ? next : requestsByThreadId
}

function sortServerRequests(requests: UiServerRequest[]): UiServerRequest[] {
  return requests.slice().sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
}

export function selectServerRequestsForThread(
  requestsByThreadId: Record<string, UiServerRequest[]>,
  threadId: string,
): UiServerRequest[] {
  const rows: UiServerRequest[] = []
  if (threadId && Array.isArray(requestsByThreadId[threadId])) {
    rows.push(...requestsByThreadId[threadId])
  }
  if (Array.isArray(requestsByThreadId[GLOBAL_SERVER_REQUEST_SCOPE])) {
    rows.push(...requestsByThreadId[GLOBAL_SERVER_REQUEST_SCOPE])
  }
  return sortServerRequests(rows)
}

export function flattenServerRequests(
  requestsByThreadId: Record<string, UiServerRequest[]>,
): UiServerRequest[] {
  return sortServerRequests(Object.values(requestsByThreadId).flat())
}
