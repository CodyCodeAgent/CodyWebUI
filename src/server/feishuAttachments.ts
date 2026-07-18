import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, lstat, mkdir, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { FeishuMessageResource, FeishuResourceType } from './feishuMessageParser.js'

export const MAX_FEISHU_ATTACHMENT_BYTES = 100 * 1024 * 1024
export const DEFAULT_FEISHU_ATTACHMENT_ROOT = join(homedir(), '.cody-web-ui', 'feishu-attachments')
export const DEFAULT_FEISHU_ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
export const DEFAULT_FEISHU_ATTACHMENT_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
export const DEFAULT_FEISHU_ATTACHMENT_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000

const cleanupLastStartedAt = new Map<string, number>()
const cleanupInFlight = new Map<string, Promise<FeishuAttachmentCleanupReport | null>>()

export type FeishuDownloadedResource = FeishuMessageResource & {
  path: string
  sizeBytes: number
}

export type FeishuAttachmentCleanupReport = {
  scannedFiles: number
  deletedFiles: number
  deletedBytes: number
  remainingBytes: number
  errors: string[]
}

type FeishuAttachmentCleanupPolicy = {
  retentionMs: number
  maxTotalBytes: number
  scanIntervalMs: number
}

type CleanupFile = {
  path: string
  size: number
  mtimeMs: number
  partial: boolean
  deleted: boolean
}

const DEFAULT_EXTENSIONS: Record<FeishuResourceType, string> = {
  image: '.jpg',
  file: '',
  audio: '.opus',
  media: '.mp4',
  sticker: '.png',
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value.normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/gu, '_')
    .replace(/\.{2,}/gu, '_')
    .replace(/^\.+/u, '')
    .slice(0, 80)
  return normalized || fallback
}

export function safeFeishuAttachmentName(resource: FeishuMessageResource): string {
  const original = basename(resource.name.trim())
  const extension = extname(original).replace(/[^A-Za-z0-9.]+/gu, '').slice(0, 16)
    || DEFAULT_EXTENSIONS[resource.type]
  const stem = safeSegment(original.slice(0, Math.max(0, original.length - extname(original).length)), resource.type).slice(0, 96)
  const keyHash = createHash('sha256').update(resource.key).digest('hex').slice(0, 12)
  return `${stem}-${keyHash}${extension}`
}

function contentLength(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const record = headers as Record<string, unknown>
  const getter = typeof record.get === 'function' ? record.get as (name: string) => unknown : null
  const raw = record['content-length'] ?? record['Content-Length'] ?? getter?.('content-length')
  const parsed = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function byteLimitLabel(maxBytes: number): string {
  return maxBytes >= 1024 * 1024 ? `${String(Math.floor(maxBytes / 1024 / 1024))} MB` : `${String(maxBytes)} bytes`
}

function numericEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

export function feishuAttachmentCleanupPolicy(): FeishuAttachmentCleanupPolicy {
  const retentionDays = numericEnvironment('CODY_FEISHU_ATTACHMENT_RETENTION_DAYS', 7, 1 / 24, 3_650)
  return {
    retentionMs: retentionDays * 24 * 60 * 60 * 1_000,
    maxTotalBytes: Math.floor(numericEnvironment(
      'CODY_FEISHU_ATTACHMENT_MAX_TOTAL_BYTES',
      DEFAULT_FEISHU_ATTACHMENT_TOTAL_BYTES,
      10 * 1024 * 1024,
      1024 * 1024 * 1024 * 1024,
    )),
    scanIntervalMs: Math.floor(numericEnvironment(
      'CODY_FEISHU_ATTACHMENT_CLEANUP_INTERVAL_MS',
      DEFAULT_FEISHU_ATTACHMENT_CLEANUP_INTERVAL_MS,
      DEFAULT_FEISHU_ATTACHMENT_CLEANUP_INTERVAL_MS,
      7 * 24 * 60 * 60 * 1_000,
    )),
  }
}

async function collectCleanupEntries(rootDir: string): Promise<{ files: CleanupFile[]; directories: string[] }> {
  const files: CleanupFile[] = []
  const directories: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const target = join(directory, entry.name)
      assertWithinRoot(rootDir, target)
      // Dirent metadata can be stale. lstat ensures symlinks are never followed.
      const metadata = await lstat(target)
      if (metadata.isSymbolicLink()) throw new Error(`Refusing Feishu attachment cleanup because a symlink was found: ${target}`)
      if (metadata.isDirectory()) {
        directories.push(target)
        await visit(target)
      } else if (metadata.isFile()) {
        files.push({
          path: target,
          size: metadata.size,
          mtimeMs: metadata.mtimeMs,
          partial: entry.name.endsWith('.part'),
          deleted: false,
        })
      }
    }
  }

  let rootMetadata
  try {
    rootMetadata = await lstat(rootDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { files, directories }
    throw error
  }
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`Refusing Feishu attachment cleanup because the root is not a regular directory: ${rootDir}`)
  }
  await visit(rootDir)
  return { files, directories }
}

/**
 * Removes expired attachments first, then oldest files until the root is
 * within its capacity. The traversal never follows symlinks and active .part
 * files are counted but never removed.
 */
export async function cleanupFeishuAttachments(input: {
  rootDir?: string
  retentionMs?: number
  maxTotalBytes?: number
  nowMs?: number
} = {}): Promise<FeishuAttachmentCleanupReport> {
  const rootDir = resolve(input.rootDir ?? DEFAULT_FEISHU_ATTACHMENT_ROOT)
  const policy = feishuAttachmentCleanupPolicy()
  const retentionMs = Math.max(0, input.retentionMs ?? policy.retentionMs)
  const maxTotalBytes = Math.max(0, input.maxTotalBytes ?? policy.maxTotalBytes)
  const nowMs = input.nowMs ?? Date.now()
  const { files, directories } = await collectCleanupEntries(rootDir)
  const errors: string[] = []
  let remainingBytes = files.reduce((total, file) => total + file.size, 0)
  let deletedFiles = 0
  let deletedBytes = 0

  const removeFile = async (file: CleanupFile): Promise<void> => {
    if (file.partial || file.deleted) return
    try {
      const current = await lstat(file.path)
      if (current.isSymbolicLink()) throw new Error(`Refusing to remove a symlink: ${file.path}`)
      if (!current.isFile()) return
      await unlink(file.path)
      file.deleted = true
      deletedFiles += 1
      deletedBytes += current.size
      remainingBytes = Math.max(0, remainingBytes - current.size)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const oldestFirst = files.filter((file) => !file.partial).sort((first, second) => first.mtimeMs - second.mtimeMs)
  const expiresBefore = nowMs - retentionMs
  for (const file of oldestFirst) {
    if (file.mtimeMs < expiresBefore) await removeFile(file)
  }
  for (const file of oldestFirst) {
    if (remainingBytes <= maxTotalBytes) break
    await removeFile(file)
  }

  // Only remove now-empty regular directories, deepest first. A directory
  // containing an active .part or any other unknown entry remains untouched.
  for (const directory of directories.sort((first, second) => second.length - first.length)) {
    try {
      const current = await lstat(directory)
      if (current.isSymbolicLink()) throw new Error(`Refusing to remove a symlink: ${directory}`)
      if (current.isDirectory()) await rmdir(directory)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  return { scannedFiles: files.length, deletedFiles, deletedBytes, remainingBytes, errors }
}

/** Rate-limited background cleanup. Failures are logged and never reject a download. */
export function scheduleFeishuAttachmentCleanup(input: {
  rootDir?: string
  logger?: Pick<Console, 'warn'>
  nowMs?: number
  policy?: Partial<FeishuAttachmentCleanupPolicy>
} = {}): Promise<FeishuAttachmentCleanupReport | null> {
  const rootDir = resolve(input.rootDir ?? DEFAULT_FEISHU_ATTACHMENT_ROOT)
  const defaults = feishuAttachmentCleanupPolicy()
  const policy = { ...defaults, ...input.policy }
  const nowMs = input.nowMs ?? Date.now()
  const active = cleanupInFlight.get(rootDir)
  if (active) return active
  if (nowMs - (cleanupLastStartedAt.get(rootDir) ?? Number.NEGATIVE_INFINITY) < policy.scanIntervalMs) {
    return Promise.resolve(null)
  }
  cleanupLastStartedAt.set(rootDir, nowMs)
  const work = cleanupFeishuAttachments({
    rootDir,
    retentionMs: policy.retentionMs,
    maxTotalBytes: policy.maxTotalBytes,
    nowMs,
  }).then((report) => {
    for (const error of report.errors) input.logger?.warn(`[feishu] attachment cleanup warning: ${error}`)
    return report
  }).catch((error) => {
    input.logger?.warn(`[feishu] attachment cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }).finally(() => {
    if (cleanupInFlight.get(rootDir) === work) cleanupInFlight.delete(rootDir)
  })
  cleanupInFlight.set(rootDir, work)
  return work
}

function assertWithinRoot(rootDir: string, target: string): void {
  const normalizedRoot = `${resolve(rootDir)}/`
  if (!resolve(target).startsWith(normalizedRoot)) throw new Error('Unsafe Feishu attachment path')
}

/** Streams a Feishu resource to a private local directory without buffering it in memory. */
export async function persistFeishuAttachment(input: {
  botId: string
  messageId: string
  resource: FeishuMessageResource
  stream: Readable
  headers?: unknown
  rootDir?: string
  maxBytes?: number
}): Promise<FeishuDownloadedResource> {
  const rootDir = resolve(input.rootDir ?? DEFAULT_FEISHU_ATTACHMENT_ROOT)
  const maxBytes = input.maxBytes ?? MAX_FEISHU_ATTACHMENT_BYTES
  const declaredBytes = contentLength(input.headers)
  if (declaredBytes !== undefined && declaredBytes > maxBytes) {
    input.stream.destroy()
    throw new Error(`Attachment is larger than ${byteLimitLabel(maxBytes)}`)
  }

  const botBucket = safeSegment(input.botId, 'bot')
  const messageBucket = safeSegment(input.messageId, 'message')
  const directory = join(rootDir, botBucket, messageBucket)
  const target = join(directory, safeFeishuAttachmentName(input.resource))
  const temporary = join(directory, `.${randomUUID()}.part`)
  assertWithinRoot(rootDir, target)
  assertWithinRoot(rootDir, temporary)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(rootDir, 0o700).catch(() => undefined)
  await chmod(join(rootDir, botBucket), 0o700).catch(() => undefined)
  await chmod(directory, 0o700).catch(() => undefined)

  let sizeBytes = 0
  const limiter = new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
      sizeBytes += bytes
      if (sizeBytes > maxBytes) callback(new Error(`Attachment is larger than ${byteLimitLabel(maxBytes)}`))
      else callback(null, chunk)
    },
  })

  try {
    const destination = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
    await new Promise<void>((resolveOpen, rejectOpen) => {
      const onOpen = () => { destination.off('error', onError); resolveOpen() }
      const onError = (error: Error) => { destination.off('open', onOpen); rejectOpen(error) }
      destination.once('open', onOpen)
      destination.once('error', onError)
    })
    // The .part marker is present before cleanup starts, so the scanner can
    // never remove this in-flight download or its containing directory.
    void scheduleFeishuAttachmentCleanup({ rootDir, logger: console })
    await pipeline(input.stream, limiter, destination)
    if (sizeBytes === 0) throw new Error('Attachment is empty')
    await rename(temporary, target)
    await chmod(target, 0o600)
    const saved = await stat(target)
    void scheduleFeishuAttachmentCleanup({ rootDir, logger: console })
    return { ...input.resource, path: target, sizeBytes: saved.size }
  } catch (error) {
    input.stream.destroy()
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
