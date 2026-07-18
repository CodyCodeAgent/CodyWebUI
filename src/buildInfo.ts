declare const __CODY_VERSION__: string
declare const __CODY_GIT_SHA__: string
declare const __CODY_GIT_DIRTY__: boolean
declare const __CODY_SOURCE_FINGERPRINT__: string
declare const __CODY_BUILD_ID__: string
declare const __CODY_BUILD_TIME__: string

export type BuildInfo = {
  version: string
  gitSha: string
  gitDirty: boolean
  sourceFingerprint: string
  buildId: string
  builtAt: string
  label: string
}

const version = __CODY_VERSION__
const gitSha = __CODY_GIT_SHA__

export const BUILD_INFO: BuildInfo = Object.freeze({
  version,
  gitSha,
  gitDirty: __CODY_GIT_DIRTY__,
  sourceFingerprint: __CODY_SOURCE_FINGERPRINT__,
  buildId: __CODY_BUILD_ID__,
  builtAt: __CODY_BUILD_TIME__,
  label: `v${version} · ${__CODY_BUILD_ID__}`,
})
