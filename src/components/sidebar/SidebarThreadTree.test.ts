// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import type { UiProjectGroup } from '../../types/codex'
import SidebarThreadTree from './SidebarThreadTree.vue'
import { installTestLocalStorage } from '../../test/localStorage'

const groups: UiProjectGroup[] = [
  {
    projectName: '/repo/app',
    cwd: '/repo/app',
    threads: [
      {
        id: 'thread-1',
        title: 'Layering test',
        projectName: '/repo/app',
        cwd: '/repo/app',
        createdAtIso: '2026-07-10T00:00:00.000Z',
        updatedAtIso: '2026-07-10T00:00:00.000Z',
        preview: '',
        unread: false,
        inProgress: false,
      },
    ],
  },
  {
    projectName: '/repo/next',
    cwd: '/repo/next',
    threads: [],
  },
]

describe('SidebarThreadTree', () => {
  beforeEach(() => { installTestLocalStorage(); window.localStorage.clear() })

  it('raises the owning project while a thread menu is open', async () => {
    const wrapper = mount(SidebarThreadTree, {
      props: {
        groups,
        projectDisplayNameById: {},
        selectedThreadId: '',
        isLoading: false,
        searchQuery: '',
        isHiddenView: false,
      },
    })

    await wrapper.findAll('.project-header-row')[0]?.trigger('click')
    await wrapper.get('.thread-menu-trigger').trigger('click')

    expect(wrapper.get('.project-group').attributes('style')).toContain('z-index: 45')
    expect(wrapper.get('.thread-menu-panel').text()).toContain('Hide')
    expect(wrapper.get('.thread-menu-panel').text()).not.toContain('Archive')
    wrapper.unmount()
  })

  it('opens the skill console for the selected project without toggling it', async () => {
    const wrapper = mount(SidebarThreadTree, {
      props: {
        groups,
        projectDisplayNameById: {},
        selectedThreadId: '',
        isLoading: false,
        searchQuery: '',
        isHiddenView: false,
        skillCountsByCwd: { '/repo/app': 12 },
      },
    })

    expect(wrapper.findAll('.project-skills-entry')[0]?.text()).toContain('12')
    await wrapper.findAll('.project-skills-entry')[0]?.trigger('click')
    expect(wrapper.emitted('open-project-skills')?.[0]).toEqual([{ cwd: '/repo/app', projectName: '/repo/app' }])
  })

  it('selects a thread from the full row while keeping pinning as a separate action', async () => {
    const wrapper = mount(SidebarThreadTree, {
      props: {
        groups,
        projectDisplayNameById: {},
        selectedThreadId: '',
        isLoading: false,
        searchQuery: '',
        isHiddenView: false,
      },
    })

    await wrapper.findAll('.project-header-row')[0]?.trigger('click')
    await wrapper.get('.thread-row').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['thread-1']])

    await wrapper.get('.thread-pin-button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['thread-1']])
  })

  it('collapses every project when the toolbar requests it', async () => {
    const wrapper = mount(SidebarThreadTree, {
      props: {
        groups,
        projectDisplayNameById: {},
        selectedThreadId: '',
        isLoading: false,
        searchQuery: '',
        isHiddenView: false,
        collapseAllRequest: 0,
      },
    })

    await wrapper.findAll('.project-header-row')[0]?.trigger('click')
    expect(wrapper.findAll('.project-group')[0]?.attributes('data-expanded')).toBe('true')
    expect(wrapper.emitted('collapse-state-change')?.at(-1)).toEqual([false])

    await wrapper.setProps({ collapseAllRequest: 1 })

    expect(wrapper.findAll('.project-group').every((project) => project.attributes('data-expanded') === 'false')).toBe(true)
    expect(wrapper.emitted('collapse-state-change')?.at(-1)).toEqual([true])
    expect(JSON.parse(window.localStorage.getItem('cody-web-ui.collapsed-projects.v1') ?? '{}')).toMatchObject({
      '/repo/app': true,
      '/repo/next': true,
    })
    wrapper.unmount()
  })
})
