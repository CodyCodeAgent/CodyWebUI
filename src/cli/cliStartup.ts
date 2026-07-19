export type StartupBannerOptions = {
  host: string
  port: number
  password?: string
}

export function parseListenPort(value: string): number {
  const normalized = value.trim()
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`Invalid port "${value}". Expected an integer from 1 to 65535.`)
  }

  const port = Number(normalized)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${value}". Expected an integer from 1 to 65535.`)
  }
  return port
}

export function normalizeListenHost(value: string): string {
  return value.trim() || '127.0.0.1'
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export function validateRemotePassword(host: string, password: string | undefined): void {
  if (!isLoopbackHost(host) && !password) {
    throw new Error('Password protection cannot be disabled on a non-loopback host')
  }
}

export function startupSecurityWarning(host: string): string {
  if (host === '0.0.0.0' || host === '::' || host === '*') {
    return '  Warning: listening on all interfaces. Use HTTPS and a strong password for remote access.'
  }
  if (!isLoopbackHost(host)) {
    return '  Warning: listening on a non-loopback host. Review firewall, HTTPS, and authentication settings.'
  }
  return ''
}

export function buildStartupBanner(options: StartupBannerOptions): string {
  const lines = [
    '',
    'CodyWeb is running!',
    '',
    `  Local:    http://${options.host === '127.0.0.1' ? '127.0.0.1' : options.host}:${String(options.port)}`,
  ]

  if (options.password) {
    lines.push(`  Password: ${options.password}`)
  } else {
    lines.push('  Password: disabled')
  }

  const warning = startupSecurityWarning(options.host)
  if (warning) {
    lines.push(warning)
  }

  lines.push('')
  return lines.join('\n')
}
