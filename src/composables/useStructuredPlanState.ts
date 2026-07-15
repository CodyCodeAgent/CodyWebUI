import { computed, ref, type Ref } from 'vue'
import { applyStructuredPlanUpdate, clearStructuredPlan, endStructuredPlan, type DesktopPlanState } from './desktopPlanState'
import type { StructuredPlanUpdate } from './realtimeNotificationReaders'

export function useStructuredPlanState(selectedThreadId: Ref<string>) {
  const byThreadId = ref<Record<string, DesktopPlanState>>({})
  const selected = computed(() => byThreadId.value[selectedThreadId.value] ?? null)

  function clear(threadId: string): void { byThreadId.value = clearStructuredPlan(byThreadId.value, threadId) }
  function end(threadId: string, turnId: string): void { byThreadId.value = endStructuredPlan(byThreadId.value, threadId, turnId) }
  function apply(update: StructuredPlanUpdate): void {
    byThreadId.value = applyStructuredPlanUpdate(byThreadId.value, update, (byThreadId.value[update.threadId]?.revision ?? 0) + 1)
  }
  function reset(): void { byThreadId.value = {} }

  return { selected, clear, end, apply, reset }
}
