import type { IncomingMessage, ServerResponse } from 'node:http'

export type DomainRouteContext = {
  req: IncomingMessage
  res: ServerResponse
  url: URL
}

export type DomainRoute = (context: DomainRouteContext) => Promise<boolean>

export function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return null
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw.length === 0 ? null : JSON.parse(raw) as unknown
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
