import { CodexApiError } from './codexErrors'
import {
  fetchCodexResultRecord,
  queryPath,
} from './codexHttpClient'
import type { UiDailyTokenUsage } from '../types/codex'

export async function fetchDailyTokenUsage(cwd: string, date = new Date()): Promise<UiDailyTokenUsage> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) {
    throw new CodexApiError('cwd is required', {
      code: 'unknown_error',
      method: 'token-usage/today',
    })
  }

  const timezoneOffsetMinutes = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10)
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/token-usage/today', {
    cwd: normalizedCwd,
    date: localDate,
    timezoneOffsetMinutes,
  }), {
    method: 'token-usage/today',
    networkErrorMessage: 'Daily token usage request failed before it was sent',
    httpErrorMessage: 'Daily token usage request failed',
    malformedMessage: 'Daily token usage returned malformed response',
  })

  if (
    typeof result.date !== 'string' ||
    typeof result.totalTokens !== 'number' ||
    typeof result.inputTokens !== 'number' ||
    typeof result.outputTokens !== 'number' ||
    typeof result.tokenUsageEventCount !== 'number'
  ) {
    throw new CodexApiError('Daily token usage returned malformed response', {
      code: 'invalid_response',
      method: 'token-usage/today',
      status,
    })
  }

  return result as UiDailyTokenUsage
}
