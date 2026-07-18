import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readBuildMetadata } from '../scripts/build-metadata.mjs'

const tempDirs: string[] = []

function git(directory: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('build metadata', () => {
  it('changes for source edits but ignores transient build output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cody-build-metadata-'))
    tempDirs.push(directory)
    await writeFile(join(directory, '.gitignore'), 'dist/\n*.config.bundled_*.mjs\n')
    await writeFile(join(directory, 'app.ts'), 'export const value = 1\n')
    git(directory, 'init', '--quiet')
    git(directory, 'config', 'user.email', 'build-test@example.invalid')
    git(directory, 'config', 'user.name', 'Build Test')
    git(directory, 'add', '.')
    git(directory, 'commit', '--quiet', '-m', 'initial')

    const clean = readBuildMetadata(directory)
    expect(clean).toMatchObject({ dirty: false })
    expect(clean.sourceFingerprint).toMatch(/^[0-9a-f]{16}$/)

    await writeFile(join(directory, 'tsup.config.bundled_transient.mjs'), 'temporary\n')
    expect(readBuildMetadata(directory)).toEqual(clean)

    await writeFile(join(directory, 'app.ts'), 'export const value = 2\n')
    const trackedEdit = readBuildMetadata(directory)
    expect(trackedEdit.dirty).toBe(true)
    expect(trackedEdit.sourceFingerprint).not.toBe(clean.sourceFingerprint)

    await writeFile(join(directory, 'new-source.ts'), 'export const added = true\n')
    const untrackedEdit = readBuildMetadata(directory)
    expect(untrackedEdit.sourceFingerprint).not.toBe(trackedEdit.sourceFingerprint)
  })
})
