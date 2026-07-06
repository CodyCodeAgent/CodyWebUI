<template>
  <aside
    v-if="snapshot"
    ref="cardRef"
    class="rate-limit-card"
    :class="{ 'is-dragging': dragState !== null }"
    :style="cardPositionStyle"
    :title="detailsTitle"
    aria-label="Codex rate limit status"
  >
    <div
      class="rate-limit-heading"
      title="Drag to move"
      @pointerdown="startDrag"
    >
      <span class="rate-limit-title">Codex</span>
      <button
        class="rate-limit-refresh"
        type="button"
        aria-label="Refresh rate limits"
        title="Refresh rate limits"
        :disabled="isLoading"
        @pointerdown.stop
        @click="$emit('refresh')"
      >
        <IconTablerRefresh class="rate-limit-refresh-icon" :class="{ 'is-spinning': isLoading }" />
      </button>
    </div>

    <div class="rate-limit-rows">
      <div v-if="primaryRow" class="rate-limit-row">
        <div class="rate-limit-row-meta">
          <span class="rate-limit-label">{{ primaryRow.label }}</span>
          <span class="rate-limit-value">{{ primaryRow.percentText }}</span>
          <span class="rate-limit-reset">{{ primaryRow.resetText }}</span>
        </div>
        <div class="rate-limit-track">
          <div
            class="rate-limit-fill"
            :style="{ width: primaryRow.fillWidth, backgroundColor: primaryRow.color }"
          />
        </div>
      </div>

      <div v-if="secondaryRow" class="rate-limit-row">
        <div class="rate-limit-row-meta">
          <span class="rate-limit-label">{{ secondaryRow.label }}</span>
          <span class="rate-limit-value">{{ secondaryRow.percentText }}</span>
          <span class="rate-limit-reset">{{ secondaryRow.resetText }}</span>
        </div>
        <div class="rate-limit-track">
          <div
            class="rate-limit-fill"
            :style="{ width: secondaryRow.fillWidth, backgroundColor: secondaryRow.color }"
          />
        </div>
      </div>
    </div>

    <div class="rate-limit-details">
      <span v-if="snapshot.planType">{{ snapshot.planType }}</span>
      <span v-if="snapshot.limitName">{{ snapshot.limitName }}</span>
      <span v-if="resetCreditsText">{{ resetCreditsText }}</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconTablerRefresh from '../icons/IconTablerRefresh.vue'
import type { UiRateLimitSnapshot, UiRateLimitWindow } from '../../types/codex'

const props = defineProps<{
  snapshot: UiRateLimitSnapshot | null
  isLoading: boolean
}>()

defineEmits<{
  refresh: []
}>()

type RateLimitRow = {
  label: string
  percentText: string
  resetText: string
  fillWidth: string
  color: string
}

type CardPosition = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
}

const POSITION_STORAGE_KEY = 'codex-web-local.rate-limit-position.v1'
const DEFAULT_CARD_WIDTH = 224
const CARD_MARGIN = 12

const nowSeconds = ref(Math.floor(Date.now() / 1000))
const cardRef = ref<HTMLElement | null>(null)
const position = ref<CardPosition | null>(null)
const dragState = ref<DragState | null>(null)
let clockTimer: number | null = null

const primaryRow = computed(() => buildRow(props.snapshot?.primary ?? null))
const secondaryRow = computed(() => buildRow(props.snapshot?.secondary ?? null))
const resetCreditsText = computed(() => {
  if (props.snapshot?.availableResetCredits === null || props.snapshot?.availableResetCredits === undefined) {
    return ''
  }
  const count = props.snapshot.availableResetCredits
  return `${count} reset credit${count === 1 ? '' : 's'}`
})
const detailsTitle = computed(() => {
  if (!props.snapshot) return ''
  const parts = [
    props.snapshot.limitId ? `Bucket: ${props.snapshot.limitId}` : '',
    props.snapshot.limitName ? `Name: ${props.snapshot.limitName}` : '',
    props.snapshot.planType ? `Plan: ${props.snapshot.planType}` : '',
    resetCreditsText.value ? `Credits: ${resetCreditsText.value}` : '',
  ].filter(Boolean)
  return parts.join('\n')
})
const cardPositionStyle = computed(() => {
  if (!position.value) return {}
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  }
})

function buildRow(window: UiRateLimitWindow | null): RateLimitRow | null {
  if (!window) return null

  const percent = clamp(window.usedPercent, 0, 100)
  return {
    label: formatWindowLabel(window.windowDurationMins),
    percentText: `${Math.round(percent)}%`,
    resetText: formatReset(window.resetsAt),
    fillWidth: `${percent}%`,
    color: colorForPercent(percent),
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function formatWindowLabel(durationMins: number | null): string {
  if (durationMins === 300) return '5h'
  if (durationMins === 10080) return '7d'
  if (!durationMins) return 'limit'
  if (durationMins % 1440 === 0) return `${durationMins / 1440}d`
  if (durationMins % 60 === 0) return `${durationMins / 60}h`
  return `${durationMins}m`
}

function formatReset(resetsAt: number | null): string {
  if (!resetsAt) return 'reset --'

  const secondsLeft = Math.max(0, resetsAt - nowSeconds.value)
  if (secondsLeft <= 30) return 'reset soon'

  const days = Math.floor(secondsLeft / 86400)
  const hours = Math.floor((secondsLeft % 86400) / 3600)
  const minutes = Math.ceil((secondsLeft % 3600) / 60)

  if (days > 0) return `reset ${days}d ${hours}h`
  if (hours > 0) return `reset ${hours}h ${minutes}m`
  return `reset ${minutes}m`
}

function colorForPercent(percent: number): string {
  if (percent >= 90) return '#dc2626'
  if (percent >= 70) return '#d97706'
  return '#16a34a'
}

function readStoredPosition(): CardPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CardPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return parsed as CardPosition
  } catch {
    return null
  }
}

function writeStoredPosition(nextPosition: CardPosition): void {
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition))
  } catch {
    // Ignore storage failures; dragging should still work for the current session.
  }
}

function defaultPosition(): CardPosition {
  return {
    x: Math.max(CARD_MARGIN, window.innerWidth - DEFAULT_CARD_WIDTH - 16),
    y: 12,
  }
}

function clampPosition(candidate: CardPosition): CardPosition {
  const rect = cardRef.value?.getBoundingClientRect()
  const width = rect?.width || DEFAULT_CARD_WIDTH
  const height = rect?.height || 120
  const maxX = Math.max(CARD_MARGIN, window.innerWidth - width - CARD_MARGIN)
  const maxY = Math.max(CARD_MARGIN, window.innerHeight - height - CARD_MARGIN)

  return {
    x: clamp(candidate.x, CARD_MARGIN, maxX),
    y: clamp(candidate.y, CARD_MARGIN, maxY),
  }
}

function ensurePosition(): void {
  const stored = readStoredPosition()
  position.value = clampPosition(stored ?? defaultPosition())
  if (position.value) writeStoredPosition(position.value)
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || !position.value) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('button')) return

  event.preventDefault()
  cardRef.value?.setPointerCapture(event.pointerId)
  dragState.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: position.value.x,
    startY: position.value.y,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function onPointerMove(event: PointerEvent): void {
  const drag = dragState.value
  if (!drag || event.pointerId !== drag.pointerId) return
  position.value = clampPosition({
    x: drag.startX + event.clientX - drag.startClientX,
    y: drag.startY + event.clientY - drag.startClientY,
  })
}

function stopDrag(event: PointerEvent): void {
  const drag = dragState.value
  if (!drag || event.pointerId !== drag.pointerId) return
  if (position.value) writeStoredPosition(position.value)
  cardRef.value?.releasePointerCapture(event.pointerId)
  dragState.value = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function onWindowResize(): void {
  if (!position.value) return
  position.value = clampPosition(position.value)
  writeStoredPosition(position.value)
}

onMounted(() => {
  ensurePosition()
  window.addEventListener('resize', onWindowResize)
  clockTimer = window.setInterval(() => {
    nowSeconds.value = Math.floor(Date.now() / 1000)
  }, 60000)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  if (clockTimer !== null) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
})

watch(
  () => props.snapshot,
  () => {
    if (!position.value) ensurePosition()
  },
)
</script>

<style scoped>
.rate-limit-card {
  position: fixed;
  z-index: 30;
  width: 14rem;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid #e4e4e7;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.95);
  padding: 0.5rem 0.75rem;
  color: #3f3f46;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  backdrop-filter: blur(8px);
  display: none;
  touch-action: none;
}

@media (min-width: 1024px) {
  .rate-limit-card {
    display: flex;
  }
}

.rate-limit-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: grab;
  user-select: none;
}

.rate-limit-card.is-dragging .rate-limit-heading {
  cursor: grabbing;
}

.rate-limit-title {
  color: #71717a;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.rate-limit-refresh {
  display: flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: transparent;
  color: #a1a1aa;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.rate-limit-refresh:hover:not(:disabled) {
  border-color: #e4e4e7;
  background: #fafafa;
  color: #3f3f46;
}

.rate-limit-refresh:disabled {
  cursor: wait;
  opacity: 0.6;
}

.rate-limit-refresh-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.rate-limit-refresh-icon.is-spinning {
  animation: rate-limit-spin 0.8s linear infinite;
}

.rate-limit-rows {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.rate-limit-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.rate-limit-row-meta {
  display: grid;
  grid-template-columns: 2rem 2.5rem minmax(0, 1fr);
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  line-height: 1;
}

.rate-limit-label {
  color: #3f3f46;
  font-weight: 600;
}

.rate-limit-value {
  color: #18181b;
  font-variant-numeric: tabular-nums;
}

.rate-limit-reset {
  min-width: 0;
  overflow: hidden;
  color: #71717a;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rate-limit-track {
  height: 0.375rem;
  overflow: hidden;
  border-radius: 9999px;
  background: #f4f4f5;
}

.rate-limit-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.rate-limit-details {
  display: none;
  min-width: 0;
  flex-wrap: wrap;
  column-gap: 0.375rem;
  row-gap: 0.25rem;
  border-top: 1px solid #f4f4f5;
  padding-top: 0.25rem;
  color: #71717a;
  font-size: 0.68rem;
  line-height: 1.25;
}

.rate-limit-card:hover .rate-limit-details {
  display: flex;
}

@keyframes rate-limit-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
