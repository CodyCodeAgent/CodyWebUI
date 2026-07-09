import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const interactivePattern = /<(button|input|select|textarea)\b|<a\b[^>]*\bhref\s*=/i

function vueFilesUnder(directory: string): string[] {
  const entries = readdirSync(directory)
  return entries.flatMap((entry) => {
    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) return vueFilesUnder(absolutePath)
    return entry.endsWith('.vue') ? [absolutePath] : []
  })
}

function summaryBlocks(source: string): string[] {
  return Array.from(source.matchAll(/<summary\b[^>]*>[\s\S]*?<\/summary>/gi), (match) => match[0])
}

describe('summary accessibility', () => {
  it('keeps interactive controls out of summary elements', () => {
    const componentRoot = join(process.cwd(), 'src/components')
    const offenders = vueFilesUnder(componentRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return summaryBlocks(source)
        .filter((block) => interactivePattern.test(block))
        .map((block) => ({
          filePath,
          summary: block.replace(/\s+/g, ' ').slice(0, 160),
        }))
    })

    expect(offenders).toEqual([])
  })
})
