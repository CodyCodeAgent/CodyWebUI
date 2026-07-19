import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discoverCodexGeneratedReplyImages,
  extractFeishuToolReplyImages,
  prepareFeishuReplyMarkdown,
} from './feishuReplyImages'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('Feishu reply images', () => {
  it('extracts and deduplicates generated image data from MCP results', () => {
    const data = Buffer.from('png-data').toString('base64')
    const images = extractFeishuToolReplyImages({
      method: 'item/completed',
      params: {
        item: {
          type: 'mcpToolCall',
          result: {
            content: [{ type: 'image', data, mimeType: 'image/png', alt: 'Architecture' }],
            structuredContent: { image_url: `data:image/png;base64,${data}`, output_hint: 'Architecture' },
          },
        },
      },
    })
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ mimeType: 'image/png', alt: 'Architecture' })
    expect(images[0].buffer.toString()).toBe('png-data')
  })

  it('uploads local Markdown images, keeps fences safe, and never fetches remote URLs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cody-feishu-image-'))
    temporaryDirectories.push(directory)
    await writeFile(join(directory, 'diagram.png'), Buffer.from('local-png'))
    const upload = vi.fn(async () => 'img_v2_uploaded')
    const result = await prepareFeishuReplyMarkdown({
      cwd: directory,
      markdown: [
        '# Result',
        '',
        '![Diagram](./diagram.png)',
        '',
        '![Remote](https://example.com/a.png)',
        '',
        '```md',
        '![Literal](./diagram.png)',
        '```',
      ].join('\n'),
      upload,
    })

    expect(upload).toHaveBeenCalledOnce()
    expect(result).toContain('![Diagram](img_v2_uploaded)')
    expect(result).toContain('[Remote](https://example.com/a.png)')
    expect(result).toContain('```md\n![Literal](./diagram.png)\n```')
  })

  it('appends unreferenced generated images and reuses an existing upload by fingerprint', async () => {
    const upload = vi.fn(async () => 'should-not-upload')
    const result = await prepareFeishuReplyMarkdown({
      cwd: tmpdir(),
      markdown: 'Done.',
      upload,
      appendedImages: [{ imageKey: 'img_v2_generated', alt: 'Poster', fingerprint: 'same' }],
    })
    expect(upload).not.toHaveBeenCalled()
    expect(result).toBe('Done.\n\n![Poster](img_v2_generated)')
  })

  it('recovers only current-turn regular images from the Codex thread directory', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'cody-feishu-codex-home-'))
    temporaryDirectories.push(codexHome)
    const threadId = '019f7a69-6e2d-7733-a633-5b8922262a34'
    const imageDirectory = join(codexHome, 'generated_images', threadId)
    await mkdir(imageDirectory, { recursive: true })
    const startedAtMs = Date.now() - 1_000
    const oldImage = join(imageDirectory, 'old.png')
    await writeFile(oldImage, Buffer.from('old-image'))
    await utimes(oldImage, new Date(startedAtMs - 10_000), new Date(startedAtMs - 10_000))
    await writeFile(join(imageDirectory, 'current.png'), Buffer.from('current-image'))
    await writeFile(join(imageDirectory, 'notes.txt'), Buffer.from('not-an-image'))
    await symlink(oldImage, join(imageDirectory, 'linked.png'))

    const images = await discoverCodexGeneratedReplyImages({ threadId, startedAtMs, codexHome })

    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ fileName: 'current.png', mimeType: 'image/png', alt: 'AI 生成图片' })
    expect(images[0].buffer.toString()).toBe('current-image')
  })
})
