import type { IncomingMessage } from 'node:http'

export type SecurityAccessRiskLevel = 'info' | 'warning' | 'danger'

export type SecurityAccessRisk = {
  id: string
  level: SecurityAccessRiskLevel
  title: string
  summary: string
}

export type SecurityAccessSnapshot = {
  generatedAtIso: string
  auth: {
    enabled: boolean
    sessionEndpoint: string
    loginEndpoint: string
    logoutEndpoint: string
  }
  network: {
    requestHost: string
    hostname: string
    protocol: 'http' | 'https' | 'unknown'
    forwardedProto: string
    isLoopbackRequest: boolean
    listenHost: string
    listenPort: number | null
    listenExposure: 'loopback' | 'wildcard' | 'external' | 'unknown'
  }
  risks: SecurityAccessRisk[]
  recommendations: string[]
  guide: {
    title: string
    body: string
  }[]
}

export type SecurityAccessOptions = {
  authEnabled?: boolean
  listenHost?: string
  listenPort?: number | null
  now?: () => Date
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function firstForwardedProtocol(req: IncomingMessage): string {
  return headerValue(req.headers['x-forwarded-proto']).split(',')[0]?.trim().toLowerCase() ?? ''
}

function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1)
  return trimmed
}

function hostnameFromHostHeader(host: string): string {
  const trimmed = host.trim()
  if (!trimmed) return ''
  try {
    return normalizeHostname(new URL(`http://${trimmed}`).hostname)
  } catch {
    return normalizeHostname(trimmed.split(':')[0] ?? '')
  }
}

export function isLoopbackHostname(value: string): boolean {
  const hostname = normalizeHostname(value)
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/u.test(hostname)
  )
}

export function isLoopbackAddress(value: string | undefined): boolean {
  const address = value?.trim().toLowerCase() ?? ''
  if (!address) return false
  if (address === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(address)) return true
  return /^::ffff:127(?:\.\d{1,3}){3}$/u.test(address)
}

export type RequestTransportSecurity = {
  protocol: SecurityAccessSnapshot['network']['protocol']
  peerAddress: string
  isLoopbackPeer: boolean
  forwardedProto: string
  forwardedProtoTrusted: boolean
}

/**
 * Resolve the request transport for security diagnostics. `X-Forwarded-Proto`
 * is trusted only from a same-host proxy so a remote client cannot make an
 * HTTP request appear encrypted in the access-status UI.
 */
export function inspectRequestTransport(req: IncomingMessage): RequestTransportSecurity {
  const peerAddress = req.socket.remoteAddress?.trim() ?? ''
  const isLoopbackPeer = isLoopbackAddress(peerAddress)
  const forwardedProto = firstForwardedProtocol(req)
  const forwardedProtoTrusted = isLoopbackPeer && (forwardedProto === 'http' || forwardedProto === 'https')
  const encrypted = (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted === true
  const protocol: RequestTransportSecurity['protocol'] = encrypted || (forwardedProtoTrusted && forwardedProto === 'https')
    ? 'https'
    : 'http'
  return {
    protocol,
    peerAddress,
    isLoopbackPeer,
    forwardedProto,
    forwardedProtoTrusted,
  }
}

function listenExposureForHost(value: string): SecurityAccessSnapshot['network']['listenExposure'] {
  const host = normalizeHostname(value)
  if (!host) return 'unknown'
  if (host === '0.0.0.0' || host === '::' || host === '*') return 'wildcard'
  if (isLoopbackHostname(host)) return 'loopback'
  return 'external'
}

function requestProtocol(req: IncomingMessage): SecurityAccessSnapshot['network']['protocol'] {
  return inspectRequestTransport(req).protocol
}

export function buildSecurityAccessSnapshot(
  req: IncomingMessage,
  options: SecurityAccessOptions = {},
): SecurityAccessSnapshot {
  const now = options.now ?? (() => new Date())
  const requestHost = headerValue(req.headers.host)
  const hostname = hostnameFromHostHeader(requestHost)
  const protocol = requestProtocol(req)
  const forwardedProto = headerValue(req.headers['x-forwarded-proto'])
  const listenHost = options.listenHost?.trim() ?? ''
  const listenExposure = listenExposureForHost(listenHost)
  const isLoopbackRequest = isLoopbackHostname(hostname)
  const authEnabled = Boolean(options.authEnabled)
  const risks: SecurityAccessRisk[] = []

  if (!authEnabled) {
    risks.push({
      id: 'auth-disabled',
      level: 'danger',
      title: 'Password protection is disabled',
      summary: 'Remote browser access can control local code and commands without a login gate.',
    })
  }

  if (listenExposure === 'wildcard') {
    risks.push({
      id: 'wildcard-listener',
      level: 'danger',
      title: 'Server is listening on all interfaces',
      summary: 'Any device that can reach this machine may be able to open the Codex control surface.',
    })
  } else if (listenExposure === 'external') {
    risks.push({
      id: 'external-listener',
      level: 'warning',
      title: 'Server is listening on a non-loopback address',
      summary: 'Use password protection, HTTPS, and firewall rules before exposing CodyWeb remotely.',
    })
  }

  if (hostname && !isLoopbackRequest) {
    risks.push({
      id: 'remote-request-host',
      level: protocol === 'https' && authEnabled ? 'warning' : 'danger',
      title: 'Current request is not loopback',
      summary: `${requestHost} is outside localhost; treat this browser session as remote access to the workstation.`,
    })
  }

  if (protocol !== 'https' && !isLoopbackRequest) {
    risks.push({
      id: 'remote-http',
      level: 'danger',
      title: 'Remote access is not using HTTPS',
      summary: 'Use TLS at a reverse proxy before sending credentials or approving commands over the network.',
    })
  }

  if (risks.length === 0) {
    risks.push({
      id: 'local-loopback',
      level: 'info',
      title: 'Loopback-only access',
      summary: 'The current request is local and no remote exposure risk was detected from request headers.',
    })
  }

  return {
    generatedAtIso: now().toISOString(),
    auth: {
      enabled: authEnabled,
      sessionEndpoint: '/auth/session',
      loginEndpoint: '/auth/login',
      logoutEndpoint: '/auth/logout',
    },
    network: {
      requestHost,
      hostname,
      protocol,
      forwardedProto,
      isLoopbackRequest,
      listenHost,
      listenPort: typeof options.listenPort === 'number' && Number.isFinite(options.listenPort)
        ? options.listenPort
        : null,
      listenExposure,
    },
    risks,
    recommendations: [
      'Keep the default host on 127.0.0.1 unless you intentionally need remote access.',
      'When binding to 0.0.0.0 or a LAN address, keep password protection enabled and put HTTPS in front of the app.',
      'Prefer a reverse proxy or SSH tunnel for phone/tablet access instead of exposing a raw HTTP listener.',
    ],
    guide: [
      {
        title: 'Local-only mode',
        body: 'Run with the default host and open http://127.0.0.1:<port> on this machine.',
      },
      {
        title: 'Remote supervision',
        body: 'Bind an explicit host, keep password protection on, and terminate HTTPS at a trusted reverse proxy.',
      },
    ],
  }
}
