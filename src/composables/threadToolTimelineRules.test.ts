import { describe, expect, it } from 'vitest'
import type { UiToolTimelineEntry } from '../types/codex'
import {
  formatToolStatus,
  isToolFailureStatus,
  isToolTimelineExpandedByDefault,
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
})
