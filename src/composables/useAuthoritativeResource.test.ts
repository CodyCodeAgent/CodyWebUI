import { describe, expect, it } from 'vitest'
import { useAuthoritativeResource } from './useAuthoritativeResource'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('authoritative resource', () => {
  it('prevents older requests from overwriting newer results', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    let calls = 0
    const resource = useAuthoritativeResource(() => ++calls === 1 ? first.promise : second.promise)
    const firstRefresh = resource.refresh()
    const secondRefresh = resource.refresh()
    second.resolve(2)
    await secondRefresh
    first.resolve(1)
    await firstRefresh
    expect(resource.value.value).toBe(2)
    expect(resource.isLoading.value).toBe(false)
  })
})
