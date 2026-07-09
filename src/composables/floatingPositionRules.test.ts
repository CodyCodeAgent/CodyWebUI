import { describe, expect, it } from 'vitest'
import {
  clampFloatingPosition,
  floatingKeyboardDelta,
  moveFloatingPosition,
} from './floatingPositionRules'

describe('floatingPositionRules', () => {
  it('clamps positions inside bounds', () => {
    expect(clampFloatingPosition(
      { x: -20, y: 999 },
      { minX: 8, maxX: 120, minY: 12, maxY: 160 },
    )).toEqual({ x: 8, y: 160 })
  })

  it('uses arrow keys for small, large, and fine deltas', () => {
    expect(floatingKeyboardDelta('ArrowRight')).toEqual({ x: 12, y: 0 })
    expect(floatingKeyboardDelta('ArrowUp', { shiftKey: true })).toEqual({ x: 0, y: -48 })
    expect(floatingKeyboardDelta('ArrowLeft', { altKey: true, shiftKey: true })).toEqual({ x: -1, y: 0 })
  })

  it('ignores keys that are not movement commands', () => {
    expect(floatingKeyboardDelta('Enter')).toBeNull()
  })

  it('moves and clamps in one step', () => {
    expect(moveFloatingPosition(
      { x: 40, y: 40 },
      { x: 100, y: -100 },
      { minX: 8, maxX: 120, minY: 8, maxY: 120 },
    )).toEqual({ x: 120, y: 8 })
  })
})
