import type { UiToolTimelineEntry } from '../types/codex'

export type ToolStatusTone = 'success' | 'danger' | 'working' | 'neutral'

export const TOOL_OUTPUT_PREVIEW_LINE_COUNT = 80
export const TOOL_OUTPUT_PREVIEW_MAX_CHARS = 12000

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

export function isToolOutputTruncated(
  output: string,
  lineLimit = TOOL_OUTPUT_PREVIEW_LINE_COUNT,
  charLimit = TOOL_OUTPUT_PREVIEW_MAX_CHARS,
): boolean {
  if (output.length > Math.max(Math.trunc(charLimit), 1)) return true
  const normalizedLineLimit = Math.max(Math.trunc(lineLimit), 1)
  return output.split(/\r\n|\r|\n/u).length > normalizedLineLimit
}

export function buildToolOutputPreview(
  output: string,
  lineLimit = TOOL_OUTPUT_PREVIEW_LINE_COUNT,
  charLimit = TOOL_OUTPUT_PREVIEW_MAX_CHARS,
): string {
  const normalizedLineLimit = Math.max(Math.trunc(lineLimit), 1)
  const normalizedCharLimit = Math.max(Math.trunc(charLimit), 1)
  const lines = output.split(/\r\n|\r|\n/u)
  const linePreview = lines.slice(0, normalizedLineLimit).join('\n')
  if (linePreview.length <= normalizedCharLimit) return linePreview
  return linePreview.slice(0, normalizedCharLimit)
}

export function toolOutputToggleLabel(isExpanded: boolean): string {
  return isExpanded ? 'Show preview' : 'Show full output'
}
