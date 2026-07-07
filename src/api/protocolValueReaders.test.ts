import { describe, expect, it } from 'vitest'
import {
  asRecord,
  readIsoTimestampMs,
  readIsoTimestampString,
  readNumber,
  readString,
  toRawPayload,
} from './protocolValueReaders'

describe('protocolValueReaders', () => {
  it('reads primitive values without accepting arrays as records', () => {
    expect(asRecord({ id: 'ok' })).toEqual({ id: 'ok' })
    expect(asRecord(null)).toBeNull()
    expect(asRecord(['nope'])).toBeNull()

    expect(readString('hello')).toBe('hello')
    expect(readString(123)).toBe('')
    expect(readNumber(42)).toBe(42)
    expect(readNumber(Number.NaN)).toBeNull()
    expect(readNumber('42')).toBeNull()
  })

  it('normalizes ISO strings and epoch timestamps', () => {
    expect(readIsoTimestampMs('2026-07-07T00:00:00.000Z')).toBe(1783382400000)
    expect(readIsoTimestampMs(1783382400)).toBe(1783382400000)
    expect(readIsoTimestampMs(1783382400000)).toBe(1783382400000)
    expect(readIsoTimestampMs('not-a-date')).toBeNull()

    expect(readIsoTimestampString(1783382400)).toBe('2026-07-07T00:00:00.000Z')
    expect(readIsoTimestampString('already-iso')).toBe('already-iso')
    expect(readIsoTimestampString({})).toBe('')
  })

  it('serializes raw payloads with a safe fallback', () => {
    expect(toRawPayload({ a: 1 })).toBe('{\n  "a": 1\n}')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(toRawPayload(cyclic)).toBe('[object Object]')
  })
})
