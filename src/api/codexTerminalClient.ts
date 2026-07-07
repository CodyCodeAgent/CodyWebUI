import type {
  UiTerminalSession,
  UiTerminalSessionList,
  UiWorkspaceScriptRun,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

export async function fetchTerminalSessions(cwd: string): Promise<UiTerminalSessionList> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/terminal-sessions', { cwd }), {
    method: 'tooling/terminal-sessions',
    networkErrorMessage: 'Terminal sessions failed before request was sent',
    httpErrorMessage: 'Terminal sessions failed',
    malformedMessage: 'Terminal sessions returned malformed response',
  })
  if (!Array.isArray(result.sessions)) {
    throw new CodexApiError('Terminal sessions returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions',
      status,
    })
  }

  return result as UiTerminalSessionList
}

export async function startTerminalSession(cwd: string, scriptName: string): Promise<UiTerminalSession> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/terminal-sessions', {
    init: jsonPostInit({ cwd, scriptName }),
    method: 'tooling/terminal-sessions:start',
    networkErrorMessage: 'Terminal session start failed before request was sent',
    httpErrorMessage: 'Terminal session start failed',
    malformedMessage: 'Terminal session start returned malformed response',
  })
  if (typeof result.id !== 'string' || typeof result.output !== 'string') {
    throw new CodexApiError('Terminal session start returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:start',
      status,
    })
  }

  return result as UiTerminalSession
}

export async function stopTerminalSession(cwd: string, sessionId: string): Promise<UiTerminalSession> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/terminal-sessions/stop', {
    init: jsonPostInit({ cwd, sessionId }),
    method: 'tooling/terminal-sessions:stop',
    networkErrorMessage: 'Terminal session stop failed before request was sent',
    httpErrorMessage: 'Terminal session stop failed',
    malformedMessage: 'Terminal session stop returned malformed response',
  })
  if (typeof result.id !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Terminal session stop returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/terminal-sessions:stop',
      status,
    })
  }

  return result as UiTerminalSession
}

export async function runWorkspaceScript(cwd: string, scriptName: string): Promise<UiWorkspaceScriptRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workspace-script/run', {
    init: jsonPostInit({ cwd, scriptName }),
    method: 'tooling/workspace-script/run',
    networkErrorMessage: 'Workspace script failed before request was sent',
    httpErrorMessage: 'Workspace script failed',
    malformedMessage: 'Workspace script returned malformed response',
  })
  if (typeof result.scriptName !== 'string' || typeof result.status !== 'string') {
    throw new CodexApiError('Workspace script returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workspace-script/run',
      status,
    })
  }

  return result as UiWorkspaceScriptRun
}
