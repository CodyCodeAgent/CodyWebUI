import { computed, ref, type Ref } from 'vue'
import type { RpcNotification } from '../api/codexRealtimeClient'
import type { UiServerRequest } from '../types/codex'
import { flattenServerRequests, normalizeServerRequest, readResolvedServerRequestId, removeServerRequestById, selectServerRequestsForThread, upsertServerRequest } from './desktopServerRequests'

export function useServerRequestState(selectedThreadId: Ref<string>) {
  const byThreadId = ref<Record<string, UiServerRequest[]>>({})
  const selected = computed(() => selectServerRequestsForThread(byThreadId.value, selectedThreadId.value))
  const all = computed(() => flattenServerRequests(byThreadId.value))
  function upsert(request: UiServerRequest): void { byThreadId.value = upsertServerRequest(byThreadId.value, request) }
  function remove(requestId: number): void { byThreadId.value = removeServerRequestById(byThreadId.value, requestId) }
  function handle(notification: RpcNotification): boolean {
    if (notification.method === 'server/request') {
      const request = normalizeServerRequest(notification.params)
      if (request) upsert(request)
      return true
    }
    if (notification.method === 'server/request/resolved') {
      const id = readResolvedServerRequestId(notification.params)
      if (id !== null) remove(id)
      return true
    }
    return false
  }
  return { byThreadId, selected, all, upsert, remove, handle }
}
