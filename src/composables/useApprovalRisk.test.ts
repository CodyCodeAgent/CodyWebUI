import { describe, expect, it } from 'vitest'
import {
  approvalDecisionForScope,
  approvalScopeForDecision,
  buildApprovalRiskSummary,
  COMMAND_APPROVAL_REQUEST_METHOD,
  FILE_CHANGE_APPROVAL_REQUEST_METHOD,
  isApprovalRequestMethod,
  isCommandApprovalRequestMethod,
  isFileChangeApprovalRequestMethod,
} from './useApprovalRisk'
import type { UiServerRequest } from '../types/codex'

function buildRequest(method: string, params: unknown, overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 7,
    method,
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-07-04T12:00:00.000Z',
    params,
    ...overrides,
  }
}

describe('buildApprovalRiskSummary', () => {
  it('maps approval decisions to auditable scopes', () => {
    expect(approvalScopeForDecision('accept')).toBe('single')
    expect(approvalScopeForDecision('acceptForSession')).toBe('session')
    expect(approvalScopeForDecision('decline')).toBe('single')
    expect(approvalScopeForDecision('cancel')).toBe('single')
    expect(approvalDecisionForScope('single')).toBe('accept')
    expect(approvalDecisionForScope('session')).toBe('acceptForSession')
    expect(approvalDecisionForScope('workspace')).toBe('accept')
    expect(approvalDecisionForScope('permanent')).toBe('accept')
    expect(isCommandApprovalRequestMethod(COMMAND_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isFileChangeApprovalRequestMethod(FILE_CHANGE_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod(COMMAND_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod(FILE_CHANGE_APPROVAL_REQUEST_METHOD)).toBe(true)
    expect(isApprovalRequestMethod('item/tool/call')).toBe(false)
  })

  it('explains high-risk command approvals', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/commandExecution/requestApproval', {
        command: 'sudo rm -rf /tmp/example',
        cwd: '/workspace/app',
        reason: 'needs to clean generated files',
      }),
    )

    expect(summary.title).toBe('Command approval')
    expect(summary.level).toBe('high')
    expect(summary.subject).toBe('sudo rm -rf /tmp/example')
    expect(summary.description).toBe('needs to clean generated files')
    expect(summary.riskLabels).toEqual(expect.arrayContaining(['Deletes files', 'Changes permissions']))
    expect(summary.impacts.join('\n')).toContain('permanently delete')
  })

  it('flags dependency installs with session policy amendments', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/commandExecution/requestApproval', {
        command: 'npm install',
        cwd: '/workspace/app',
        proposedExecpolicyAmendment: ['npm install'],
      }),
    )

    expect(summary.level).toBe('medium')
    expect(summary.riskLabels).toEqual(expect.arrayContaining(['Changes dependencies', 'Session policy change']))
    expect(summary.impacts.join('\n')).toContain('without asking again')
  })

  it('includes command policy evidence in command approval summaries', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/commandExecution/requestApproval', {
        command: 'npm test',
        cwd: '/workspace/app',
      }, {
        commandPolicy: {
          status: 'allowed',
          cwd: '/workspace/app',
          repoRoot: '/workspace/app',
          command: 'npm test',
          checkedValues: ['npm test', 'test'],
          allowPatterns: ['test'],
          denyPatterns: ['publish*'],
          matchedPattern: 'test',
          reason: 'Command matched .cody-web-ui.yml allow policy: test',
        },
      }),
    )

    expect(summary.riskLabels).toEqual(expect.arrayContaining(['Allowed by policy']))
    expect(summary.impacts.join('\n')).toContain('allow policy: test')
  })

  it('summarizes file write approval scope', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/fileChange/requestApproval', {
        grantRoot: '/workspace/app',
        reason: 'needs write access',
      }),
    )

    expect(summary.title).toBe('File change approval')
    expect(summary.level).toBe('medium')
    expect(summary.subject).toBe('/workspace/app')
    expect(summary.riskLabels).toEqual(expect.arrayContaining(['File write access', 'Session write scope']))
  })

  it('includes file change policy evidence in file approval summaries', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/fileChange/requestApproval', {
        grantRoot: '/workspace/app/.env.local',
        cwd: '/workspace/app',
      }, {
        fileChangePolicy: {
          status: 'denied',
          cwd: '/workspace/app',
          repoRoot: '/workspace/app',
          grantRoot: '/workspace/app/.env.local',
          relativePath: '.env.local',
          sandboxMode: 'workspace-write',
          category: 'sensitive',
          matchedPattern: '.env*',
          reason: 'Path is protected by sensitive path policy (.env*)',
        },
      }),
    )

    expect(summary.level).toBe('high')
    expect(summary.riskLabels).toEqual(expect.arrayContaining(['Denied by file policy', 'Sensitive path']))
    expect(summary.impacts.join('\n')).toContain('sensitive path policy')
  })

  it('flags outside workspace paths and high-risk code areas in command approvals', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/commandExecution/requestApproval', {
        command: 'git diff /workspace/app/src/auth/session.ts /etc/passwd package-lock.json',
        cwd: '/workspace/app',
      }),
    )

    expect(summary.level).toBe('high')
    expect(summary.riskLabels).toEqual(expect.arrayContaining([
      'Outside workspace',
      'High-risk code path',
      'Modifies lockfile',
    ]))
    expect(summary.impacts.join('\n')).toContain('/etc/passwd')
  })

  it('treats generic tool approvals as external tool risk', () => {
    const summary = buildApprovalRiskSummary(
      buildRequest('item/tool/call', {
        reason: 'send context to an MCP tool',
      }),
    )

    expect(summary.title).toBe('Tool approval')
    expect(summary.level).toBe('high')
    expect(summary.riskLabels).toEqual(expect.arrayContaining(['External tool', 'Manual decision']))
    expect(summary.recommendation).toContain('destination tool')
  })
})
