// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import type { UiProjectGroup } from '../../types/codex'
import SidebarThreadTree from './SidebarThreadTree.vue'

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
  beforeEach(() => window.localStorage.clear())

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
})
