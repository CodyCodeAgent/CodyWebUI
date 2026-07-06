import type { UiMessage, UiToolTimelineEntry } from '../types/codex'
import {
  parseValidationOutputSummary,
  type ValidationCoverageSummary,
  type ValidationTestSummary,
} from '../utils/validationSummary'
import { isToolFailureStatus } from './useThreadActivity'

export type UiValidationKind = 'test' | 'lint' | 'typecheck' | 'build' | 'preview' | 'other'
export type UiValidationStatus = 'passed' | 'failed' | 'running' | 'unknown'

export type UiValidationEvidence = {
  messageId: string
  kind: UiValidationKind
  label: string
  command: string
  cwd: string
  status: UiValidationStatus
  rawStatus: string
  exitCode: number | null
  duration: string
  failureSummary: string[]
  output: string
  testSummary: ValidationTestSummary | null
  coverageSummary: ValidationCoverageSummary | null
}

export type UiValidationSummary = {
  totalCount: number
  passedCount: number
  failedCount: number
  runningCount: number
  unknownCount: number
  hasEvidence: boolean
}

const VALIDATION_COMMAND_PATTERNS: Array<{ kind: UiValidationKind; label: string; patterns: RegExp[] }> = [
  {
    kind: 'test',
    label: 'Tests',
    patterns: [
      /\b(test|spec)\b/iu,
      /\b(vitest|jest|mocha|playwright|pytest|go\s+test|cargo\s+test|rspec|phpunit)\b/iu,
    ],
  },
  {
    kind: 'lint',
    label: 'Lint',
    patterns: [
      /\b(lint|eslint|stylelint|ruff|flake8|clippy)\b/iu,
      /\bbiome\s+(check|lint)\b/iu,
    ],
  },
  {
    kind: 'typecheck',
    label: 'Typecheck',
    patterns: [
      /\b(typecheck|type-check|vue-tsc|tsc|mypy|pyright|sorbet)\b/iu,
    ],
  },
  {
    kind: 'build',
    label: 'Build',
    patterns: [
      /\b(build|compile|tsup|vite\s+build|next\s+build|cargo\s+build|go\s+build)\b/iu,
    ],
  },
  {
    kind: 'preview',
    label: 'Preview',
    patterns: [
      /\b(dev|serve|preview|start)\b/iu,
      /\b(vite|next|nuxt|astro)\s+(dev|preview|start)\b/iu,
    ],
  },
]

function parseDetailValue(details: string[], key: string): string {
  const prefix = `${key}:`
  const row = details.find((detail) => detail.trim().toLowerCase().startsWith(prefix))
  if (!row) return ''
  return row.slice(prefix.length).trim()
}

function parseExitCode(details: string[]): number | null {
  const raw = parseDetailValue(details, 'exit')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function classifyCommand(command: string): { kind: UiValidationKind; label: string } | null {
  const normalized = command.trim()
  if (!normalized) return null

  for (const candidate of VALIDATION_COMMAND_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        kind: candidate.kind,
        label: candidate.label,
      }
    }
  }

  return null
}

function normalizeValidationStatus(rawStatus: string, exitCode: number | null): UiValidationStatus {
  const normalized = rawStatus.trim().toLowerCase()
  if (exitCode !== null) return exitCode === 0 ? 'passed' : 'failed'
  if (isToolFailureStatus(normalized)) return 'failed'
  if (normalized.includes('running') || normalized.includes('progress') || normalized.includes('started')) {
    return 'running'
  }
  if (normalized.includes('complete') || normalized.includes('success') || normalized.includes('done')) {
    return 'passed'
  }
  return 'unknown'
}

function extractFailureSummary(output: string, status: UiValidationStatus): string[] {
  if (status !== 'failed') return []
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)

  const flagged = lines.filter((line) =>
    /\b(error|failed|failure|panic|exception|traceback|not ok|✗|×)\b/iu.test(line),
  )
  const source = flagged.length > 0 ? flagged : lines.slice(-8)
  return source.slice(0, 6)
}

function commandEvidenceFromTool(
  messageId: string,
  tool: UiToolTimelineEntry,
): UiValidationEvidence | null {
  if (tool.kind !== 'command') return null

  const classified = classifyCommand(tool.summary)
  if (!classified) return null

  const exitCode = parseExitCode(tool.details)
  const rawStatus = tool.status || parseDetailValue(tool.details, 'status') || 'unknown'
  const status = normalizeValidationStatus(rawStatus, exitCode)
  const output = tool.output ?? ''
  const outputSummary = parseValidationOutputSummary(output)

  return {
    messageId,
    kind: classified.kind,
    label: classified.label,
    command: tool.summary,
    cwd: parseDetailValue(tool.details, 'cwd'),
    status,
    rawStatus,
    exitCode,
    duration: parseDetailValue(tool.details, 'duration'),
    failureSummary: extractFailureSummary(output, status),
    output,
    testSummary: outputSummary.tests,
    coverageSummary: outputSummary.coverage,
  }
}

export function buildValidationEvidence(messages: UiMessage[]): UiValidationEvidence[] {
  return messages
    .filter((message): message is UiMessage & { tool: UiToolTimelineEntry } => Boolean(message.tool))
    .map((message) => commandEvidenceFromTool(message.id, message.tool))
    .filter((entry): entry is UiValidationEvidence => Boolean(entry))
}

export function buildValidationSummary(messages: UiMessage[]): UiValidationSummary {
  const entries = buildValidationEvidence(messages)

  return {
    totalCount: entries.length,
    passedCount: entries.filter((entry) => entry.status === 'passed').length,
    failedCount: entries.filter((entry) => entry.status === 'failed').length,
    runningCount: entries.filter((entry) => entry.status === 'running').length,
    unknownCount: entries.filter((entry) => entry.status === 'unknown').length,
    hasEvidence: entries.length > 0,
  }
}
