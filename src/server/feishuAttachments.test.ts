import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupFeishuAttachments,
  feishuAttachmentCleanupPolicy,
  persistFeishuAttachment,
  safeFeishuAttachmentName,
  scheduleFeishuAttachmentCleanup,
} from './feishuAttachments'

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cody-feishu-attachment-'))
  temporaryRoots.push(directory)
  return directory
}

describe('Feishu attachment persistence', () => {
  it('reads bounded cleanup policy overrides from the environment', () => {
    vi.stubEnv('CODY_FEISHU_ATTACHMENT_RETENTION_DAYS', '2')
    vi.stubEnv('CODY_FEISHU_ATTACHMENT_MAX_TOTAL_BYTES', '12345678')
    vi.stubEnv('CODY_FEISHU_ATTACHMENT_CLEANUP_INTERVAL_MS', '1000')

    expect(feishuAttachmentCleanupPolicy()).toEqual({
      retentionMs: 2 * 24 * 60 * 60 * 1_000,
      maxTotalBytes: 12_345_678,
      scanIntervalMs: 60 * 60 * 1_000,
    })
  })

  it('sanitizes user-controlled names and streams into a private bucket', async () => {
    const rootDir = await temporaryRoot()
    const saved = await persistFeishuAttachment({
      botId: '../bot/one',
      messageId: '../../message',
      resource: { type: 'file', key: 'file-key', name: '../../产品 需求.pdf' },
      stream: Readable.from(Buffer.from('document body')),
      rootDir,
    })

    expect(saved.path.startsWith(`${rootDir}/`)).toBe(true)
    expect(saved.path).not.toContain('..')
    expect(saved.path).toMatch(/\.pdf$/u)
    expect(await readFile(saved.path, 'utf8')).toBe('document body')
    expect((await stat(saved.path)).mode & 0o777).toBe(0o600)
  })

  it('rejects oversized streams and removes partial files', async () => {
    const rootDir = await temporaryRoot()
    await expect(persistFeishuAttachment({
      botId: 'bot',
      messageId: 'message',
      resource: { type: 'image', key: 'image-key', name: 'screen.png' },
      stream: Readable.from(Buffer.alloc(9)),
      rootDir,
      maxBytes: 8,
    })).rejects.toThrow('larger than 8 bytes')

    const expected = join(rootDir, 'bot', 'message', safeFeishuAttachmentName({ type: 'image', key: 'image-key', name: 'screen.png' }))
    await expect(stat(expected)).rejects.toThrow()
  })

  it('rejects oversized declared content before consuming the stream', async () => {
    const rootDir = await temporaryRoot()
    const source = Readable.from(Buffer.alloc(2))
    await expect(persistFeishuAttachment({
      botId: 'bot',
      messageId: 'message',
      resource: { type: 'audio', key: 'audio-key', name: 'voice' },
      stream: source,
      headers: { 'content-length': '20' },
      rootDir,
      maxBytes: 10,
    })).rejects.toThrow('larger than 10 bytes')
    expect(source.destroyed).toBe(true)
  })

  it('deletes expired files first, then the oldest files until under capacity', async () => {
    const rootDir = await temporaryRoot()
    const bucket = join(rootDir, 'bot', 'message')
    await mkdir(bucket, { recursive: true })
    const expired = join(bucket, 'expired.txt')
    const oldest = join(bucket, 'oldest.txt')
    const newest = join(bucket, 'newest.txt')
    await Promise.all([
      writeFile(expired, 'xxxx'),
      writeFile(oldest, 'yyyy'),
      writeFile(newest, 'zzzz'),
    ])
    const nowMs = Date.parse('2026-07-18T00:00:00.000Z')
    await utimes(expired, new Date(nowMs - 10 * 24 * 60 * 60 * 1_000), new Date(nowMs - 10 * 24 * 60 * 60 * 1_000))
    await utimes(oldest, new Date(nowMs - 2 * 24 * 60 * 60 * 1_000), new Date(nowMs - 2 * 24 * 60 * 60 * 1_000))
    await utimes(newest, new Date(nowMs), new Date(nowMs))

    const report = await cleanupFeishuAttachments({
      rootDir,
      nowMs,
      retentionMs: 7 * 24 * 60 * 60 * 1_000,
      maxTotalBytes: 5,
    })

    expect(report).toMatchObject({ scannedFiles: 3, deletedFiles: 2, deletedBytes: 8, remainingBytes: 4, errors: [] })
    await expect(stat(expired)).rejects.toThrow()
    await expect(stat(oldest)).rejects.toThrow()
    expect((await readFile(newest, 'utf8'))).toBe('zzzz')
  })

  it('never removes active partial files even when expired or over capacity', async () => {
    const rootDir = await temporaryRoot()
    const bucket = join(rootDir, 'bot', 'message')
    await mkdir(bucket, { recursive: true })
    const partial = join(bucket, '.download.part')
    const completed = join(bucket, 'completed.txt')
    await writeFile(partial, 'partial-data')
    await writeFile(completed, 'done')
    const nowMs = Date.now()
    const old = new Date(nowMs - 10 * 24 * 60 * 60 * 1_000)
    await utimes(partial, old, old)
    await utimes(completed, old, old)

    const report = await cleanupFeishuAttachments({ rootDir, nowMs, retentionMs: 1, maxTotalBytes: 0 })

    expect(await readFile(partial, 'utf8')).toBe('partial-data')
    await expect(stat(completed)).rejects.toThrow()
    expect(report.remainingBytes).toBe(Buffer.byteLength('partial-data'))
  })

  it('fails closed on symlinks before deleting any attachment', async () => {
    const rootDir = await temporaryRoot()
    const outside = await temporaryRoot()
    const bucket = join(rootDir, 'bot')
    await mkdir(bucket)
    const attachment = join(bucket, 'old.txt')
    await writeFile(attachment, 'keep')
    await symlink(outside, join(bucket, 'outside-link'))

    await expect(cleanupFeishuAttachments({ rootDir, retentionMs: 0, maxTotalBytes: 0 }))
      .rejects.toThrow('symlink was found')
    expect(await readFile(attachment, 'utf8')).toBe('keep')
  })

  it('rate-limits scans and logs failures without rejecting callers', async () => {
    const rootDir = await temporaryRoot()
    const bucket = join(rootDir, 'bot')
    await mkdir(bucket)
    const nowMs = Date.now()
    await expect(scheduleFeishuAttachmentCleanup({
      rootDir,
      nowMs,
      policy: { retentionMs: 0, maxTotalBytes: 0, scanIntervalMs: 60 * 60 * 1_000 },
    })).resolves.toMatchObject({ scannedFiles: 0 })

    const lateFile = join(bucket, 'late.txt')
    await mkdir(bucket, { recursive: true })
    await writeFile(lateFile, 'late')
    await expect(scheduleFeishuAttachmentCleanup({
      rootDir,
      nowMs: nowMs + 1_000,
      policy: { retentionMs: 0, maxTotalBytes: 0, scanIntervalMs: 60 * 60 * 1_000 },
    })).resolves.toBeNull()
    expect(await readFile(lateFile, 'utf8')).toBe('late')

    const warnings: string[] = []
    await symlink(await temporaryRoot(), join(bucket, 'bad-link'))
    await expect(scheduleFeishuAttachmentCleanup({
      rootDir,
      nowMs: nowMs + 60 * 60 * 1_000,
      logger: { warn: (message) => warnings.push(message) },
      policy: { retentionMs: 0, maxTotalBytes: 0, scanIntervalMs: 60 * 60 * 1_000 },
    })).resolves.toBeNull()
    expect(warnings[0]).toContain('symlink was found')
    expect(await readFile(lateFile, 'utf8')).toBe('late')
  })
})
