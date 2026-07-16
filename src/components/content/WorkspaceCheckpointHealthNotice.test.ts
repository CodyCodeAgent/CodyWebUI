// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLocale } from '../../composables/useLocale'
import type { UiCheckpointHealth } from '../../types/codex'
import WorkspaceCheckpointHealthNotice from './WorkspaceCheckpointHealthNotice.vue'

function health(overrides: Partial<UiCheckpointHealth> = {}): UiCheckpointHealth {
  return {
    cwd: '/repo',
    repoRoot: '/repo',
    checkpointRoot: '/repo/.git/cody-web-ui-checkpoints',
    generatedAtIso: '2026-07-16T01:00:00.000Z',
    status: 'degraded',
    rootWritable: true,
    checkpointCount: 3,
    knownBytes: 80 * 1024 * 1024,
    unknownSizeCheckpointIds: ['legacy-unknown'],
    blockedCheckpointIds: ['legacy-blocked'],
    scanError: '',
    automaticBackoff: {
      failureCount: 2,
      retryAtIso: '2026-07-16T01:05:00.000Z',
      active: true,
    },
    ...overrides,
  }
}

beforeEach(() => {
  useLocale().setLocale('en')
})

describe('WorkspaceCheckpointHealthNotice', () => {
  it('stays quiet when checkpoint recovery is healthy', () => {
    const wrapper = mount(WorkspaceCheckpointHealthNotice, {
      props: { health: health({ status: 'healthy', unknownSizeCheckpointIds: [], blockedCheckpointIds: [], automaticBackoff: null }) },
    })
    expect(wrapper.find('.checkpoint-health-notice').exists()).toBe(false)
  })

  it('explains blocked cleanup, unknown size, and automatic backoff', () => {
    const wrapper = mount(WorkspaceCheckpointHealthNotice, { props: { health: health() } })
    const notice = wrapper.get('.checkpoint-health-notice')
    expect(notice.attributes('data-status')).toBe('degraded')
    expect(notice.text()).toContain('Checkpoint recovery needs attention')
    expect(notice.text()).toContain('1 cleanup blocked')
    expect(notice.text()).toContain('1 unmeasured')
    expect(notice.text()).toContain('80 MB measured')
    expect(notice.text()).toContain('Automatic checkpoints paused after 2 failures')
    expect(notice.text()).toContain('/repo/.git/cody-web-ui-checkpoints')
  })
})
