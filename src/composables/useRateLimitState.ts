import { getAccountRateLimits } from '../api/codexRateLimitClient'
import type { RpcNotification } from '../api/codexRealtimeClient'
import type { UiRateLimitSnapshot } from '../types/codex'
import { readRateLimitSnapshotPayload } from './realtimeNotificationReaders'
import { useAuthoritativeResource } from './useAuthoritativeResource'
import { dataAuthorityPolicy } from './dataAuthorityPolicy'

export function useRateLimitState() {
  const resource = useAuthoritativeResource<UiRateLimitSnapshot | null>(getAccountRateLimits)

  function handleNotification(notification: RpcNotification): boolean {
    if (dataAuthorityPolicy(notification.method)?.realtimeMode !== 'invalidate') return false
    if (!readRateLimitSnapshotPayload(notification)) return false
    resource.invalidate()
    return true
  }

  return {
    rateLimitSnapshot: resource.value,
    isLoadingRateLimits: resource.isLoading,
    rateLimitError: resource.error,
    refreshRateLimits: resource.refresh,
    handleRateLimitNotification: handleNotification,
  }
}
