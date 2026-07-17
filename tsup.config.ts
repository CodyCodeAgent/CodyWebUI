import { defineConfig } from 'tsup'
import { execFileSync } from 'node:child_process'

function readGitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const buildVersion = process.env.npm_package_version ?? '0.0.0'

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'dist-cli',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['better-sqlite3', 'commander', 'express'],
  define: {
    __CODY_VERSION__: JSON.stringify(buildVersion),
    __CODY_GIT_SHA__: JSON.stringify(readGitSha()),
    __CODY_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
