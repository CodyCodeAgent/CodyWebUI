import { ref } from 'vue'
import { subscribeRpcNotifications, type RpcNotification } from '../api/codexRealtimeClient'
import { loadAutoRefreshEnabled, saveAutoRefreshEnabled } from './desktopStateStorage'

const AUTO_REFRESH_INTERVAL_MS = 4_000

export function useDesktopRealtimeState(input: {
  hydratePreferences: () => Promise<void>
  loadPendingApprovals: () => Promise<void>
  refreshRateLimits: () => Promise<unknown>
  applyNotification: (notification: RpcNotification) => void
  queueNotificationSync: (notification: RpcNotification) => void
  syncThreadStatus: () => Promise<void>
  resetDomainState: () => void
}) {
  const isAutoRefreshEnabled = ref(loadAutoRefreshEnabled())
  const autoRefreshSecondsLeft = ref(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000))
  let stopNotificationStream: (() => void) | null = null
  let refreshTimer: number | null = null
  let countdownTimer: number | null = null

  function stopAutoRefresh(options: { updatePreference?: boolean } = {}): void {
    if (refreshTimer !== null && typeof window !== 'undefined') window.clearInterval(refreshTimer)
    if (countdownTimer !== null && typeof window !== 'undefined') window.clearInterval(countdownTimer)
    refreshTimer = null; countdownTimer = null
    if (options.updatePreference ?? true) { isAutoRefreshEnabled.value = false; saveAutoRefreshEnabled(false) }
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
  }
  function startAutoRefresh(): void {
    if (typeof window === 'undefined' || refreshTimer !== null || countdownTimer !== null) return
    isAutoRefreshEnabled.value = true; saveAutoRefreshEnabled(true)
    autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
    refreshTimer = window.setInterval(() => {
      autoRefreshSecondsLeft.value = Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000)
      void input.syncThreadStatus()
    }, AUTO_REFRESH_INTERVAL_MS)
    countdownTimer = window.setInterval(() => { autoRefreshSecondsLeft.value = Math.max(0, autoRefreshSecondsLeft.value - 1) }, 1_000)
  }
  function toggleAutoRefreshTimer(): void { if (isAutoRefreshEnabled.value) stopAutoRefresh(); else startAutoRefresh() }
  function startRealtimeSync(): void {
    if (typeof window === 'undefined' || stopNotificationStream) return
    void input.hydratePreferences()
    if (isAutoRefreshEnabled.value) startAutoRefresh()
    void input.loadPendingApprovals(); void input.refreshRateLimits()
    stopNotificationStream = subscribeRpcNotifications((notification) => {
      input.applyNotification(notification); input.queueNotificationSync(notification)
    })
  }
  function stopRealtimeSync(): void {
    stopAutoRefresh({ updatePreference: false })
    stopNotificationStream?.(); stopNotificationStream = null
    input.resetDomainState()
  }
  return { isAutoRefreshEnabled, autoRefreshSecondsLeft, toggleAutoRefreshTimer, startRealtimeSync, stopRealtimeSync }
}
