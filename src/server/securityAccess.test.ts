import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { buildSecurityAccessSnapshot } from './securityAccess'

function mockRequest(headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage
  req.headers = headers
  req.socket = { encrypted: false } as unknown as IncomingMessage['socket']
  return req
}

describe('security access snapshot', () => {
  it('reports loopback access as constrained when auth is enabled', () => {
    const snapshot = buildSecurityAccessSnapshot(mockRequest({ host: '127.0.0.1:3000' }), {
      authEnabled: true,
      listenHost: '127.0.0.1',
      listenPort: 3000,
      now: () => new Date('2026-07-05T00:00:00.000Z'),
    })

    expect(snapshot).toMatchObject({
      generatedAtIso: '2026-07-05T00:00:00.000Z',
      auth: { enabled: true },
      network: {
        hostname: '127.0.0.1',
        protocol: 'http',
        isLoopbackRequest: true,
        listenExposure: 'loopback',
      },
      risks: [
        expect.objectContaining({
          id: 'local-loopback',
          level: 'info',
        }),
      ],
    })
  })

  it('flags wildcard listeners and disabled auth as dangerous', () => {
    const snapshot = buildSecurityAccessSnapshot(mockRequest({ host: 'localhost:3000' }), {
      authEnabled: false,
      listenHost: '0.0.0.0',
      listenPort: 3000,
    })

    expect(snapshot.network.listenExposure).toBe('wildcard')
    expect(snapshot.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'auth-disabled', level: 'danger' }),
      expect.objectContaining({ id: 'wildcard-listener', level: 'danger' }),
    ]))
  })

  it('flags remote HTTP requests even when auth is enabled', () => {
    const snapshot = buildSecurityAccessSnapshot(mockRequest({
      host: 'codex.example.test',
      'x-forwarded-proto': 'http',
    }), {
      authEnabled: true,
      listenHost: '192.168.1.10',
      listenPort: 3000,
    })

    expect(snapshot.network).toMatchObject({
      hostname: 'codex.example.test',
      protocol: 'http',
      isLoopbackRequest: false,
      listenExposure: 'external',
    })
    expect(snapshot.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'external-listener', level: 'warning' }),
      expect.objectContaining({ id: 'remote-request-host', level: 'danger' }),
      expect.objectContaining({ id: 'remote-http', level: 'danger' }),
    ]))
  })
})
