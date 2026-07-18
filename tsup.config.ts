import { defineConfig } from 'tsup'
import { fileURLToPath } from 'node:url'
import { readBuildMetadata } from './scripts/build-metadata.mjs'

const buildVersion = process.env.npm_package_version ?? '0.0.0'
const buildMetadata = readBuildMetadata(fileURLToPath(new URL('.', import.meta.url)))

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
    __CODY_GIT_SHA__: JSON.stringify(buildMetadata.gitSha),
    __CODY_GIT_DIRTY__: JSON.stringify(buildMetadata.dirty),
    __CODY_SOURCE_FINGERPRINT__: JSON.stringify(buildMetadata.sourceFingerprint),
    __CODY_BUILD_ID__: JSON.stringify(buildMetadata.buildId),
    __CODY_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
