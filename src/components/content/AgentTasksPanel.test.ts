// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentTasksPanel from './AgentTasksPanel.vue'

const api = vi.hoisted(() => ({
  fetchAgentTasks: vi.fn(),
  createAgentTask: vi.fn(),
  updateAgentTask: vi.fn(),
  deleteAgentTask: vi.fn(),
  controlAgentTask: vi.fn(),
  exportAgentTasks: vi.fn(),
  importAgentTasks: vi.fn(),
  parseAgentTask: vi.fn(),
  fetchAgentTaskRunEvents: vi.fn().mockResolvedValue([]),
  fetchAgentTaskRuns: vi.fn().mockResolvedValue([]),
  fetchAgentTaskVersions: vi.fn().mockResolvedValue([]),
  rollbackAgentTask: vi.fn(),
  fetchPromptTemplates: vi.fn(),
}))

vi.mock('../../api/codexAgentTaskClient', () => api)
vi.mock('../../api/codexPromptLibraryClient', () => ({ fetchPromptTemplates: api.fetchPromptTemplates }))

afterEach(() => vi.clearAllMocks())

describe('AgentTasksPanel', () => {
  it('guides the first task and opens a safe task editor', async () => {
    api.fetchAgentTasks.mockResolvedValue({ tasks: [], runs: [] })
    api.fetchPromptTemplates.mockResolvedValue([])
    const wrapper = mount(AgentTasksPanel, { props: { projects: [{ cwd: '/repo', label: 'CodyWeb' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('No Agent missions scheduled')
    await wrapper.get('.agent-task-empty button').trigger('click')
    expect(wrapper.find('.agent-task-editor').exists()).toBe(true)
    expect((wrapper.get('.agent-task-form-grid select').element as HTMLSelectElement).value).toBe('/repo')
    expect(wrapper.text()).toContain('Unattended safety boundary')
    wrapper.unmount()
  })

  it('turns a natural-language schedule into a reviewable editor draft', async () => {
    api.fetchAgentTasks.mockResolvedValue({ tasks: [], runs: [] })
    api.fetchPromptTemplates.mockResolvedValue([])
    api.parseAgentTask.mockResolvedValue({ name: 'Weekday review', prompt: 'Review CI', schedule: { kind: 'daily', time: '09:00', weekdaysOnly: true }, timezone: 'Asia/Shanghai', confidence: 'high', explanation: 'Weekday schedule detected.' })
    const wrapper = mount(AgentTasksPanel, { props: { projects: [{ cwd: '/repo', label: 'CodyWeb' }] } })
    await flushPromises()
    await wrapper.get('.agent-task-command input').setValue('每个工作日上午 9 点检查 CI')
    await wrapper.get('.agent-task-command').trigger('submit')
    await flushPromises()
    expect(api.parseAgentTask).toHaveBeenCalled()
    expect((wrapper.get('.agent-task-editor input[required]').element as HTMLInputElement).value).toBe('Weekday review')
    expect(wrapper.text()).toContain('Weekday schedule detected.')
    wrapper.unmount()
  })

  it('saves the reusable conversation mode from the task editor', async () => {
    api.fetchAgentTasks.mockResolvedValue({ tasks: [], runs: [] })
    api.fetchPromptTemplates.mockResolvedValue([])
    api.createAgentTask.mockResolvedValue({ id: 'task-fixed' })
    const wrapper = mount(AgentTasksPanel, { props: { projects: [{ cwd: '/repo', label: 'CodyWeb' }] } })
    await flushPromises()
    await wrapper.get('.agent-task-empty button').trigger('click')
    await wrapper.get('input[maxlength="120"]').setValue('Daily context review')
    await wrapper.get('textarea[required]').setValue('Continue reviewing this project.')
    await wrapper.get('.agent-task-conversation-mode input[value="reuse"]').setValue(true)
    await wrapper.get('.agent-task-editor').trigger('submit')
    await flushPromises()

    expect(api.createAgentTask).toHaveBeenCalledWith(expect.objectContaining({ conversationMode: 'reuse' }))
    wrapper.unmount()
  })

  it('renders run health and links completed runs back to their conversation', async () => {
    api.fetchPromptTemplates.mockResolvedValue([])
    api.fetchAgentTasks.mockResolvedValue({
      tasks: [{
        id: 'task-1', name: 'Daily review', description: 'Inspect regressions', cwd: '/repo', prompt: 'Review',
        schedule: { kind: 'daily', time: '09:00' }, timezone: 'Asia/Shanghai', model: '', effort: null,
        permission: 'read-only', enabled: true, timeoutMinutes: 45, maxRetries: 1,
        nextRunAtIso: '2026-07-17T01:00:00.000Z', lastRunAtIso: '2026-07-16T01:00:00.000Z',
        consecutiveFailures: 0, createdAtIso: '2026-07-16T00:00:00.000Z', updatedAtIso: '2026-07-16T00:00:00.000Z',
      }],
      runs: [{
        id: 'run-1', taskId: 'task-1', status: 'succeeded', trigger: 'schedule', scheduledAtIso: '2026-07-16T01:00:00.000Z',
        startedAtIso: '2026-07-16T01:00:01.000Z', completedAtIso: '2026-07-16T01:02:00.000Z', threadId: 'thread-1', turnId: 'turn-1',
        summary: 'No regressions found.', error: '', inputTokens: 100, outputTokens: 20, totalTokens: 120, retryNumber: 0,
      }],
    })
    const wrapper = mount(AgentTasksPanel, { props: { projects: [{ cwd: '/repo', label: 'CodyWeb' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Daily review')
    await wrapper.get('.agent-task-history-toggle').trigger('click')
    expect(wrapper.text()).toContain('No regressions found.')
    await wrapper.get('.agent-task-history article > button').trigger('click')
    expect(wrapper.emitted('selectThread')).toEqual([['thread-1']])
    wrapper.unmount()
  })

  it('switches to archived tasks and restores or permanently deletes them', async () => {
    api.fetchPromptTemplates.mockResolvedValue([])
    api.fetchAgentTasks.mockImplementation(async (visibility: string) => visibility === 'archived' ? {
      tasks: [{
        id: 'archived-1', name: 'Old review', description: '', cwd: '/repo', prompt: 'Review',
        schedule: { kind: 'daily', time: '09:00' }, timezone: 'UTC', model: '', effort: null,
        permission: 'read-only', enabled: false, timeoutMinutes: 45, maxRetries: 1,
        concurrencyPolicy: 'skip', notificationPolicy: 'important', outputMode: 'conversation', outputPath: '',
        maxTokens: 0, pauseAfterFailures: 3, nextRunAtIso: null, lastRunAtIso: null, consecutiveFailures: 0,
        version: 1, archivedAtIso: '2026-07-16T00:00:00.000Z', createdAtIso: '', updatedAtIso: '',
      }], runs: [],
    } : { tasks: [], runs: [] })
    api.controlAgentTask.mockResolvedValue({ id: 'archived-1' })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const wrapper = mount(AgentTasksPanel)
    await flushPromises()
    await wrapper.get('.agent-task-view-switch button:last-child').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Old review')
    await wrapper.get('.agent-task-actions button').trigger('click')
    await flushPromises()
    expect(api.controlAgentTask).toHaveBeenCalledWith('archived-1', 'restore')
    await wrapper.get('.agent-task-actions button:last-child').trigger('click')
    await flushPromises()
    expect(api.deleteAgentTask).toHaveBeenCalledWith('archived-1', true)
    vi.unstubAllGlobals()
    wrapper.unmount()
  })
})
