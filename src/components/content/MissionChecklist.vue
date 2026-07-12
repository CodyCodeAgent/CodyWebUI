<template>
  <aside
    v-if="shouldRender"
    class="mission-checklist"
    :data-collapsed="isCollapsed"
    :data-complete="isComplete"
    :data-attention="hasPendingApproval"
    aria-live="polite"
  >
    <button
      class="mission-checklist-mobile-trigger"
      type="button"
      :aria-expanded="isMobileOpen"
      @click="isMobileOpen = true"
    >
      <span>{{ headline }}</span>
      <strong>{{ completedCount }}/{{ items.length }}</strong>
    </button>

    <section class="mission-checklist-card">
      <header>
        <div>
          <span class="mission-checklist-eyebrow">{{ t('mission.title') }}</span>
          <h2>{{ headline }}</h2>
        </div>
        <div class="mission-checklist-header-actions">
          <span>{{ completedCount }} / {{ items.length }}</span>
          <button type="button" :aria-label="isCollapsed ? t('mission.expand') : t('mission.collapse')" @click="isCollapsed = !isCollapsed">
            {{ isCollapsed ? '+' : '−' }}
          </button>
        </div>
      </header>
      <div class="mission-checklist-progress" aria-hidden="true">
        <span :style="{ width: `${progressPercent}%` }" />
      </div>
      <ol v-if="!isCollapsed">
        <li v-for="item in items" :key="item.id" :data-status="item.status">
          <span class="mission-checklist-state" aria-hidden="true">
            <span v-if="item.status === 'done'">✓</span>
            <span v-else-if="item.status === 'doing'" class="mission-checklist-pulse" />
            <span v-else />
          </span>
          <span class="mission-checklist-copy">{{ item.text }}</span>
        </li>
      </ol>
      <p v-if="!isCollapsed && hasPendingApproval" class="mission-checklist-attention">{{ t('mission.waitingApproval') }}</p>
      <p v-else-if="!isCollapsed && plan?.possiblyStale" class="mission-checklist-attention">{{ plan.lifecycle === 'ended' ? t('mission.unsyncedFinal') : t('mission.stale') }}</p>
    </section>

    <Teleport to="body">
      <div v-if="isMobileOpen" class="mission-checklist-mobile-backdrop" @click.self="isMobileOpen = false">
        <section class="mission-checklist-mobile-sheet" role="dialog" aria-modal="true" :aria-label="t('mission.title')">
          <header>
            <div><span>{{ t('mission.progress') }}</span><h2>{{ headline }}</h2></div>
            <button type="button" @click="isMobileOpen = false">{{ t('mission.done') }}</button>
          </header>
          <div class="mission-checklist-progress"><span :style="{ width: `${progressPercent}%` }" /></div>
          <ol>
            <li v-for="item in items" :key="`mobile:${item.id}`" :data-status="item.status">
              <span class="mission-checklist-state" aria-hidden="true"><span v-if="item.status === 'done'">✓</span><span v-else-if="item.status === 'doing'" class="mission-checklist-pulse" /><span v-else /></span>
              <span class="mission-checklist-copy">{{ item.text }}</span>
            </li>
          </ol>
        </section>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { DesktopPlanState } from '../../composables/desktopPlanState'
import { useLocale } from '../../composables/useLocale'

type MissionItemStatus = 'todo' | 'doing' | 'done'
type MissionItem = { id: string; text: string; status: MissionItemStatus }

const props = defineProps<{
  threadId: string
  plan: DesktopPlanState | null
  isTurnInProgress: boolean
  hasPendingApproval: boolean
}>()
const { t } = useLocale()

const isCollapsed = ref(false)
const isMobileOpen = ref(false)
const isCompletionDismissed = ref(false)
let completionTimer = 0

const items = computed<MissionItem[]>(() => (props.plan?.steps ?? []).map((item, index) => ({
  id: `${String(index)}:${item.step}`,
  text: item.step,
  status: item.status === 'completed' ? 'done' : item.status === 'inProgress' ? 'doing' : 'todo',
})))
const completedCount = computed(() => items.value.filter((item) => item.status === 'done').length)
const isComplete = computed(() => items.value.length > 0 && completedCount.value === items.value.length)
const progressPercent = computed(() => items.value.length > 0 ? Math.round((completedCount.value / items.value.length) * 100) : 0)
const headline = computed(() => {
  if (isComplete.value) return t('mission.complete')
  if (props.hasPendingApproval) return t('mission.needsApproval')
  const active = items.value.find((item) => item.status === 'doing')
  if (active) return active.text
  if (!props.isTurnInProgress) return t('mission.paused')
  return t('mission.preparing')
})
const shouldRender = computed(() => Boolean(props.threadId && items.value.length >= 2 && !isCompletionDismissed.value))

watch(() => `${props.threadId}:${props.plan?.turnId ?? ''}:${String(props.plan?.revision ?? 0)}:${props.plan?.lifecycle ?? ''}`, () => {
  window.clearTimeout(completionTimer)
  isCompletionDismissed.value = false
  if (isComplete.value && !props.hasPendingApproval) {
    isCollapsed.value = true
    completionTimer = window.setTimeout(() => {
      isCompletionDismissed.value = true
      isMobileOpen.value = false
    }, 4500)
  } else {
    isCollapsed.value = false
  }
}, { immediate: true })

onUnmounted(() => window.clearTimeout(completionTimer))
</script>

<style scoped>
.mission-checklist { position: fixed; z-index: 38; top: 7.2rem; right: 1.25rem; width: min(21rem, calc(100vw - 2rem)); color: var(--color-text); }
.mission-checklist-card { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-panel) 96%, transparent); box-shadow: var(--shadow-floating); backdrop-filter: blur(22px); }
.mission-checklist-card::before { content: ''; display: block; width: 5.5rem; height: 1px; background: var(--color-accent); box-shadow: 0 0 14px color-mix(in srgb, var(--color-accent) 55%, transparent); }
.mission-checklist-card > header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; padding: .8rem .85rem .65rem; }
.mission-checklist-eyebrow { color: var(--color-text-muted); font-family: var(--font-mono); font-size: .58rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.mission-checklist h2 { max-width: 14rem; overflow: hidden; margin: .18rem 0 0; font-size: .82rem; font-weight: 650; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.mission-checklist-header-actions { display: flex; align-items: center; gap: .45rem; color: var(--color-text-muted); font-family: var(--font-mono); font-size: .65rem; }
.mission-checklist-header-actions button { width: 1.5rem; height: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-elevated); color: var(--color-text-muted); }
.mission-checklist-progress { height: 2px; background: color-mix(in srgb, var(--color-border) 70%, transparent); }
.mission-checklist-progress span { display: block; height: 100%; background: var(--color-success); box-shadow: 0 0 10px color-mix(in srgb, var(--color-success) 50%, transparent); transition: width var(--motion-slow) ease; }
.mission-checklist ol { display: grid; max-height: 19rem; gap: .15rem; overflow-y: auto; margin: 0; padding: .55rem; list-style: none; }
.mission-checklist li { display: grid; grid-template-columns: 1.25rem minmax(0,1fr); align-items: start; gap: .45rem; border-radius: var(--radius-sm); padding: .42rem .35rem; color: var(--color-text-muted); font-size: .76rem; line-height: 1.45; }
.mission-checklist li[data-status='doing'] { background: color-mix(in srgb, var(--color-accent) 8%, transparent); color: var(--color-text); }
.mission-checklist li[data-status='done'] { color: color-mix(in srgb, var(--color-text-muted) 74%, transparent); }
.mission-checklist-state { display: grid; width: 1rem; height: 1rem; place-items: center; margin-top: .03rem; border: 1px solid var(--color-border); border-radius: 50%; color: #071018; font-size: .65rem; }
.mission-checklist li[data-status='done'] .mission-checklist-state { border-color: var(--color-success); background: var(--color-success); }
.mission-checklist li[data-status='doing'] .mission-checklist-state { border-color: var(--color-accent); }
.mission-checklist-pulse { width: .38rem; height: .38rem; border-radius: 50%; background: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 13%, transparent), 0 0 9px var(--color-accent); animation: mission-pulse 1.4s ease-in-out infinite; }
.mission-checklist-attention { margin: 0 .75rem .75rem; border: 1px solid color-mix(in srgb, var(--color-warning) 36%, var(--color-border)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning) 8%, transparent); padding: .48rem .55rem; color: var(--color-warning); font-size: .68rem; line-height: 1.4; }
.mission-checklist[data-complete='true'] .mission-checklist-card::before { background: var(--color-success); }
.mission-checklist-mobile-trigger, .mission-checklist-mobile-backdrop, .mission-checklist-mobile-sheet { display: none; }
@keyframes mission-pulse { 50% { opacity: .48; transform: scale(.75); } }

@media (max-width: 720px) {
  .mission-checklist { top: 6.25rem; right: .75rem; width: auto; }
  .mission-checklist-card { display: none; }
  .mission-checklist-mobile-trigger { display: flex; align-items: center; gap: .65rem; border: 1px solid color-mix(in srgb, var(--color-accent) 34%, var(--color-border)); border-radius: 999px; background: var(--color-panel); padding: .48rem .7rem; color: var(--color-text); box-shadow: var(--shadow-floating); }
  .mission-checklist-mobile-trigger span { max-width: 11rem; overflow: hidden; font-size: .7rem; text-overflow: ellipsis; white-space: nowrap; }
  .mission-checklist-mobile-trigger strong { color: var(--color-accent); font-family: var(--font-mono); font-size: .65rem; }
  .mission-checklist-mobile-backdrop { position: fixed; inset: 0; z-index: 110; display: flex; align-items: flex-end; background: rgb(2 6 12 / .66); backdrop-filter: blur(6px); }
  .mission-checklist-mobile-sheet { display: grid; width: 100%; max-height: 82vh; overflow: hidden; border: 1px solid var(--color-border); border-bottom: 0; border-radius: 1.25rem 1.25rem 0 0; background: var(--color-panel); padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom)); box-shadow: var(--shadow-floating); }
  .mission-checklist-mobile-sheet > header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
  .mission-checklist-mobile-sheet header span { color: var(--color-text-muted); font-family: var(--font-mono); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; }
  .mission-checklist-mobile-sheet h2 { max-width: 17rem; white-space: normal; }
  .mission-checklist-mobile-sheet header button { border: 0; border-radius: var(--radius-md); background: var(--color-accent); padding: .55rem .8rem; color: #071018; font-weight: 700; }
  .mission-checklist-mobile-sheet ol { max-height: 60vh; padding-top: .8rem; }
}

@media (prefers-reduced-motion: reduce) { .mission-checklist-pulse { animation: none; } }
</style>
