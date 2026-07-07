import type {
  GetAccountRateLimitsResponse,
  RateLimitSnapshot,
  RateLimitWindow,
} from './appServerDtos'
import { normalizeCodexApiError } from './codexErrors'
import { rpcCall } from './codexRpcClient'
import type {
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../types/codex'

type AccountRateLimitsPayload = GetAccountRateLimitsResponse & {
  rateLimitResetCredits?: {
    availableCount?: number | null
  } | null
}

async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

function normalizeRateLimitWindow(window: RateLimitWindow | null | undefined): UiRateLimitWindow | null {
  if (!window) return null

  return {
    usedPercent: Number.isFinite(window.usedPercent)
      ? Math.min(Math.max(window.usedPercent, 0), 100)
      : 0,
    windowDurationMins: typeof window.windowDurationMins === 'number' ? window.windowDurationMins : null,
    resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt : null,
  }
}

export function normalizeRateLimitSnapshot(
  snapshot: RateLimitSnapshot | null | undefined,
  availableResetCredits: number | null = null,
): UiRateLimitSnapshot | null {
  if (!snapshot) return null

  return {
    limitId: snapshot.limitId ?? '',
    limitName: snapshot.limitName ?? '',
    planType: snapshot.planType ?? '',
    primary: normalizeRateLimitWindow(snapshot.primary),
    secondary: normalizeRateLimitWindow(snapshot.secondary),
    credits: snapshot.credits
      ? {
          hasCredits: snapshot.credits.hasCredits,
          unlimited: snapshot.credits.unlimited,
          balance: snapshot.credits.balance ?? '',
        }
      : null,
    availableResetCredits,
  }
}

function pickPrimaryAccountLimit(payload: AccountRateLimitsPayload): RateLimitSnapshot | null {
  return payload.rateLimitsByLimitId?.codex ?? payload.rateLimits ?? null
}

export async function getAccountRateLimits(): Promise<UiRateLimitSnapshot | null> {
  const payload = await callRpc<AccountRateLimitsPayload>('account/rateLimits/read')
  const resetCredits =
    typeof payload.rateLimitResetCredits?.availableCount === 'number'
      ? payload.rateLimitResetCredits.availableCount
      : null
  return normalizeRateLimitSnapshot(pickPrimaryAccountLimit(payload), resetCredits)
}
