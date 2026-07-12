// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { UiRateLimitSnapshot } from '../../types/codex'
import RateLimitFloatingStatus from './RateLimitFloatingStatus.vue'
import { installTestLocalStorage } from '../../test/localStorage'

const POSITION_STORAGE_KEY = 'cody-web-ui.rate-limit-position.v1'

const snapshot: UiRateLimitSnapshot = {
  limitId: 'codex',
  limitName: '',
  planType: 'pro',
  primary: {
    usedPercent: 10,
    windowDurationMins: 300,
    resetsAt: null,
  },
  secondary: null,
  credits: null,
  availableResetCredits: 0,
}

describe('RateLimitFloatingStatus', () => {
  beforeEach(() => {
    installTestLocalStorage()
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  })

  it('recovers a stored position whose drag handle is hidden beneath the header', async () => {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ x: 900, y: 12 }))

    const wrapper = mount(RateLimitFloatingStatus, {
      props: { snapshot, isLoading: false },
    })
    await nextTick()

    expect(wrapper.attributes('style')).toContain('top: 72px')
    expect(JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY) ?? '{}')).toMatchObject({ y: 72 })
    wrapper.unmount()
  })

  it('keeps keyboard movement below the draggable safe area', async () => {
    const wrapper = mount(RateLimitFloatingStatus, {
      props: { snapshot, isLoading: false },
    })

    await wrapper.trigger('keydown', { key: 'ArrowUp', shiftKey: true })

    expect(wrapper.attributes('style')).toContain('top: 72px')
    wrapper.unmount()
  })
})
