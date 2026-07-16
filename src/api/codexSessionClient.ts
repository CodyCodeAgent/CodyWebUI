import type {
  UiAuditTrail,
  UiCheckpointHealth,
  UiCodexSessionEventTrail,
  UiNotificationDeliveryReport,
  UiWorkspaceSessionSummaryTrail,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export async function fetchWorkspaceAuditEvents(cwd: string, limit = 30): Promise<UiAuditTrail> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/audit-events', {
    cwd,
    limit: Math.max(1, Math.min(limit, 200)),
  }), {
    method: 'tooling/audit-events',
    networkErrorMessage: 'Audit trail request failed before it was sent',
    httpErrorMessage: 'Audit trail request failed',
    malformedMessage: 'Audit trail returned malformed response',
  })
  if (!Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Audit trail returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/audit-events',
      status,
    })
  }

  return result as UiAuditTrail
}

export async function fetchCheckpointHealth(cwd: string): Promise<UiCheckpointHealth> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/checkpoint-health', { cwd }), {
    method: 'tooling/checkpoint-health',
    networkErrorMessage: 'Checkpoint health request failed before it was sent',
    httpErrorMessage: 'Checkpoint health request failed',
    malformedMessage: 'Checkpoint health returned malformed response',
  })
  if (
    typeof result.status !== 'string' ||
    typeof result.checkpointRoot !== 'string' ||
    !Array.isArray(result.unknownSizeCheckpointIds) ||
    !Array.isArray(result.blockedCheckpointIds)
  ) {
    throw new CodexApiError('Checkpoint health returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/checkpoint-health',
      status,
    })
  }
  return result as UiCheckpointHealth
}

export async function fetchCodexSessionEvents(
  cwd: string,
  threadId = '',
  limit = 80,
): Promise<UiCodexSessionEventTrail> {
  const normalizedThreadId = threadId.trim()
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/session-events', {
    cwd,
    limit: Math.max(1, Math.min(limit, 300)),
    threadId: normalizedThreadId || undefined,
  }), {
    method: 'tooling/session-events',
    networkErrorMessage: 'Session replay request failed before it was sent',
    httpErrorMessage: 'Session replay request failed',
    malformedMessage: 'Session replay returned malformed response',
  })
  if (!Array.isArray(result.events) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Session replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/session-events',
      status,
    })
  }

  return result as UiCodexSessionEventTrail
}

export async function fetchWorkspaceRecentSessions(
  cwd: string,
  limit = 12,
): Promise<UiWorkspaceSessionSummaryTrail> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/recent-sessions', {
    cwd,
    limit: Math.max(1, Math.min(limit, 100)),
  }), {
    method: 'tooling/recent-sessions',
    networkErrorMessage: 'Recent sessions request failed before it was sent',
    httpErrorMessage: 'Recent sessions request failed',
    malformedMessage: 'Recent sessions returned malformed response',
  })
  if (!Array.isArray(result.sessions) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Recent sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/recent-sessions',
      status,
    })
  }

  return result as UiWorkspaceSessionSummaryTrail
}

export async function testWorkspaceNotifications(cwd: string): Promise<UiNotificationDeliveryReport> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/notifications/test', {
    init: jsonPostInit({ cwd }),
    method: 'tooling/notifications:test',
    networkErrorMessage: 'Notification test failed before request was sent',
    httpErrorMessage: 'Notification test failed',
    malformedMessage: 'Notification test returned malformed response',
  })
  if (!Array.isArray(result.results) || typeof result.generatedAtIso !== 'string') {
    throw new CodexApiError('Notification test returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/notifications:test',
      status,
    })
  }

  return result as UiNotificationDeliveryReport
}
