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

export type ApprovalRiskTranslator = (key: string, replacements?: Record<string, string>) => string

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

const APPROVAL_RISK_MESSAGES: Record<string, string> = {
  'approvalRisk.title.commandApproval': 'Command approval',
  'approvalRisk.title.fileChangeApproval': 'File change approval',
  'approvalRisk.title.toolApproval': 'Tool approval',
  'approvalRisk.title.manualApproval': 'Manual approval',
  'approvalRisk.label.unknownCommand': 'Unknown command',
  'approvalRisk.label.deletesFiles': 'Deletes files',
  'approvalRisk.label.changesPermissions': 'Changes permissions',
  'approvalRisk.label.networkAccess': 'Network access',
  'approvalRisk.label.changesDependencies': 'Changes dependencies',
  'approvalRisk.label.mayDiscardWork': 'May discard work',
  'approvalRisk.label.sensitiveCredentials': 'Sensitive credentials',
  'approvalRisk.label.modifiesLockfile': 'Modifies lockfile',
  'approvalRisk.label.highRiskCodePath': 'High-risk code path',
  'approvalRisk.label.commandExecution': 'Command execution',
  'approvalRisk.label.sessionPolicyChange': 'Session policy change',
  'approvalRisk.label.outsideWorkspace': 'Outside workspace',
  'approvalRisk.label.allowedByPolicy': 'Allowed by policy',
  'approvalRisk.label.noCommandPolicy': 'No command policy',
  'approvalRisk.label.policyUnavailable': 'Policy unavailable',
  'approvalRisk.label.deniedByPolicy': 'Denied by policy',
  'approvalRisk.label.fileWriteAccess': 'File write access',
  'approvalRisk.label.sessionWriteScope': 'Session write scope',
  'approvalRisk.label.allowedByFilePolicy': 'Allowed by file policy',
  'approvalRisk.label.deniedByFilePolicy': 'Denied by file policy',
  'approvalRisk.label.sensitivePath': 'Sensitive path',
  'approvalRisk.label.ignoredPath': 'Ignored path',
  'approvalRisk.label.readOnlyWorkspace': 'Read-only workspace',
  'approvalRisk.label.externalTool': 'External tool',
  'approvalRisk.label.manualDecision': 'Manual decision',
  'approvalRisk.impact.commandMissing': 'The command text is missing, so the action cannot be inspected before approval.',
  'approvalRisk.impact.deletesFiles': 'The command may permanently delete files or directories.',
  'approvalRisk.impact.changesPermissions': 'The command may alter system permissions or run with elevated privileges.',
  'approvalRisk.impact.networkAccess': 'The command may contact external services or transmit repository data.',
  'approvalRisk.impact.changesDependencies': 'The command may modify dependencies, lockfiles, or installed packages.',
  'approvalRisk.impact.mayDiscardWork': 'The command can remove or overwrite local changes.',
  'approvalRisk.impact.sensitiveCredentials': 'The command references authentication, secrets, credentials, or keys.',
  'approvalRisk.impact.modifiesLockfile': 'Lockfile changes can alter installed dependency versions.',
  'approvalRisk.impact.highRiskCodePath': 'The command references authentication, payment, billing, or permission-related paths.',
  'approvalRisk.impact.commandExecution': 'The command will run on this machine in the selected workspace.',
  'approvalRisk.impact.sessionPolicyChange': 'Accepting for session may allow similar commands without asking again.',
  'approvalRisk.impact.outsideWorkspacePaths': 'The command references path(s) outside cwd: {paths}',
  'approvalRisk.impact.noCommandPolicy': 'No .codex-web.yml command allowlist or denylist is configured for this command.',
  'approvalRisk.impact.cwd': 'cwd: {cwd}',
  'approvalRisk.impact.fileWriteAccess': 'Codex may write files after this approval.',
  'approvalRisk.impact.writeRoot': 'write root: {path}',
  'approvalRisk.impact.outsideWorkspaceWriteRoot': 'The requested write root appears to be outside the current workspace.',
  'approvalRisk.impact.externalTool': 'This may call an external or connected tool with access to task context.',
  'approvalRisk.impact.manualDecision': 'This action may affect the running task or connected tools.',
  'approvalRisk.description.commandApproval': 'Codex wants permission to run a local command.',
  'approvalRisk.description.fileChangeApproval': 'Codex wants permission to modify files.',
  'approvalRisk.description.genericDecision': 'Codex is waiting for a user decision.',
  'approvalRisk.recommendation.highCommand': 'Review the command carefully. Prefer declining unless the exact effect is expected.',
  'approvalRisk.recommendation.normalCommand': 'Approve only if the command matches the task and workspace you expect.',
  'approvalRisk.recommendation.highFile': 'Approve only if writing outside the workspace is intentional.',
  'approvalRisk.recommendation.normalFile': 'Review the requested write scope before approving for the session.',
  'approvalRisk.recommendation.externalTool': 'Approve only if the destination tool and data being shared are expected.',
  'approvalRisk.recommendation.manualDecision': 'Review the request details before returning a result.',
  'approvalRisk.subject.workspaceFileChanges': 'Workspace file changes',
}

export function translateApprovalRiskMessage(
  key: string,
  replacements: Record<string, string> = {},
): string {
  let text = APPROVAL_RISK_MESSAGES[key] ?? key
  for (const [name, value] of Object.entries(replacements)) {
    text = text.split(`{${name}}`).join(value)
  }
  return text
}

const defaultApprovalRiskTranslator: ApprovalRiskTranslator = translateApprovalRiskMessage

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

function analyzeCommand(command: string, t: ApprovalRiskTranslator): Pick<UiApprovalRiskSummary, 'level' | 'riskLabels' | 'impacts'> {
  const normalized = command.trim()
  let level: UiApprovalRiskLevel = normalized ? 'low' : 'medium'
  const riskLabels: string[] = []
  const impacts: string[] = []

  if (!normalized) {
    riskLabels.push(t('approvalRisk.label.unknownCommand'))
    impacts.push(t('approvalRisk.impact.commandMissing'))
    return { level, riskLabels, impacts }
  }

  if (commandContains(normalized, [/\brm\s+(-[^\s]*r|--recursive)\b/u, /\brm\s+(-[^\s]*f|--force)\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.deletesFiles'))
    impacts.push(t('approvalRisk.impact.deletesFiles'))
  }

  if (commandContains(normalized, [/\bsudo\b/u, /\bchmod\b/u, /\bchown\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.changesPermissions'))
    impacts.push(t('approvalRisk.impact.changesPermissions'))
  }

  if (commandContains(normalized, [/\b(curl|wget|ssh|scp|rsync|gh|git\s+push)\b/u])) {
    level = maxRisk(level, 'medium')
    riskLabels.push(t('approvalRisk.label.networkAccess'))
    impacts.push(t('approvalRisk.impact.networkAccess'))
  }

  if (commandContains(normalized, [/\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update)\b/u, /\bpip\s+install\b/u])) {
    level = maxRisk(level, 'medium')
    riskLabels.push(t('approvalRisk.label.changesDependencies'))
    impacts.push(t('approvalRisk.impact.changesDependencies'))
  }

  if (commandContains(normalized, [/\b(git\s+reset|git\s+clean|git\s+checkout)\b/u])) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.mayDiscardWork'))
    impacts.push(t('approvalRisk.impact.mayDiscardWork'))
  }

  if (commandContains(normalized, [/\b(auth|token|secret|password|credential|keychain|ssh-keygen)\b/iu])) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.sensitiveCredentials'))
    impacts.push(t('approvalRisk.impact.sensitiveCredentials'))
  }

  if (commandTouchesPath(normalized, [/(^|[\s/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum)\b/iu])) {
    level = maxRisk(level, 'medium')
    riskLabels.push(t('approvalRisk.label.modifiesLockfile'))
    impacts.push(t('approvalRisk.impact.modifiesLockfile'))
  }

  if (commandTouchesPath(normalized, [/(^|\/)(auth|authentication|authorization|permission|permissions|rbac|acl|payment|payments|billing|checkout|stripe|paypal)(\/|\.|-|_)/iu])) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.highRiskCodePath'))
    impacts.push(t('approvalRisk.impact.highRiskCodePath'))
  }

  return {
    level,
    riskLabels: unique(riskLabels.length > 0 ? riskLabels : [t('approvalRisk.label.commandExecution')]),
    impacts: unique(impacts.length > 0 ? impacts : [t('approvalRisk.impact.commandExecution')]),
  }
}

function isOutsideCwd(pathValue: string, cwd: string): boolean {
  if (!pathValue || !cwd) return false
  if (!pathValue.startsWith('/')) return false
  return pathValue !== cwd && !pathValue.startsWith(`${cwd.replace(/\/+$/u, '')}/`)
}

function buildCommandApprovalSummary(request: UiServerRequest, t: ApprovalRiskTranslator): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const command = readString(params?.command)
  const cwd = readString(params?.cwd)
  const reason = readString(params?.reason)
  const proposedAmendment = Array.isArray(params?.proposedExecpolicyAmendment)
    ? params.proposedExecpolicyAmendment.map(readString).filter(Boolean)
    : []
  const commandRisk = analyzeCommand(command, t)
  let level = commandRisk.level
  const riskLabels = [...commandRisk.riskLabels]
  const impacts = [...commandRisk.impacts]
  const outsidePaths = commandAbsolutePaths(command).filter((path) => isOutsideCwd(path, cwd))

  if (proposedAmendment.length > 0) {
    level = maxRisk(level, 'medium')
    riskLabels.push(t('approvalRisk.label.sessionPolicyChange'))
    impacts.push(t('approvalRisk.impact.sessionPolicyChange'))
  }

  if (outsidePaths.length > 0) {
    level = maxRisk(level, 'high')
    riskLabels.push(t('approvalRisk.label.outsideWorkspace'))
    impacts.push(t('approvalRisk.impact.outsideWorkspacePaths', { paths: outsidePaths.slice(0, 3).join(', ') }))
  }

  if (request.commandPolicy) {
    if (request.commandPolicy.status === 'allowed') {
      riskLabels.push(t('approvalRisk.label.allowedByPolicy'))
      impacts.push(request.commandPolicy.reason)
    } else if (request.commandPolicy.status === 'not_configured') {
      level = maxRisk(level, 'medium')
      riskLabels.push(t('approvalRisk.label.noCommandPolicy'))
      impacts.push(t('approvalRisk.impact.noCommandPolicy'))
    } else if (request.commandPolicy.status === 'not_git_workspace') {
      level = maxRisk(level, 'medium')
      riskLabels.push(t('approvalRisk.label.policyUnavailable'))
      impacts.push(request.commandPolicy.reason)
    } else if (request.commandPolicy.status === 'denied') {
      level = maxRisk(level, 'high')
      riskLabels.push(t('approvalRisk.label.deniedByPolicy'))
      impacts.push(request.commandPolicy.reason)
    }
  }

  return {
    title: t('approvalRisk.title.commandApproval'),
    level,
    description: reason || t('approvalRisk.description.commandApproval'),
    subject: command || request.method,
    riskLabels: unique(riskLabels),
    impacts: unique(cwd ? [t('approvalRisk.impact.cwd', { cwd }), ...impacts] : impacts),
    recommendation:
      level === 'high'
        ? t('approvalRisk.recommendation.highCommand')
        : t('approvalRisk.recommendation.normalCommand'),
  }
}

function buildFileChangeApprovalSummary(request: UiServerRequest, t: ApprovalRiskTranslator): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const grantRoot = readString(params?.grantRoot)
  const reason = readString(params?.reason)
  const cwd = readString(params?.cwd)
  let level: UiApprovalRiskLevel = grantRoot ? 'medium' : 'low'
  const riskLabels = [t('approvalRisk.label.fileWriteAccess')]
  const impacts = [t('approvalRisk.impact.fileWriteAccess')]

  if (grantRoot) {
    impacts.unshift(t('approvalRisk.impact.writeRoot', { path: grantRoot }))
    riskLabels.push(t('approvalRisk.label.sessionWriteScope'))
  }

  if (isOutsideCwd(grantRoot, cwd)) {
    level = 'high'
    riskLabels.push(t('approvalRisk.label.outsideWorkspace'))
    impacts.push(t('approvalRisk.impact.outsideWorkspaceWriteRoot'))
  }

  if (request.fileChangePolicy) {
    if (request.fileChangePolicy.status === 'allowed') {
      riskLabels.push(t('approvalRisk.label.allowedByFilePolicy'))
      impacts.push(request.fileChangePolicy.reason)
    } else {
      level = 'high'
      riskLabels.push(t('approvalRisk.label.deniedByFilePolicy'))
      impacts.push(request.fileChangePolicy.reason)
    }

    if (request.fileChangePolicy.category === 'sensitive') {
      riskLabels.push(t('approvalRisk.label.sensitivePath'))
    }
    if (request.fileChangePolicy.category === 'ignored') {
      riskLabels.push(t('approvalRisk.label.ignoredPath'))
    }
    if (request.fileChangePolicy.category === 'read_only') {
      riskLabels.push(t('approvalRisk.label.readOnlyWorkspace'))
    }
  }

  return {
    title: t('approvalRisk.title.fileChangeApproval'),
    level,
    description: reason || t('approvalRisk.description.fileChangeApproval'),
    subject: grantRoot || t('approvalRisk.subject.workspaceFileChanges'),
    riskLabels: unique(riskLabels),
    impacts: unique(impacts),
    recommendation:
      level === 'high'
        ? t('approvalRisk.recommendation.highFile')
        : t('approvalRisk.recommendation.normalFile'),
  }
}

function buildGenericApprovalSummary(request: UiServerRequest, t: ApprovalRiskTranslator): UiApprovalRiskSummary {
  const params = asRecord(request.params)
  const reason = readString(params?.reason)
  const method = request.method.trim()
  const isExternalTool = /\b(mcp|tool)\b/iu.test(method)
  return {
    title: isExternalTool ? t('approvalRisk.title.toolApproval') : t('approvalRisk.title.manualApproval'),
    level: isExternalTool ? 'high' : 'medium',
    description: reason || t('approvalRisk.description.genericDecision'),
    subject: request.method,
    riskLabels: isExternalTool
      ? [t('approvalRisk.label.externalTool'), t('approvalRisk.label.manualDecision')]
      : [t('approvalRisk.label.manualDecision')],
    impacts: isExternalTool
      ? [t('approvalRisk.impact.externalTool')]
      : [t('approvalRisk.impact.manualDecision')],
    recommendation: isExternalTool
      ? t('approvalRisk.recommendation.externalTool')
      : t('approvalRisk.recommendation.manualDecision'),
  }
}

export function buildApprovalRiskSummary(
  request: UiServerRequest,
  t: ApprovalRiskTranslator = defaultApprovalRiskTranslator,
): UiApprovalRiskSummary {
  if (isCommandApprovalRequestMethod(request.method)) {
    return buildCommandApprovalSummary(request, t)
  }

  if (isFileChangeApprovalRequestMethod(request.method)) {
    return buildFileChangeApprovalSummary(request, t)
  }

  return buildGenericApprovalSummary(request, t)
}
