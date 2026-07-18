import { describe, expect, it } from 'vitest'
import { isLoopbackBrowserHostname, isRemotePlainHttpLocation } from './feishuTransport'

describe('Feishu browser transport warning', () => {
  it('recognizes browser loopback hostnames', () => {
    expect(isLoopbackBrowserHostname('localhost')).toBe(true)
    expect(isLoopbackBrowserHostname('app.localhost.')).toBe(true)
    expect(isLoopbackBrowserHostname('127.0.0.8')).toBe(true)
    expect(isLoopbackBrowserHostname('[::1]')).toBe(true)
    expect(isLoopbackBrowserHostname('10.37.222.12')).toBe(false)
  })

  it('warns only for remote plain HTTP pages', () => {
    expect(isRemotePlainHttpLocation({ protocol: 'http:', hostname: '10.37.222.12' })).toBe(true)
    expect(isRemotePlainHttpLocation({ protocol: 'https:', hostname: 'cody.example.test' })).toBe(false)
    expect(isRemotePlainHttpLocation({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(false)
  })
})
