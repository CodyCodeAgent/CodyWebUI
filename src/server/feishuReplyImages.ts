import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'

const MAX_FEISHU_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REPLY_IMAGES = 9
const FEISHU_IMAGE_KEY = /^img_v\d+_[A-Za-z0-9_-]+$/iu
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
}

export type FeishuImageUpload = {
  buffer: Buffer
  fileName: string
  mimeType: string
}

export type FeishuReplyImageSource = FeishuImageUpload & {
  alt: string
  fingerprint: string
}

export type FeishuUploadedReplyImage = {
  imageKey: string
  alt: string
  fingerprint: string
}

/**
 * Discover images produced by Codex's built-in image generation tool.
 *
 * Built-in image generation currently arrives as a raw Codex event rather
 * than an `item/completed` MCP result. Codex also stores the final files in a
 * thread-scoped directory, so terminal reply preparation can safely recover
 * images created during the current turn without inspecting arbitrary files.
 */
export async function discoverCodexGeneratedReplyImages(input: {
  threadId: string
  startedAtMs: number
  codexHome?: string
}): Promise<FeishuReplyImageSource[]> {
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(input.threadId)) return []
  if (!Number.isFinite(input.startedAtMs) || input.startedAtMs <= 0) return []

  const configuredHome = input.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex')
  const requestedDirectory = resolve(configuredHome, 'generated_images', input.threadId)
  const directory = await realpath(requestedDirectory).catch(() => '')
  if (!directory) return []
  const generatedRoot = await realpath(resolve(configuredHome, 'generated_images')).catch(() => '')
  if (!generatedRoot || !isWithin(directory, generatedRoot)) return []

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const candidates: Array<{ path: string; name: string; mimeType: string; mtimeMs: number }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const mimeType = IMAGE_MIME_BY_EXTENSION[extname(entry.name).toLowerCase()]
    if (!mimeType) continue
    const path = resolve(directory, entry.name)
    const filePath = await realpath(path).catch(() => '')
    if (!filePath || !isWithin(filePath, directory)) continue
    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat?.isFile() || fileStat.size === 0 || fileStat.size > MAX_FEISHU_IMAGE_BYTES) continue
    // Allow a small timestamp tolerance for filesystems with coarse mtimes.
    if (fileStat.mtimeMs < input.startedAtMs - 2_000) continue
    candidates.push({ path: filePath, name: entry.name, mimeType, mtimeMs: fileStat.mtimeMs })
  }

  candidates.sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name))
  const images: FeishuReplyImageSource[] = []
  const fingerprints = new Set<string>()
  for (const candidate of candidates) {
    if (images.length >= MAX_REPLY_IMAGES) break
    const buffer = await readFile(candidate.path).catch(() => null)
    if (!buffer) continue
    const fingerprint = createHash('sha256').update(buffer).digest('hex')
    if (fingerprints.has(fingerprint)) continue
    fingerprints.add(fingerprint)
    images.push({
      buffer,
      fileName: candidate.name,
      mimeType: candidate.mimeType,
      alt: 'AI 生成图片',
      fingerprint,
    })
  }
  return images
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function cleanAlt(value: unknown): string {
  return (typeof value === 'string' ? value : '').replace(/[\r\n\t]+/gu, ' ').trim().slice(0, 120) || 'AI 生成图片'
}

function parseDataUrl(value: unknown, alt: string): FeishuReplyImageSource | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:(image\/(?:bmp|gif|heic|x-icon|jpeg|png|tiff|webp));base64,([A-Za-z0-9+/=\s]+)$/iu)
  if (!match) return null
  const buffer = Buffer.from(match[2].replace(/\s/gu, ''), 'base64')
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FEISHU_IMAGE_BYTES) return null
  const mimeType = match[1].toLowerCase()
  const extension = Object.entries(IMAGE_MIME_BY_EXTENSION).find(([, mime]) => mime === mimeType)?.[0] ?? '.png'
  return {
    buffer,
    fileName: `generated-image${extension}`,
    mimeType,
    alt,
    fingerprint: createHash('sha256').update(buffer).digest('hex'),
  }
}

/** Extract image blocks returned by an MCP/image-generation tool completion. */
export function extractFeishuToolReplyImages(notification: { method: string; params?: unknown }): FeishuReplyImageSource[] {
  if (notification.method !== 'item/completed') return []
  const item = asRecord(asRecord(notification.params)?.item)
  if (item?.type !== 'mcpToolCall') return []
  const result = asRecord(item.result)
  if (!result) return []

  const found: FeishuReplyImageSource[] = []
  const seenObjects = new Set<object>()
  const visit = (value: unknown, inheritedAlt = 'AI 生成图片', depth = 0): void => {
    if (depth > 8 || found.length >= MAX_REPLY_IMAGES) return
    if (typeof value === 'string') {
      const parsed = parseDataUrl(value, inheritedAlt)
      if (parsed) found.push(parsed)
      return
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, inheritedAlt, depth + 1)
      return
    }
    const row = asRecord(value)
    if (!row || seenObjects.has(row)) return
    seenObjects.add(row)
    const alt = cleanAlt(row.alt ?? row.output_hint ?? inheritedAlt)
    const direct = parseDataUrl(row.image_url ?? row.imageUrl, alt)
    if (direct) found.push(direct)
    if (typeof row.data === 'string' && typeof row.mimeType === 'string') {
      const parsed = parseDataUrl(`data:${row.mimeType};base64,${row.data}`, alt)
      if (parsed) found.push(parsed)
    } else if (typeof row.data === 'string' && typeof row.mime_type === 'string') {
      const parsed = parseDataUrl(`data:${row.mime_type};base64,${row.data}`, alt)
      if (parsed) found.push(parsed)
    }
    for (const [key, child] of Object.entries(row)) {
      if (['image_url', 'imageUrl', 'data'].includes(key)) continue
      visit(child, alt, depth + 1)
    }
  }
  visit(result)

  const fingerprints = new Set<string>()
  return found.filter((image) => {
    if (fingerprints.has(image.fingerprint)) return false
    fingerprints.add(image.fingerprint)
    return true
  }).slice(0, MAX_REPLY_IMAGES)
}

function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

function decodeImagePath(source: string): string {
  let value = source.trim().replace(/^<|>$/gu, '')
  if (value.startsWith('sandbox:')) value = value.slice('sandbox:'.length)
  if (value.startsWith('file://')) {
    try { value = new URL(value).pathname } catch { return '' }
  }
  try { return decodeURIComponent(value) } catch { return value }
}

async function readMarkdownImage(source: string, cwd: string): Promise<FeishuReplyImageSource | null> {
  const dataImage = parseDataUrl(source, 'AI 生成图片')
  if (dataImage) return dataImage
  const decoded = decodeImagePath(source)
  if (!decoded || /^[a-z][a-z\d+.-]*:/iu.test(decoded)) return null
  const requested = resolve(cwd, decoded)
  const [filePath, projectRoot, tempRoot] = await Promise.all([
    realpath(requested).catch(() => ''),
    realpath(cwd).catch(() => resolve(cwd)),
    realpath(tmpdir()).catch(() => resolve(tmpdir())),
  ])
  if (!filePath || (!isWithin(filePath, projectRoot) && !isWithin(filePath, tempRoot))) return null
  const mimeType = IMAGE_MIME_BY_EXTENSION[extname(filePath).toLowerCase()]
  if (!mimeType) return null
  const fileStat = await stat(filePath).catch(() => null)
  if (!fileStat?.isFile() || fileStat.size === 0 || fileStat.size > MAX_FEISHU_IMAGE_BYTES) return null
  const buffer = await readFile(filePath)
  return {
    buffer,
    fileName: basename(filePath),
    mimeType,
    alt: 'AI 生成图片',
    fingerprint: createHash('sha256').update(buffer).digest('hex'),
  }
}

type MarkdownImageMatch = { full: string; alt: string; source: string }

function imageMatches(line: string): MarkdownImageMatch[] {
  const pattern = /!\[([^\]\r\n]*)\]\((<[^>\r\n]+>|[^)\s\r\n]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/gu
  return Array.from(line.matchAll(pattern), (match) => ({ full: match[0], alt: match[1], source: match[2] }))
}

/**
 * Upload local/data-URL images referenced by assistant Markdown and replace
 * their destinations with Feishu image keys. Remote URLs stay clickable and
 * are never fetched by the server.
 */
export async function prepareFeishuReplyMarkdown(input: {
  markdown: string
  cwd: string
  upload: (image: FeishuImageUpload) => Promise<string>
  appendedImages?: FeishuUploadedReplyImage[]
}): Promise<string> {
  const uploadedByFingerprint = new Map(input.appendedImages?.map((image) => [image.fingerprint, image.imageKey]) ?? [])
  const appended = [...(input.appendedImages ?? [])]
  const lines: string[] = []
  let fenceChar = ''
  let fenceLength = 0

  for (const originalLine of input.markdown.split('\n')) {
    const fence = originalLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u)
    if (fence) {
      const run = fence[1]
      if (!fenceChar) { fenceChar = run[0]; fenceLength = run.length }
      else if (run[0] === fenceChar && run.length >= fenceLength && !fence[2].trim()) { fenceChar = ''; fenceLength = 0 }
      lines.push(originalLine)
      continue
    }
    if (fenceChar) { lines.push(originalLine); continue }

    let line = originalLine
    for (const match of imageMatches(originalLine)) {
      const source = match.source.replace(/^<|>$/gu, '')
      if (FEISHU_IMAGE_KEY.test(source)) continue
      if (/^https?:\/\//iu.test(source)) {
        line = line.replace(match.full, `[${cleanAlt(match.alt)}](${source})`)
        continue
      }
      const image = await readMarkdownImage(source, input.cwd)
      if (!image) {
        line = line.replace(match.full, `*图片未能发送：${cleanAlt(match.alt)}*`)
        continue
      }
      image.alt = cleanAlt(match.alt)
      let imageKey = uploadedByFingerprint.get(image.fingerprint)
      if (!imageKey) {
        if (uploadedByFingerprint.size >= MAX_REPLY_IMAGES) {
          line = line.replace(match.full, `*图片数量超过单次回复上限：${image.alt}*`)
          continue
        }
        try {
          imageKey = await input.upload(image)
          uploadedByFingerprint.set(image.fingerprint, imageKey)
        } catch {
          line = line.replace(match.full, `*图片上传失败：${image.alt}*`)
          continue
        }
      }
      line = line.replace(match.full, `![${image.alt}](${imageKey})`)
      const appendedIndex = appended.findIndex((item) => item.fingerprint === image.fingerprint)
      if (appendedIndex >= 0) appended.splice(appendedIndex, 1)
    }
    lines.push(line)
  }

  const trailing = appended.map((image) => `![${cleanAlt(image.alt)}](${image.imageKey})`).join('\n\n')
  return [lines.join('\n').trim(), trailing].filter(Boolean).join('\n\n')
}

export const feishuReplyImageLimits = {
  maxBytes: MAX_FEISHU_IMAGE_BYTES,
  maxImages: MAX_REPLY_IMAGES,
}
