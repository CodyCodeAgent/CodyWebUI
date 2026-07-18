import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { localDatabasePath } from './localDatabase.js'

const PREFIX = 'cody-credential:v1:'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

function keyFromEnvironment(): Buffer | null {
  const configured = process.env.CODY_WEB_UI_CREDENTIAL_KEY?.trim()
  return configured ? createHash('sha256').update(configured, 'utf8').digest() : null
}

export function credentialKeyFilePath(anchorPath = localDatabasePath()): string {
  return process.env.CODY_WEB_UI_CREDENTIAL_KEY_FILE?.trim() || join(dirname(anchorPath), 'credentials.key')
}

function readKeyFile(path: string): Buffer {
  const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64')
  if (key.length !== KEY_BYTES) throw new Error(`Credential encryption key at ${path} is invalid`)
  try { chmodSync(path, 0o600) } catch { /* Best effort on non-POSIX filesystems. */ }
  return key
}

function credentialKey(keyFilePath: string): Buffer {
  const environmentKey = keyFromEnvironment()
  if (environmentKey) return environmentKey
  if (existsSync(keyFilePath)) return readKeyFile(keyFilePath)
  mkdirSync(dirname(keyFilePath), { recursive: true, mode: 0o700 })
  const generated = randomBytes(KEY_BYTES)
  try {
    writeFileSync(keyFilePath, generated.toString('base64'), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return readKeyFile(keyFilePath)
    throw error
  }
  try { chmodSync(keyFilePath, 0o600) } catch { /* Best effort on non-POSIX filesystems. */ }
  return generated
}

export function isSealedCredential(value: string): boolean {
  return value.startsWith(PREFIX)
}

export function sealCredential(value: string, context: string, keyPath = credentialKeyFilePath()): string {
  if (!value || isSealedCredential(value)) return value
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', credentialKey(keyPath), iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`
}

export function openCredential(value: string, context: string, keyPath = credentialKeyFilePath()): string {
  if (!value || !isSealedCredential(value)) return value
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64')
  if (payload.length <= IV_BYTES + TAG_BYTES) throw new Error('Stored credential ciphertext is invalid')
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(keyPath), payload.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}
