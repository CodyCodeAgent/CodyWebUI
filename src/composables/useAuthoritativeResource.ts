import { readonly, shallowRef } from 'vue'

export function useAuthoritativeResource<T>(read: () => Promise<T>) {
  const value = shallowRef<T | null>(null)
  const isLoading = shallowRef(false)
  const error = shallowRef('')
  let latestRequestId = 0

  async function refresh(): Promise<void> {
    const requestId = ++latestRequestId
    isLoading.value = true
    try {
      const nextValue = await read()
      if (requestId !== latestRequestId) return
      value.value = nextValue
      error.value = ''
    } catch (unknownError) {
      if (requestId !== latestRequestId) return
      error.value = unknownError instanceof Error ? unknownError.message : String(unknownError)
    } finally {
      if (requestId === latestRequestId) isLoading.value = false
    }
  }

  function invalidate(): void {
    void refresh()
  }

  return {
    value,
    isLoading: readonly(isLoading),
    error: readonly(error),
    refresh,
    invalidate,
  }
}
