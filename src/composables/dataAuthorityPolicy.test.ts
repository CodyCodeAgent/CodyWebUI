import { describe, expect, it } from 'vitest'
import { dataAuthorityPolicy } from './dataAuthorityPolicy'

describe('data authority policy', () => {
  it('marks rate-limit notifications as invalidations and plans as snapshots', () => {
    expect(dataAuthorityPolicy('account/rateLimits/updated')).toMatchObject({
      authority: 'account/rateLimits/read',
      realtimeMode: 'invalidate',
    })
    expect(dataAuthorityPolicy('turn/plan/updated')?.realtimeMode).toBe('replace-snapshot')
  })
})
