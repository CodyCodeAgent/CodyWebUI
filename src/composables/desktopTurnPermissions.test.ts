import { describe, expect, it } from 'vitest'
import {
  buildTurnPermissionOverride,
  normalizeComposerPermissionMode,
} from './desktopTurnPermissions'

describe('desktopTurnPermissions', () => {
  it('normalizes composer permission modes', () => {
    expect(normalizeComposerPermissionMode('yolo')).toBe('yolo')
    expect(normalizeComposerPermissionMode('current')).toBe('current')
    expect(normalizeComposerPermissionMode('full')).toBe('current')
  })

  it('builds no override for current and full auto overrides for YOLO', () => {
    expect(buildTurnPermissionOverride('current')).toBeNull()
    expect(buildTurnPermissionOverride('yolo')).toEqual({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    })
  })
})
