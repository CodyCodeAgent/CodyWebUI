import type { UiToolTimelineEntry } from '../types/codex'

export type ToolStatusTone = 'success' | 'danger' | 'working' | 'neutral'

export function isToolFailureStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('decline') ||
    normalized.includes('cancel')
  )
}

export function formatToolStatus(status: string): string {
  const normalized = status.trim()
  if (!normalized) return 'unknown'
  return normalized
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
}

export function toolStatusTone(status: string): ToolStatusTone {
  const normalized = status.trim().toLowerCase()
  if (!normalized) return 'neutral'
  if (isToolFailureStatus(normalized)) return 'danger'
  if (
    normalized.includes('running') ||
    normalized.includes('progress') ||
    normalized.includes('pending') ||
    normalized.includes('started')
  ) {
    return 'working'
  }
  if (
    normalized.includes('success') ||
    normalized.includes('complete') ||
    normalized.includes('done') ||
    normalized.includes('applied')
  ) {
    return 'success'
  }
  return 'neutral'
}

export function isToolTimelineExpandedByDefault(tool: UiToolTimelineEntry): boolean {
  return tool.kind !== 'fileChange'
}
