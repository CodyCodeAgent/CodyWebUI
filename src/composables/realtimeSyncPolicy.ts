const LIVE_ONLY_NOTIFICATION_METHODS = new Set([
  'item/agentMessage/delta',
  'item/plan/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta',
  'item/reasoning/summaryPartAdded',
])

export function isLiveOnlyNotificationMethod(method: string): boolean {
  return LIVE_ONLY_NOTIFICATION_METHODS.has(method)
}

export function shouldQueueEventDrivenSyncForMethod(method: string): boolean {
  if (isLiveOnlyNotificationMethod(method)) return false
  return method.startsWith('thread/') || method.startsWith('turn/') || method.startsWith('item/')
}
