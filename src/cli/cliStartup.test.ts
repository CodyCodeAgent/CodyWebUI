import { describe, expect, it } from 'vitest'
import {
  buildStartupBanner,
  normalizeListenHost,
  parseListenPort,
  startupSecurityWarning,
  validateRemotePassword,
} from './cliStartup'

describe('cli startup rules', () => {
  it('parses strict TCP ports', () => {
    expect(parseListenPort('3000')).toBe(3000)
    expect(parseListenPort(' 443 ')).toBe(443)
    expect(() => parseListenPort('3000abc')).toThrow('Invalid port')
    expect(() => parseListenPort('0')).toThrow('Invalid port')
    expect(() => parseListenPort('65536')).toThrow('Invalid port')
  })

  it('normalizes empty hosts to loopback', () => {
    expect(normalizeListenHost('')).toBe('127.0.0.1')
    expect(normalizeListenHost(' 0.0.0.0 ')).toBe('0.0.0.0')
  })

  it('warns for exposed hosts in the startup banner', () => {
    expect(startupSecurityWarning('127.0.0.1')).toBe('')
    expect(startupSecurityWarning('0.0.0.0')).toContain('all interfaces')
    expect(startupSecurityWarning('10.0.0.10')).toContain('non-loopback')

    expect(buildStartupBanner({
      host: '0.0.0.0',
      port: 3000,
      password: 'secret',
    })).toContain('Use HTTPS and a strong password')
    expect(buildStartupBanner({
      host: '127.0.0.1',
      port: 3000,
    })).toContain('Password: disabled')
  })

  it('requires password protection outside loopback', () => {
    expect(() => validateRemotePassword('0.0.0.0', undefined)).toThrow('cannot be disabled')
    expect(() => validateRemotePassword('10.0.0.10', undefined)).toThrow('cannot be disabled')
    expect(() => validateRemotePassword('10.0.0.10', 'strong-password')).not.toThrow()
    expect(() => validateRemotePassword('127.0.0.1', undefined)).not.toThrow()
  })
})
