import { describe, expect, it } from 'vitest'
import type { UiToolTimelineEntry } from '../types/codex'
import {
  buildToolOutputPreview,
  formatToolStatus,
  isToolFailureStatus,
  isToolOutputTruncated,
  isToolTimelineExpandedByDefault,
  toolOutputToggleLabel,
  toolStatusTone,
} from './threadToolTimelineRules'

function tool(overrides: Partial<UiToolTimelineEntry> = {}): UiToolTimelineEntry {
  return {
    kind: 'command',
    title: 'Command',
    status: 'completed',
    summary: 'Done',
    details: [],
    ...overrides,
  }
}

describe('thread tool timeline rules', () => {
  it('formats status labels', () => {
    expect(formatToolStatus('')).toBe('unknown')
    expect(formatToolStatus('in_progress')).toBe('In Progress')
    expect(formatToolStatus('ready-to-merge')).toBe('Ready To Merge')
  })

  it('classifies status tone', () => {
    expect(isToolFailureStatus('tool failed')).toBe(true)
    expect(isToolFailureStatus('cancelled')).toBe(true)
    expect(isToolFailureStatus('completed')).toBe(false)

    expect(toolStatusTone('')).toBe('neutral')
    expect(toolStatusTone('failed')).toBe('danger')
    expect(toolStatusTone('running')).toBe('working')
    expect(toolStatusTone('applied')).toBe('success')
    expect(toolStatusTone('queued')).toBe('neutral')
  })

  it('keeps file change timelines collapsed by default', () => {
    expect(isToolTimelineExpandedByDefault(tool())).toBe(true)
    expect(isToolTimelineExpandedByDefault(tool({ kind: 'fileChange' }))).toBe(false)
  })

  it('previews long tool output before rendering the full block', () => {
    expect(isToolOutputTruncated('one\ntwo', 3, 100)).toBe(false)
    expect(isToolOutputTruncated('one\ntwo\nthree\nfour', 3, 100)).toBe(true)
    expect(isToolOutputTruncated('abcdef', 10, 5)).toBe(true)
    expect(buildToolOutputPreview('one\ntwo\nthree\nfour', 2, 100)).toBe('one\ntwo')
    expect(buildToolOutputPreview('abcdef', 10, 3)).toBe('abc')
    expect(toolOutputToggleLabel(false)).toBe('Show full output')
    expect(toolOutputToggleLabel(true)).toBe('Show preview')
  })
})
