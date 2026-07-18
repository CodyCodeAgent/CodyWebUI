export type BrowserLocationLike = Pick<Location, 'hostname' | 'protocol'>

export function isLoopbackBrowserHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
}

export function isRemotePlainHttpLocation(
  location: BrowserLocationLike = window.location,
): boolean {
  return location.protocol.toLowerCase() === 'http:' && !isLoopbackBrowserHostname(location.hostname)
}
