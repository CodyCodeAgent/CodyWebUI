export type ValidationTestSummary = {
  total: number | null
  passed: number | null
  failed: number | null
  skipped: number | null
  rawLines: string[]
}

export type ValidationCoverageSummary = {
  statements: number | null
  branches: number | null
  functions: number | null
  lines: number | null
  rawLines: string[]
}

export type ValidationOutputSummary = {
  tests: ValidationTestSummary | null
  coverage: ValidationCoverageSummary | null
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const normalized = value.trim().replace(/%$/u, '')
  if (!normalized || /^unknown$/iu.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function addCount(summary: {
  total: number | null
  passed: number | null
  failed: number | null
  skipped: number | null
}, kind: string, value: number): void {
  if (/^(?:passed|passing|pass)$/iu.test(kind)) {
    summary.passed = (summary.passed ?? 0) + value
    return
  }
  if (/^(?:failed|failing|failure|failures|fail)$/iu.test(kind)) {
    summary.failed = (summary.failed ?? 0) + value
    return
  }
  if (/^(?:skipped|skip|pending|todo)$/iu.test(kind)) {
    summary.skipped = (summary.skipped ?? 0) + value
    return
  }
  if (/^total$/iu.test(kind)) {
    summary.total = value
  }
}

export function parseValidationTestSummary(output: string): ValidationTestSummary | null {
  const rawLines: string[] = []
  const summary = {
    total: null as number | null,
    passed: null as number | null,
    failed: null as number | null,
    skipped: null as number | null,
  }

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('>')) continue
    const looksLikeTestSummary =
      /\btests?\b.*\b(?:passed|passing|failed|failing|skipped|pending|todo|total)\b/iu.test(trimmed) ||
      /^(?:\d+\s+(?:passed|passing|failed|skipped|pending|todo)(?:,?\s+|$)){1,}/iu.test(trimmed)
    if (!looksLikeTestSummary) continue

    let matched = false
    const countTestsMatch = trimmed.match(/^(\d+)\s+tests?\s+(passed|passing|failed|failing|skipped|pending|todo)\b/iu)
    if (countTestsMatch) {
      const value = Number(countTestsMatch[1])
      if (Number.isFinite(value)) {
        addCount(summary, countTestsMatch[2], value)
        matched = true
      }
    }

    for (const match of trimmed.matchAll(/(\d+)\s+(passed|passing|pass|failed|failing|failure|failures|fail|skipped|skip|pending|todo|total)\b/giu)) {
      const value = Number(match[1])
      if (!Number.isFinite(value)) continue
      addCount(summary, match[2], value)
      matched = true
    }

    if (!matched) {
      const vitestMatch = trimmed.match(/\bTests?\b\s+(\d+)\s+(passed|failed|skipped)\b(?:\s+\((\d+)\))?/iu)
      if (vitestMatch) {
        const value = Number(vitestMatch[1])
        if (Number.isFinite(value)) {
          addCount(summary, vitestMatch[2], value)
          const total = Number(vitestMatch[3])
          if (Number.isFinite(total)) summary.total = total
          matched = true
        }
      }
    }

    if (matched) rawLines.push(trimmed)
  }

  const derivedTotal = (summary.passed ?? 0) + (summary.failed ?? 0) + (summary.skipped ?? 0)
  if (summary.total === null && derivedTotal > 0) summary.total = derivedTotal
  if (rawLines.length === 0 && summary.total === null) return null

  return {
    ...summary,
    rawLines: rawLines.slice(0, 4),
  }
}

function setCoverageValue(
  summary: Omit<ValidationCoverageSummary, 'rawLines'>,
  name: string,
  value: number | null,
): void {
  const normalized = name.trim().toLowerCase()
  if (normalized.startsWith('stmt') || normalized.startsWith('statement')) summary.statements = value
  if (normalized.startsWith('branch')) summary.branches = value
  if (normalized.startsWith('func') || normalized.startsWith('function')) summary.functions = value
  if (normalized.startsWith('line')) summary.lines = value
}

export function parseValidationCoverageSummary(output: string): ValidationCoverageSummary | null {
  const summary = {
    statements: null as number | null,
    branches: null as number | null,
    functions: null as number | null,
    lines: null as number | null,
  }
  const rawLines: string[] = []

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^all files\s*\|/iu.test(trimmed)) {
      const cells = trimmed.split('|').map((cell) => cell.trim())
      if (cells.length >= 5) {
        summary.statements = parseNumber(cells[1])
        summary.branches = parseNumber(cells[2])
        summary.functions = parseNumber(cells[3])
        summary.lines = parseNumber(cells[4])
        rawLines.push(trimmed)
      }
      continue
    }

    const namedMatch = trimmed.match(/^(Statements?|Branches?|Functions?|Lines?)\s*:\s*([0-9.]+%?|Unknown)/iu)
    if (namedMatch) {
      setCoverageValue(summary, namedMatch[1], parseNumber(namedMatch[2]))
      rawLines.push(trimmed)
    }
  }

  if (
    summary.statements === null &&
    summary.branches === null &&
    summary.functions === null &&
    summary.lines === null
  ) {
    return null
  }

  return {
    ...summary,
    rawLines: rawLines.slice(0, 6),
  }
}

export function parseValidationOutputSummary(output: string): ValidationOutputSummary {
  return {
    tests: parseValidationTestSummary(output),
    coverage: parseValidationCoverageSummary(output),
  }
}
