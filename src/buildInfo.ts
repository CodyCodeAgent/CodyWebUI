declare const __CODY_VERSION__: string
declare const __CODY_GIT_SHA__: string
declare const __CODY_BUILD_TIME__: string

export type BuildInfo = {
  version: string
  gitSha: string
  builtAt: string
  label: string
}

const version = __CODY_VERSION__
const gitSha = __CODY_GIT_SHA__

export const BUILD_INFO: BuildInfo = Object.freeze({
  version,
  gitSha,
  builtAt: __CODY_BUILD_TIME__,
  label: `v${version} · ${gitSha}`,
})
