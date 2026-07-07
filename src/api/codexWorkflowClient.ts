import type {
  UiWorkflowDashboard,
  UiWorkflowDeliveryDraft,
  UiWorkflowDeliveryStatusResult,
  UiWorkflowImplementationApplyResult,
  UiWorkflowImplementationDiscardResult,
  UiWorkflowReplay,
  UiWorkflowRun,
  UiWorkflowValidationResult,
} from '../types/codex'
import { CodexApiError } from './codexErrors'
import {
  asRecord,
  fetchCodexResultRecord,
  jsonPostInit,
  queryPath,
} from './codexHttpClient'

function assertWorkflowRun(result: Record<string, unknown>, status: number, method: string, message: string): void {
  if (typeof result.id !== 'string' || !Array.isArray(result.agents)) {
    throw new CodexApiError(message, {
      code: 'invalid_response',
      method,
      status,
    })
  }
}

function assertWorkflowDeliveryStatus(
  result: Record<string, unknown>,
  status: number,
  method: string,
  message: string,
): void {
  const run = asRecord(result.run)
  const deliveryState = asRecord(result.deliveryState)
  if (!run || typeof run.id !== 'string' || !deliveryState) {
    throw new CodexApiError(message, {
      code: 'invalid_response',
      method,
      status,
    })
  }
}

export async function fetchWorkspaceWorkflows(cwd: string, limit = 20): Promise<UiWorkflowDashboard> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows', {
    cwd,
    limit: Math.max(1, Math.min(limit, 100)),
  }), {
    method: 'tooling/workflows',
    networkErrorMessage: 'Workflow dashboard failed before request was sent',
    httpErrorMessage: 'Workflow dashboard failed',
    malformedMessage: 'Workflow dashboard returned malformed response',
  })
  if (!Array.isArray(result.templates) || !Array.isArray(result.runs)) {
    throw new CodexApiError('Workflow dashboard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows',
      status,
    })
  }

  return result as UiWorkflowDashboard
}

export async function fetchWorkspaceWorkflowReplay(cwd: string, runId: string): Promise<UiWorkflowReplay> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows/replay', {
    cwd,
    runId,
  }), {
    method: 'tooling/workflows/replay',
    networkErrorMessage: 'Workflow replay failed before request was sent',
    httpErrorMessage: 'Workflow replay failed',
    malformedMessage: 'Workflow replay returned malformed response',
  })
  if (!Array.isArray(result.events) || !Array.isArray(result.agentSnapshots)) {
    throw new CodexApiError('Workflow replay returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/replay',
      status,
    })
  }

  return result as UiWorkflowReplay
}

export async function fetchWorkspaceWorkflowDeliveryDraft(cwd: string, runId: string): Promise<UiWorkflowDeliveryDraft> {
  const { result, status } = await fetchCodexResultRecord(queryPath('/codex-api/tooling/workflows/delivery-draft', {
    cwd,
    runId,
  }), {
    method: 'tooling/workflows/delivery-draft',
    networkErrorMessage: 'Workflow delivery draft failed before request was sent',
    httpErrorMessage: 'Workflow delivery draft failed',
    malformedMessage: 'Workflow delivery draft returned malformed response',
  })
  if (typeof result.title !== 'string' || typeof result.body !== 'string' || typeof result.commitMessage !== 'string') {
    throw new CodexApiError('Workflow delivery draft returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/delivery-draft',
      status,
    })
  }

  return result as UiWorkflowDeliveryDraft
}

export async function markWorkspaceWorkflowReadyToMerge(
  cwd: string,
  runId: string,
  note = '',
): Promise<UiWorkflowDeliveryStatusResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/ready-to-merge', {
    init: jsonPostInit({ cwd, runId, note }),
    method: 'tooling/workflows/ready-to-merge',
    networkErrorMessage: 'Workflow ready-to-merge failed before request was sent',
    httpErrorMessage: 'Workflow ready-to-merge failed',
    malformedMessage: 'Workflow ready-to-merge returned malformed response',
  })
  assertWorkflowDeliveryStatus(
    result,
    status,
    'tooling/workflows/ready-to-merge',
    'Workflow ready-to-merge returned malformed response',
  )

  return result as UiWorkflowDeliveryStatusResult
}

export async function markWorkspaceWorkflowMerged(params: {
  cwd: string
  runId: string
  commitHash?: string
  pullRequestUrl?: string
  note?: string
}): Promise<UiWorkflowDeliveryStatusResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/merged', {
    init: jsonPostInit(params),
    method: 'tooling/workflows/merged',
    networkErrorMessage: 'Workflow merged failed before request was sent',
    httpErrorMessage: 'Workflow merged failed',
    malformedMessage: 'Workflow merged returned malformed response',
  })
  assertWorkflowDeliveryStatus(
    result,
    status,
    'tooling/workflows/merged',
    'Workflow merged returned malformed response',
  )

  return result as UiWorkflowDeliveryStatusResult
}

export async function createWorkspaceWorkflowRun(
  cwd: string,
  templateId: string,
  goal: string,
): Promise<UiWorkflowRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows', {
    init: jsonPostInit({ cwd, templateId, goal }),
    method: 'tooling/workflows:create',
    networkErrorMessage: 'Workflow creation failed before request was sent',
    httpErrorMessage: 'Workflow creation failed',
    malformedMessage: 'Workflow creation returned malformed response',
  })
  assertWorkflowRun(result, status, 'tooling/workflows:create', 'Workflow creation returned malformed response')

  return result as UiWorkflowRun
}

export async function updateWorkspaceWorkflowAgentStatus(
  cwd: string,
  runId: string,
  agentId: string,
  status: UiWorkflowRun['agents'][number]['status'],
  note = '',
): Promise<UiWorkflowRun> {
  const { result, status: responseStatus } = await fetchCodexResultRecord('/codex-api/tooling/workflows/agent-status', {
    init: jsonPostInit({ cwd, runId, agentId, status, note }),
    method: 'tooling/workflows/agent-status',
    networkErrorMessage: 'Workflow status update failed before request was sent',
    httpErrorMessage: 'Workflow status update failed',
    malformedMessage: 'Workflow status update returned malformed response',
  })
  assertWorkflowRun(
    result,
    responseStatus,
    'tooling/workflows/agent-status',
    'Workflow status update returned malformed response',
  )

  return result as UiWorkflowRun
}

export async function provisionWorkspaceWorkflowAgentWorktree(
  cwd: string,
  runId: string,
  agentId: string,
  baseRef = '',
): Promise<UiWorkflowRun> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/agent-worktree', {
    init: jsonPostInit({ cwd, runId, agentId, baseRef }),
    method: 'tooling/workflows/agent-worktree',
    networkErrorMessage: 'Workflow worktree provisioning failed before request was sent',
    httpErrorMessage: 'Workflow worktree provisioning failed',
    malformedMessage: 'Workflow worktree provisioning returned malformed response',
  })
  assertWorkflowRun(
    result,
    status,
    'tooling/workflows/agent-worktree',
    'Workflow worktree provisioning returned malformed response',
  )

  return result as UiWorkflowRun
}

export async function applyWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
): Promise<UiWorkflowImplementationApplyResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/apply-implementation', {
    init: jsonPostInit({ cwd, runId, agentId }),
    method: 'tooling/workflows/apply-implementation',
    networkErrorMessage: 'Workflow implementation apply failed before request was sent',
    httpErrorMessage: 'Workflow implementation apply failed',
    malformedMessage: 'Workflow implementation apply returned malformed response',
  })
  const run = asRecord(result.run)
  const appliedImplementation = asRecord(result.appliedImplementation)
  const targetStatus = asRecord(result.targetStatus)
  if (
    !run ||
    typeof run.id !== 'string' ||
    !appliedImplementation ||
    typeof appliedImplementation.agentId !== 'string' ||
    !targetStatus ||
    !Array.isArray(targetStatus.files)
  ) {
    throw new CodexApiError('Workflow implementation apply returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/apply-implementation',
      status,
    })
  }

  return result as UiWorkflowImplementationApplyResult
}

export async function discardWorkspaceWorkflowImplementation(
  cwd: string,
  runId: string,
  agentId: string,
  reason = '',
): Promise<UiWorkflowImplementationDiscardResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/discard-implementation', {
    init: jsonPostInit({ cwd, runId, agentId, reason }),
    method: 'tooling/workflows/discard-implementation',
    networkErrorMessage: 'Workflow implementation discard failed before request was sent',
    httpErrorMessage: 'Workflow implementation discard failed',
    malformedMessage: 'Workflow implementation discard returned malformed response',
  })
  const run = asRecord(result.run)
  const discardedImplementation = asRecord(result.discardedImplementation)
  if (
    !run ||
    typeof run.id !== 'string' ||
    !discardedImplementation ||
    typeof discardedImplementation.agentId !== 'string'
  ) {
    throw new CodexApiError('Workflow implementation discard returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/discard-implementation',
      status,
    })
  }

  return result as UiWorkflowImplementationDiscardResult
}

export async function runWorkspaceWorkflowValidation(
  cwd: string,
  runId: string,
  scriptName: string,
): Promise<UiWorkflowValidationResult> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/tooling/workflows/validation-run', {
    init: jsonPostInit({ cwd, runId, scriptName }),
    method: 'tooling/workflows/validation-run',
    networkErrorMessage: 'Workflow validation failed before request was sent',
    httpErrorMessage: 'Workflow validation failed',
    malformedMessage: 'Workflow validation returned malformed response',
  })
  const run = asRecord(result.run)
  const validationRun = asRecord(result.validationRun)
  const replay = asRecord(result.replay)
  if (!run || !validationRun || !replay || typeof run.id !== 'string' || typeof validationRun.command !== 'string') {
    throw new CodexApiError('Workflow validation returned malformed response', {
      code: 'invalid_response',
      method: 'tooling/workflows/validation-run',
      status,
    })
  }

  return result as UiWorkflowValidationResult
}
