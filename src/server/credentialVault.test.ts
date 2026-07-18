import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openCredential, sealCredential } from './credentialVault'

let tempDir = ''

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('credentialVault', () => {
  it('encrypts with authenticated context and a private persistent key', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cody-credentials-'))
    const keyPath = join(tempDir, 'credentials.key')
    const sealed = sealCredential('super-secret', 'feishu:bot-1', keyPath)
    expect(sealed).not.toContain('super-secret')
    expect(openCredential(sealed, 'feishu:bot-1', keyPath)).toBe('super-secret')
    expect(() => openCredential(sealed, 'feishu:bot-2', keyPath)).toThrow()
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
    expect(await readFile(keyPath, 'utf8')).not.toContain('super-secret')
  })

  it('rejects tampered ciphertext', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cody-credentials-'))
    const keyPath = join(tempDir, 'credentials.key')
    const sealed = sealCredential('session-cookie', 'session', keyPath)
    const tampered = `${sealed.slice(0, -2)}AA`
    expect(() => openCredential(tampered, 'session', keyPath)).toThrow()
    await writeFile(join(tempDir, 'evidence.txt'), sealed)
  })
})
