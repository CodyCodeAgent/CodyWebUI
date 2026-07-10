// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SidebarMenuRow from './SidebarMenuRow.vue'

describe('SidebarMenuRow', () => {
  it('does not mark a persistent right control as a hover control', () => {
    const wrapper = mount(SidebarMenuRow, {
      slots: {
        default: 'Projects',
        right: '<button type="button">Hidden</button>',
      },
    })

    expect(wrapper.attributes('data-has-right-default')).toBe('true')
    expect(wrapper.attributes('data-has-right-hover')).toBe('false')
  })

  it('marks optional actions as hover controls', () => {
    const wrapper = mount(SidebarMenuRow, {
      slots: {
        default: 'Project',
        'right-hover': '<button type="button">Actions</button>',
      },
    })

    expect(wrapper.attributes('data-has-right-hover')).toBe('true')
  })
})
