import { describe, expect, it } from 'vitest'
import {
  FEISHU_CARD_ACTIONS,
  buildApprovalCard,
  buildProjectSelectionCard,
  buildResolvedRequestCard,
  buildSessionSelectionCard,
  buildSessionStatusCard,
  buildStreamingReplyCard,
  buildUserInputCard,
} from './feishuCards'

describe('Feishu cards', () => {
  it('builds the project to session binding flow with namespaced actions', () => {
    const projectCard = buildProjectSelectionCard({
      bindingKey: 'bot:group:chat:chat',
      projects: [{ projectKey: '/repo', cwd: '/repo', label: 'CodyWebUI', sessionCount: 2 }],
    })
    expect(JSON.stringify(projectCard)).toContain(FEISHU_CARD_ACTIONS.selectProject)
    expect(JSON.stringify(projectCard)).toContain('CodyWebUI')

    const sessionCard = buildSessionSelectionCard({
      bindingKey: 'bot:group:chat:chat',
      project: { projectKey: '/repo', cwd: '/repo', label: 'CodyWebUI', sessionCount: 2 },
      sessions: [{ threadId: 'thread-1', title: 'Fix scrolling' }],
    })
    expect(JSON.stringify(sessionCard)).toContain(FEISHU_CARD_ACTIONS.selectSession)
    expect(JSON.stringify(sessionCard)).toContain(FEISHU_CARD_ACTIONS.newSession)
    expect(JSON.stringify(sessionCard)).toContain('thread-1')
  })

  it('builds patchable stream states and approval actions', () => {
    expect(JSON.stringify(buildStreamingReplyCard({ state: 'running', content: 'partial answer' }))).toContain('partial answer')
    expect(JSON.stringify(buildStreamingReplyCard({ state: 'failed', error: 'network failed' }))).toContain('network failed')

    const approval = JSON.stringify(buildApprovalCard({
      bindingKey: 'binding-1', requestId: '42', title: 'Run command', summary: 'npm test', requesterOpenId: 'ou_user',
    }))
    expect(approval).toContain(FEISHU_CARD_ACTIONS.approve)
    expect(approval).toContain(FEISHU_CARD_ACTIONS.deny)
    expect(approval).toContain('42')
  })

  it('builds a stateful user-input card and a frozen resolved state', () => {
    const inputCard = JSON.stringify(buildUserInputCard({
      bindingKey: 'binding-1',
      requestId: '77',
      requesterOpenId: 'ou_user',
      questions: [{
        id: 'size', header: 'Size', question: 'Choose a size', isOther: false, isSecret: false,
        options: [{ label: 'Small', description: 'Fast' }, { label: 'Large', description: 'Thorough' }],
      }],
      selections: { size: 'Large' },
    }))
    expect(inputCard).toContain(FEISHU_CARD_ACTIONS.userInputToggle)
    expect(inputCard).toContain(FEISHU_CARD_ACTIONS.userInputSubmit)
    expect(inputCard).toContain('● Large')

    const customCard = JSON.stringify(buildUserInputCard({
      bindingKey: 'binding-1', requestId: '78', requesterOpenId: 'ou_user',
      questions: [{ id: 'note', header: 'Note', question: 'Add context', isOther: true, isSecret: false, options: [] }],
      selections: { note: 'Keep the migration reversible' },
    }))
    expect(customCard).toContain('/answer 78 note')
    expect(customCard).toContain('Keep the migration reversible')

    const resolved = JSON.stringify(buildResolvedRequestCard({
      title: 'Size', summary: 'Choose a size', outcome: 'answered', operatorOpenId: 'ou_user',
      resolvedAtIso: '2026-07-18T00:00:00.000Z', answers: { Size: 'Large' },
    }))
    expect(resolved).toContain('已提交答案')
    expect(resolved).not.toContain('cody_feishu_')
  })

  it('builds a compact session status card', () => {
    const status = JSON.stringify(buildSessionStatusCard({
      projectLabel: 'Repo', sessionTitle: 'Current', threadId: 'thread-1', state: 'running', queuedCount: 2,
    }))
    expect(status).toContain('运行中')
    expect(status).toContain('排队消息')
    expect(status).toContain('2')
  })
})
