export type FloatingPosition = {
  x: number
  y: number
}

export type FloatingBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type FloatingKeyboardModifiers = {
  shiftKey?: boolean
  altKey?: boolean
}

export type FloatingDelta = {
  x: number
  y: number
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

export function clampFloatingPosition(position: FloatingPosition, bounds: FloatingBounds): FloatingPosition {
  const minX = finiteOr(bounds.minX, 0)
  const maxX = Math.max(minX, finiteOr(bounds.maxX, minX))
  const minY = finiteOr(bounds.minY, 0)
  const maxY = Math.max(minY, finiteOr(bounds.maxY, minY))

  return {
    x: Math.min(Math.max(finiteOr(position.x, minX), minX), maxX),
    y: Math.min(Math.max(finiteOr(position.y, minY), minY), maxY),
  }
}

export function floatingKeyboardDelta(
  key: string,
  modifiers: FloatingKeyboardModifiers = {},
): FloatingDelta | null {
  const step = modifiers.altKey ? 1 : modifiers.shiftKey ? 48 : 12

  if (key === 'ArrowLeft') return { x: -step, y: 0 }
  if (key === 'ArrowRight') return { x: step, y: 0 }
  if (key === 'ArrowUp') return { x: 0, y: -step }
  if (key === 'ArrowDown') return { x: 0, y: step }
  return null
}

export function moveFloatingPosition(
  position: FloatingPosition,
  delta: FloatingDelta,
  bounds: FloatingBounds,
): FloatingPosition {
  return clampFloatingPosition({
    x: position.x + delta.x,
    y: position.y + delta.y,
  }, bounds)
}
