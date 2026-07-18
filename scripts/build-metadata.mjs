import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function runGit(projectDir, args, options = {}) {
  return execFileSync('git', args, {
    cwd: projectDir,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function addFramed(hash, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  hash.update(String(buffer.length))
  hash.update(':')
  hash.update(buffer)
}

function readSourceFingerprint(projectDir) {
  try {
    const output = runGit(projectDir, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
    ], { encoding: 'buffer' })
    const files = output.toString('utf8').split('\0').filter(Boolean).sort()
    const hash = createHash('sha256')

    for (const relativePath of files) {
      addFramed(hash, relativePath)
      try {
        const stat = lstatSync(resolve(projectDir, relativePath))
        if (stat.isSymbolicLink()) {
          addFramed(hash, 'symlink')
          addFramed(hash, readlinkSync(resolve(projectDir, relativePath)))
        } else if (stat.isFile()) {
          addFramed(hash, stat.mode & 0o111 ? 'executable' : 'file')
          addFramed(hash, readFileSync(resolve(projectDir, relativePath)))
        } else {
          addFramed(hash, 'unsupported')
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        addFramed(hash, 'deleted')
      }
    }

    return hash.digest('hex').slice(0, 16)
  } catch {
    return 'unknown'
  }
}

export function readBuildMetadata(projectDir = DEFAULT_PROJECT_DIR) {
  let gitSha = 'unknown'
  let dirty = false
  try {
    gitSha = runGit(projectDir, ['rev-parse', '--short=12', 'HEAD']).trim() || 'unknown'
    dirty = runGit(projectDir, ['status', '--porcelain=v1', '--untracked-files=all']).trim().length > 0
  } catch {
    // Source archives may not include Git metadata.
  }

  const sourceFingerprint = readSourceFingerprint(projectDir)
  const buildId = `${gitSha}${dirty ? '-dirty' : ''}.${sourceFingerprint}`
  return { gitSha, dirty, sourceFingerprint, buildId }
}
