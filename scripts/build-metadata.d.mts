export type BuildMetadata = {
  gitSha: string
  dirty: boolean
  sourceFingerprint: string
  buildId: string
}

export function readBuildMetadata(projectDir?: string): BuildMetadata
