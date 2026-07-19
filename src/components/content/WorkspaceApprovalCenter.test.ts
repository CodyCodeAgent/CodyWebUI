// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceApprovalCenter from './WorkspaceApprovalCenter.vue'
import type { UiServerRequest } from '../../types/codex'

const gatewayMock = vi.hoisted(() => ({
  fetchApprovalGrants: vi.fn(async () => ({ grants: [] })),
  revokeApprovalGrant: vi.fn(async () => ({ grants: [] })),
}))

vi.mock('../../api/codexGatewayStatusClient', () => gatewayMock)

function approvalRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 10,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'cmd-1',
    receivedAtIso: '2026-07-09T10:00:00.000Z',
    params: {
      command: 'rm -rf dist',
      cwd: '/repo',
      reason: 'dangerous cleanup',
    },
    commandPolicy: {
      status: 'denied',
      cwd: '/repo',
      repoRoot: '/repo',
      command: 'rm -rf dist',
      checkedValues: ['rm -rf dist'],
      allowPatterns: [],
      denyPatterns: ['rm -rf'],
      reason: 'Destructive command',
      matchedPattern: 'rm -rf',
    },
    ...overrides,
  }
}

function toolRequest(overrides: Partial<UiServerRequest> = {}): UiServerRequest {
  return {
    id: 22,
    method: 'tool/user_input',
    threadId: 'thread-2',
    turnId: 'turn-2',
    itemId: 'tool-1',
    receivedAtIso: '2026-07-09T11:00:00.000Z',
    params: {
      prompt: 'Choose an option',
    },
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  gatewayMock.fetchApprovalGrants.mockClear()
  gatewayMock.revokeApprovalGrant.mockClear()
})

describe('WorkspaceApprovalCenter', () => {
  it('renders approval risk and emits scoped approval decisions', async () => {
    const wrapper = mount(WorkspaceApprovalCenter, {
      attachTo: document.body,
      props: {
        cwd: '/repo',
        pendingRequests: [approvalRequest()],
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(gatewayMock.fetchApprovalGrants).toHaveBeenCalledWith('/repo')
    expect(wrapper.get('[data-testid="workspace-approval-center-badge"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="workspace-approval-card"]').attributes('data-risk')).toBe('high')
    expect(wrapper.text()).toContain('Command approval')
    expect(wrapper.text()).toContain('rm -rf dist')
    expect(wrapper.text()).toContain('policy denied')

    const sessionButton = wrapper.findAll('[data-testid="workspace-approval-scope"]')
      .find((button) => button.attributes('data-scope') === 'session')
    const permanentButton = wrapper.findAll('[data-testid="workspace-approval-scope"]')
      .find((button) => button.attributes('data-scope') === 'permanent')

    await sessionButton?.trigger('click')
    await permanentButton?.trigger('click')
    await wrapper.get('[data-testid="workspace-approval-decline"]').trigger('click')

    expect(wrapper.emitted('respondServerRequest')).toEqual([
      [
        {
          id: 10,
          approvalScope: 'session',
          result: { decision: 'acceptForSession' },
        },
      ],
      [
        {
          id: 10,
          approvalScope: 'permanent',
          result: { decision: 'accept' },
        },
      ],
      [
        {
          id: 10,
          approvalScope: 'single',
          result: { decision: 'decline' },
        },
      ],
    ])
  })

  it('emits generic tool request responses from the same approval center surface', async () => {
    const wrapper = mount(WorkspaceApprovalCenter, {
      props: {
        cwd: '/repo',
        pendingRequests: [toolRequest()],
      },
    })

    expect(wrapper.get('[data-testid="workspace-approval-card"]').attributes('data-risk')).toBe('high')
    expect(wrapper.text()).toContain('Tool approval')

    await wrapper.get('[data-testid="workspace-request-empty"]').trigger('click')
    await wrapper.get('[data-testid="workspace-request-reject"]').trigger('click')

    expect(wrapper.emitted('respondServerRequest')).toEqual([
      [
        {
          id: 22,
          result: {},
        },
      ],
      [
        {
          id: 22,
          error: {
            code: -32000,
            message: 'Rejected from CodyWeb approval center.',
          },
        },
      ],
    ])
  })
})
