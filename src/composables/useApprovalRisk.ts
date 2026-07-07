import type { UiApprovalDecisionScope, UiServerRequest } from '../types/codex'
import { asRecord, readString as readProtocolString } from '../api/protocolValueReaders'
import {
  COMMAND_APPROVAL_REQUEST_METHOD,
  FILE_CHANGE_APPROVAL_REQUEST_METHOD,
  isApprovalRequestMethod,
  isCommandApprovalRequestMethod,
  isFileChangeApprovalRequestMethod,
} from '../api/codexServerRequestMethods'

export {
  COMMAND_APPROVAL_REQUEST_METHOD,
  FILE_CHANGE_APPROVAL_REQUEST_METHOD,
  isApprovalRequestMethod,
  isCommandApprovalRequestMethod,
  isFileChangeApprovalRequestMethod,
} from '../api/codexServerRequestMethods'

export type UiApprovalRiskLevel = 'low' | 'medium' | 'high'
export type UiApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

export type UiApprovalRiskSummary = {
  title: string
  level: UiApprovalRiskLevel
  description: string
  subject: string
  riskLabels: string[]
  impacts: string[]
  recommendation: string
}

export type UiApprovalScopeOption = {
  scope: UiApprovalDecisionScope
  label: string
  enabled: boolean
  description: string
}

export const APPROVAL_SCOPE_OPTIONS: UiApprovalScopeOption[] = [
  {
    scope: 'single',
    label: 'Once',
    enabled: true,
    description: 'Reply only to this pending request.',
  },
  {
    scope: 'session',
    label: 'Session',
    enabled: true,
    description: 'Allow matching actions for the current Codex session when the app-server supports it.',
  },
  {
    scope: 'workspace',
    label: 'Workspace',
    enabled: true,
    description: 'Persist an exact-match approval grant for this workspace.',
  },
  {
    scope: 'permanent',
    label: 'Permanent',
    enabled: true,
    description: 'Persist an exact-match approval grant across workspaces on this machine.',
  },
]

export function approvalScopeForDecision(decision: UiApprovalDecision): UiApprovalDecisionScope {
  return decision === 'acceptForSession' ? 'session' : 'single'
}

export function approvalDecisionForScope(scope: UiApprovalDecisionScope): UiApprovalDecision {
  return scope === 'session' ? 'acceptForSession' : 'accept'
}

function readString(value: unknown): string {
  return readProtocolString(value).trim()
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function maxRisk(first: UiApprovalRiskLevel, second: UiApprovalRiskLevel): UiApprovalRiskLevel {
  const order: Record<UiApprovalRiskLevel, number> = { low: 0, medium: 1, high: 2 }
  return order[first] >= order[second] ? first : second
}

function commandContains(command: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(command))
}

function commandAbsolutePaths(command: string): string[] {
  const paths = command.match(/(?:^|[\s"'])\/[^\s"'`]+/gu) ?? []
  return paths.map((path) => path.trim().replace(/^["']/u, '').replace(/["']$/u, ''))
}

function commandTouchesPath(command: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(command))
}

function analyzeCommand(command: string): Pick<UiApprovalRiskSummary, 'level' | 'riskLabels' | 'impacts'> {
  const normalized = command.trim()
  let level: UiApprovalRiskLevel = normalized ? 'low' : 'medium'
  const riskLabels: string[] = []
  const impacts: string[] = []

  if (!normalized) {
    riskLabels.push('Unknown command')
    impacts.push('The command text is missing, so the action cannot be inspected before approval.')
    return { level, riskLabels, impacts }
  }

  if (commandContains(normalized, [/\brm\s+(-[^\s]*r|--recursive)\b/u, /\brm\s+(-[^\s]*f|--force)\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push('Deletes files')
    impacts.push('The command may permanently delete files or directories.')
  }

  if (commandContains(normalized, [/\bsudo\b/u, /\bchmod\b/u, /\bchown\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push('Changes permissions')
    impacts.push('The command may alter system permissions or run with elevated privileges.')
  }

  if (commandContains(normalized, [/\b(curl|wget|ssh|scp|rsync|gh|git\s+push)\b/u])) {
    level = maxRisk(level, 'medium')
    riskLabels.push('Network access')
    impacts.push('The command may contact external services or transmit repository data.')
  }

  if (commandContains(normalized, [/\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update)\b/u, /\bpip\s+install\b/u])) {
    level = maxRisk(level, 'medium')
    riskLabels.push('Changes dependencies')
    impacts.push('The command may modify dependencies, lockfiles, or installed packages.')
  }

  if (commandContains(normalized, [/\b(git\s+reset|git\s+clean|git\s+checkout)\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push('May discard work')
    impacts.push('The command can remove or overwrite local changes.')
  }

  if (commandContains(normalized, [/\b(auth|token|secret|password|credential|keychain|ssh-keygen)\b/iu])) {
    level = maxRisk(level, 'high')
    riskLabels.push('Sensitive credentials')
    impacts.push('The command references authentication, secrets, credentials, or keys.')
  }

  if (commandTouchesPath(normalized, [/(^|[\s/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum)\b/iu])) {
    level = maxRisk(level, 'medium')
    riskLabels.push('Modifies lockfile')
    impacts.push('Lockfile changes can alter installed dependency versions.')
  }

  if (commandTouchesPath(normalized, [/(^|\/)(auth|authentication|authorization|permission|permissions|rbac|acl|payment|payments|billing|checkout|stripe|paypal)(\/|\.|-|_)/iu])) {
    level = maxRisk(level, 'high')
    riskLabels.push('High-risk code path')
    impacts.push('The command references authentication, payment, billing, or permission-related paths.')
  }

  return {
    level,
    riskLabels: unique(riskLabels.length > 0 ? riskLabels : ['Command execution']),
    impacts: unique(impacts.length > 0 ? impacts : ['The command will run on this machine in the selected workspace.']),
  }
}

function isOutsideCwd(pathValue: string, cwd: string): boolean {
  if (!pathValue || !cwd) return false
  if (!pathValue.startsWith('/')) return false
  return pathValue !== cwd && !pathValue.startsWith(`${cwd.replace(/\/+$/u, '')}/`)
}

function buildCommandApprovalSummary(request: UiServerRequest): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const command = readString(params?.command)
  const cwd = readString(params?.cwd)
  const reason = readString(params?.reason)
  const proposedAmendment = Array.isArray(params?.proposedExecpolicyAmendment)
    ? params.proposedExecpolicyAmendment.map(readString).filter(Boolean)
    : []
  const commandRisk = analyzeCommand(command)
  let level = commandRisk.level
  const riskLabels = [...commandRisk.riskLabels]
  const impacts = [...commandRisk.impacts]
  const outsidePaths = commandAbsolutePaths(command).filter((path) => isOutsideCwd(path, cwd))

  if (proposedAmendment.length > 0) {
    level = maxRisk(level, 'medium')
    riskLabels.push('Session policy change')
    impacts.push('Accepting for session may allow similar commands without asking again.')
  }

  if (outsidePaths.length > 0) {
    level = maxRisk(level, 'high')
    riskLabels.push('Outside workspace')
    impacts.push(`The command references path(s) outside cwd: ${outsidePaths.slice(0, 3).join(', ')}`)
  }

  if (request.commandPolicy) {
    if (request.commandPolicy.status === 'allowed') {
      riskLabels.push('Allowed by policy')
      impacts.push(request.commandPolicy.reason)
    } else if (request.commandPolicy.status === 'not_configured') {
      level = maxRisk(level, 'medium')
      riskLabels.push('No command policy')
      impacts.push('No .codex-web.yml command allowlist or denylist is configured for this command.')
    } else if (request.commandPolicy.status === 'not_git_workspace') {
      level = maxRisk(level, 'medium')
      riskLabels.push('Policy unavailable')
      impacts.push(request.commandPolicy.reason)
    } else if (request.commandPolicy.status === 'denied') {
      level = maxRisk(level, 'high')
      riskLabels.push('Denied by policy')
      impacts.push(request.commandPolicy.reason)
    }
  }

  return {
    title: 'Command approval',
    level,
    description: reason || 'Codex wants permission to run a local command.',
    subject: command || request.method,
    riskLabels: unique(riskLabels),
    impacts: unique(cwd ? [`cwd: ${cwd}`, ...impacts] : impacts),
    recommendation:
      level === 'high'
        ? 'Review the command carefully. Prefer declining unless the exact effect is expected.'
        : 'Approve only if the command matches the task and workspace you expect.',
  }
}

function buildFileChangeApprovalSummary(request: UiServerRequest): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const grantRoot = readString(params?.grantRoot)
  const reason = readString(params?.reason)
  const cwd = readString(params?.cwd)
  let level: UiApprovalRiskLevel = grantRoot ? 'medium' : 'low'
  const riskLabels = ['File write access']
  const impacts = ['Codex may write files after this approval.']

  if (grantRoot) {
    impacts.unshift(`write root: ${grantRoot}`)
    riskLabels.push('Session write scope')
  }

  if (isOutsideCwd(grantRoot, cwd)) {
    level = 'high'
    riskLabels.push('Outside workspace')
    impacts.push('The requested write root appears to be outside the current workspace.')
  }

  if (request.fileChangePolicy) {
    if (request.fileChangePolicy.status === 'allowed') {
      riskLabels.push('Allowed by file policy')
      impacts.push(request.fileChangePolicy.reason)
    } else {
      level = 'high'
      riskLabels.push('Denied by file policy')
      impacts.push(request.fileChangePolicy.reason)
    }

    if (request.fileChangePolicy.category === 'sensitive') {
      riskLabels.push('Sensitive path')
    }
    if (request.fileChangePolicy.category === 'ignored') {
      riskLabels.push('Ignored path')
    }
    if (request.fileChangePolicy.category === 'read_only') {
      riskLabels.push('Read-only workspace')
    }
  }

  return {
    title: 'File change approval',
    level,
    description: reason || 'Codex wants permission to modify files.',
    subject: grantRoot || 'Workspace file changes',
    riskLabels: unique(riskLabels),
    impacts: unique(impacts),
    recommendation:
      level === 'high'
        ? 'Approve only if writing outside the workspace is intentional.'
        : 'Review the requested write scope before approving for the session.',
  }
}

function buildGenericApprovalSummary(request: UiServerRequest): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const reason = readString(params?.reason)
  const method = request.method.trim()
  const isExternalTool = /\b(mcp|tool)\b/iu.test(method)
  return {
    title: isExternalTool ? 'Tool approval' : 'Manual approval',
    level: isExternalTool ? 'high' : 'medium',
    description: reason || 'Codex is waiting for a user decision.',
    subject: request.method,
    riskLabels: isExternalTool ? ['External tool', 'Manual decision'] : ['Manual decision'],
    impacts: isExternalTool
      ? ['This may call an external or connected tool with access to task context.']
      : ['This action may affect the running task or connected tools.'],
    recommendation: isExternalTool
      ? 'Approve only if the destination tool and data being shared are expected.'
      : 'Review the request details before returning a result.',
  }
}

export function buildApprovalRiskSummary(request: UiServerRequest): UiApprovalRiskSummary {
  if (isCommandApprovalRequestMethod(request.method)) {
    return buildCommandApprovalSummary(request)
  }

  if (isFileChangeApprovalRequestMethod(request.method)) {
    return buildFileChangeApprovalSummary(request)
  }

  return buildGenericApprovalSummary(request)
}
