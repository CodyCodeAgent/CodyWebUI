<template>
  <aside
    v-if="settings.enabled && cwd.trim()"
    ref="widgetRef"
    class="token-flame-widget"
    :class="[{ 'is-dragging': dragState !== null }, `token-flame-widget-${settings.defaultCorner}`]"
    :style="widgetStyle"
    :data-level="fireLevel"
    :data-calm="settings.reducedMotion"
    aria-label="Daily token flame"
  >
    <button
      class="token-flame-button"
      type="button"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      :title="summaryTitle"
      @click="toggleOpen"
      @keydown="onKeyboardMove"
      @pointerdown="startDrag"
    >
      <span class="token-flame-graphic" aria-hidden="true">
        <span class="token-flame-glow" />
        <span class="token-flame-outer" />
        <span class="token-flame-mid" />
        <span class="token-flame-inner" />
      </span>
      <span class="token-flame-count">{{ compactTokenCount }}</span>
    </button>

    <section v-if="isOpen" class="token-flame-popover">
      <header class="token-flame-popover-header">
        <div>
          <h3>Token Flame</h3>
          <p>{{ usageSourceLabel }}</p>
        </div>
        <button type="button" aria-label="Refresh token usage" title="Refresh" @click="loadUsage">
          ↻
        </button>
      </header>
      <dl class="token-flame-stats">
        <div>
          <dt>today</dt>
          <dd>{{ formattedTotalTokens }}</dd>
        </div>
        <div>
          <dt>level</dt>
          <dd>{{ fireLevelLabel }}</dd>
        </div>
        <div>
          <dt>input</dt>
          <dd>{{ formatNumber(displayInputTokens) }}</dd>
        </div>
        <div>
          <dt>output</dt>
          <dd>{{ formatNumber(displayOutputTokens) }}</dd>
        </div>
      </dl>
      <p v-if="errorMessage" class="token-flame-error">{{ errorMessage }}</p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchUserSetting, writeUserSetting } from '../../api/codexSettingsClient'
import { fetchDailyTokenUsage } from '../../api/codexTokenUsageClient'
import { DESKTOP_SETTING_KEYS } from '../../composables/desktopSettingsKeys'
import {
  clampFloatingPosition,
  floatingKeyboardDelta,
  moveFloatingPosition,
} from '../../composables/floatingPositionRules'
import type { UiDailyTokenUsage, UiRateLimitSnapshot } from '../../types/codex'

type FlameCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
type FlameLevel = 'spark' | 'campfire' | 'steady' | 'bonfire' | 'blaze' | 'inferno'

type FlameSettings = {
  enabled: boolean
  defaultCorner: FlameCorner
  reducedMotion: boolean
  position: {
    x: number
    y: number
  } | null
}

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  moved: boolean
}

const props = defineProps<{
  cwd: string
  rateLimitSnapshot: UiRateLimitSnapshot | null
}>()

const DEFAULT_SETTINGS: FlameSettings = {
  enabled: true,
  defaultCorner: 'bottom-right',
  reducedMotion: false,
  position: null,
}
const WIDGET_SIZE = 64
const WIDGET_MARGIN = 12

const widgetRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const usage = ref<UiDailyTokenUsage | null>(null)
const settings = ref<FlameSettings>({ ...DEFAULT_SETTINGS })
const errorMessage = ref('')
const dragState = ref<DragState | null>(null)
let suppressNextClick = false
let refreshTimer = 0

function normalizeFlameSettings(value: unknown): FlameSettings {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const defaultCorner = (
    row.defaultCorner === 'bottom-left' ||
    row.defaultCorner === 'top-right' ||
    row.defaultCorner === 'top-left' ||
    row.defaultCorner === 'bottom-right'
  )
    ? row.defaultCorner
    : DEFAULT_SETTINGS.defaultCorner

  return {
    enabled: row.enabled !== false,
    defaultCorner,
    reducedMotion: row.reducedMotion === true,
    position: normalizePosition(row.position),
  }
}

function normalizePosition(value: unknown): FlameSettings['position'] {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (!row || typeof row.x !== 'number' || typeof row.y !== 'number') return null
  if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return null
  return {
    x: row.x,
    y: row.y,
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)))
}

function compactNumber(value: number): string {
  const safeValue = Math.max(0, value)
  if (safeValue >= 1_000_000) return `${(safeValue / 1_000_000).toFixed(1)}M`
  if (safeValue >= 1_000) return `${Math.round(safeValue / 1_000)}k`
  return String(Math.round(safeValue))
}

function levelFromTokens(tokens: number): FlameLevel {
  if (tokens >= 1_000_000) return 'inferno'
  if (tokens >= 500_000) return 'blaze'
  if (tokens >= 200_000) return 'bonfire'
  if (tokens >= 80_000) return 'steady'
  if (tokens >= 20_000) return 'campfire'
  return 'spark'
}

function estimatedTokensFromRateLimit(snapshot: UiRateLimitSnapshot | null): number {
  const percent = Math.max(snapshot?.primary?.usedPercent ?? 0, snapshot?.secondary?.usedPercent ?? 0)
  if (percent <= 0) return 0
  return Math.round((percent / 100) * 500_000)
}

async function loadSettings(): Promise<void> {
  try {
    const setting = await fetchUserSetting<unknown>(DESKTOP_SETTING_KEYS.tokenFlameWidget)
    const nextSettings = normalizeFlameSettings(setting?.value ?? DEFAULT_SETTINGS)
    settings.value = {
      ...nextSettings,
      position: nextSettings.position ? clampPosition(nextSettings.position) : null,
    }
  } catch {
    settings.value = { ...DEFAULT_SETTINGS }
  }
}

function defaultPosition(corner: FlameCorner): NonNullable<FlameSettings['position']> {
  const right = Math.max(WIDGET_MARGIN, window.innerWidth - WIDGET_SIZE - 20)
  const bottom = Math.max(WIDGET_MARGIN, window.innerHeight - WIDGET_SIZE - 20)
  if (corner === 'bottom-left') return { x: 20, y: bottom }
  if (corner === 'top-right') return { x: right, y: 80 }
  if (corner === 'top-left') return { x: 20, y: 80 }
  return { x: right, y: bottom }
}

function clampPosition(position: NonNullable<FlameSettings['position']>): NonNullable<FlameSettings['position']> {
  const rect = widgetRef.value?.getBoundingClientRect()
  const width = rect?.width || WIDGET_SIZE
  const height = rect?.height || WIDGET_SIZE
  const maxX = Math.max(WIDGET_MARGIN, window.innerWidth - width - WIDGET_MARGIN)
  const maxY = Math.max(WIDGET_MARGIN, window.innerHeight - height - WIDGET_MARGIN)
  return clampFloatingPosition(position, {
    minX: WIDGET_MARGIN,
    maxX,
    minY: WIDGET_MARGIN,
    maxY,
  })
}

function saveSettings(nextSettings = settings.value): void {
  void writeUserSetting(DESKTOP_SETTING_KEYS.tokenFlameWidget, nextSettings).catch(() => {
    // The flame remains draggable in-session even if the optional settings store is unavailable.
  })
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  const currentPosition = settings.value.position ?? defaultPosition(settings.value.defaultCorner)
  const clampedPosition = clampPosition(currentPosition)
  if (!settings.value.position) {
    settings.value = { ...settings.value, position: clampedPosition }
  }
  dragState.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: clampedPosition.x,
    startY: clampedPosition.y,
    moved: false,
  }
  widgetRef.value?.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function onPointerMove(event: PointerEvent): void {
  const drag = dragState.value
  if (!drag || event.pointerId !== drag.pointerId) return
  const deltaX = event.clientX - drag.startClientX
  const deltaY = event.clientY - drag.startClientY
  if (!drag.moved && Math.abs(deltaX) + Math.abs(deltaY) > 3) {
    drag.moved = true
    suppressNextClick = true
    isOpen.value = false
  }
  if (!drag.moved) return
  event.preventDefault()
  settings.value = {
    ...settings.value,
    position: clampPosition({
      x: drag.startX + deltaX,
      y: drag.startY + deltaY,
    }),
  }
}

function stopDrag(event: PointerEvent): void {
  const drag = dragState.value
  if (drag && event.pointerId === drag.pointerId) {
    if (drag.moved) saveSettings()
    dragState.value = null
  }
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function toggleOpen(): void {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  isOpen.value = !isOpen.value
}

function onKeyboardMove(event: KeyboardEvent): void {
  const delta = floatingKeyboardDelta(event.key, {
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  })
  if (!delta) return

  event.preventDefault()
  event.stopPropagation()

  const currentPosition = settings.value.position ?? defaultPosition(settings.value.defaultCorner)
  const rect = widgetRef.value?.getBoundingClientRect()
  const width = rect?.width || WIDGET_SIZE
  const height = rect?.height || WIDGET_SIZE
  const nextPosition = moveFloatingPosition(currentPosition, delta, {
    minX: WIDGET_MARGIN,
    maxX: Math.max(WIDGET_MARGIN, window.innerWidth - width - WIDGET_MARGIN),
    minY: WIDGET_MARGIN,
    maxY: Math.max(WIDGET_MARGIN, window.innerHeight - height - WIDGET_MARGIN),
  })
  settings.value = {
    ...settings.value,
    position: nextPosition,
  }
  saveSettings()
}

async function loadUsage(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) return
  try {
    usage.value = await fetchDailyTokenUsage(cwd)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Token usage unavailable.'
  }
}

const hasExactUsage = computed(() => (usage.value?.tokenUsageEventCount ?? 0) > 0)
const estimatedTotalTokens = computed(() => estimatedTokensFromRateLimit(props.rateLimitSnapshot))
const displayTotalTokens = computed(() => hasExactUsage.value ? usage.value?.totalTokens ?? 0 : estimatedTotalTokens.value)
const displayInputTokens = computed(() => hasExactUsage.value ? usage.value?.inputTokens ?? 0 : 0)
const displayOutputTokens = computed(() => hasExactUsage.value ? usage.value?.outputTokens ?? 0 : 0)
const fireLevel = computed<FlameLevel>(() => levelFromTokens(displayTotalTokens.value))
const compactTokenCount = computed(() => compactNumber(displayTotalTokens.value))
const formattedTotalTokens = computed(() => formatNumber(displayTotalTokens.value))
const fireLevelLabel = computed(() => ({
  spark: 'Spark',
  campfire: 'Campfire',
  steady: 'Steady burn',
  bonfire: 'Bonfire',
  blaze: 'Blaze',
  inferno: 'Inferno',
})[fireLevel.value])
const usageSourceLabel = computed(() => hasExactUsage.value ? 'Codex usage events' : 'Estimated from rate limit')
const summaryTitle = computed(() => `Today: ${formattedTotalTokens.value} tokens · ${fireLevelLabel.value}`)
const widgetStyle = computed(() => {
  const position = settings.value.position ?? defaultPosition(settings.value.defaultCorner)
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
  }
})

watch(() => props.cwd, () => {
  usage.value = null
  void loadUsage()
})

onMounted(() => {
  void loadSettings()
  void loadUsage()
  refreshTimer = window.setInterval(() => {
    void loadUsage()
  }, 60_000)
})

onUnmounted(() => {
  window.clearInterval(refreshTimer)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
})
</script>

<style scoped>
@reference "tailwindcss";

.token-flame-widget {
  @apply fixed z-40;
}

.token-flame-widget.is-dragging {
  @apply select-none;
}

.token-flame-button {
  @apply flex h-16 w-16 cursor-move flex-col items-center justify-center rounded-full border border-orange-300 bg-zinc-950 text-white shadow-xl transition hover:scale-105;
  touch-action: none;
}

.token-flame-graphic {
  @apply relative block h-9 w-9;
}

.token-flame-glow,
.token-flame-outer,
.token-flame-mid,
.token-flame-inner {
  @apply absolute bottom-0 left-1/2 block rounded-full;
  transform-origin: 50% 100%;
}

.token-flame-glow {
  @apply h-8 w-8 bg-orange-500/40;
  filter: blur(8px);
  transform: translateX(-50%) scale(1.2);
}

.token-flame-outer {
  @apply h-8 w-7 bg-orange-600;
  transform: translateX(-50%) rotate(-5deg);
  clip-path: polygon(50% 0, 86% 44%, 70% 100%, 30% 100%, 14% 44%);
  animation: flame-sway 1.2s ease-in-out infinite alternate;
}

.token-flame-mid {
  @apply h-7 w-5 bg-amber-300;
  transform: translateX(-50%) rotate(5deg);
  clip-path: polygon(50% 0, 82% 48%, 66% 100%, 34% 100%, 18% 48%);
  animation: flame-sway 0.9s ease-in-out infinite alternate-reverse;
}

.token-flame-inner {
  @apply h-5 w-3 bg-white;
  transform: translateX(-50%);
  clip-path: polygon(50% 0, 78% 52%, 64% 100%, 36% 100%, 22% 52%);
}

.token-flame-count {
  @apply mt-0.5 text-[0.62rem] font-semibold leading-none text-orange-100;
}

.token-flame-widget[data-level='spark'] .token-flame-graphic {
  transform: scale(0.72);
}

.token-flame-widget[data-level='campfire'] .token-flame-graphic {
  transform: scale(0.85);
}

.token-flame-widget[data-level='steady'] .token-flame-graphic {
  transform: scale(1);
}

.token-flame-widget[data-level='bonfire'] .token-flame-graphic {
  transform: scale(1.12);
}

.token-flame-widget[data-level='blaze'] .token-flame-graphic,
.token-flame-widget[data-level='inferno'] .token-flame-graphic {
  transform: scale(1.25);
}

.token-flame-widget[data-level='inferno'] .token-flame-outer {
  @apply bg-fuchsia-600;
}

.token-flame-widget[data-level='inferno'] .token-flame-mid {
  @apply bg-sky-300;
}

.token-flame-widget[data-calm='true'] .token-flame-outer,
.token-flame-widget[data-calm='true'] .token-flame-mid {
  animation: none;
}

.token-flame-popover {
  @apply absolute bottom-[calc(100%+0.75rem)] right-0 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-900 shadow-2xl;
}

.token-flame-widget-bottom-left .token-flame-popover,
.token-flame-widget-top-left .token-flame-popover {
  @apply left-0 right-auto;
}

.token-flame-widget-top-left .token-flame-popover,
.token-flame-widget-top-right .token-flame-popover {
  @apply bottom-auto top-[calc(100%+0.75rem)];
}

.token-flame-popover-header {
  @apply flex items-start justify-between gap-3;
}

.token-flame-popover-header h3 {
  @apply m-0 text-sm font-semibold;
}

.token-flame-popover-header p {
  @apply m-0 mt-0.5 text-xs text-zinc-500;
}

.token-flame-popover-header button {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-50;
}

.token-flame-stats {
  @apply mt-3 grid grid-cols-2 gap-2;
}

.token-flame-stats div {
  @apply rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5;
}

.token-flame-stats dt {
  @apply text-[0.65rem] font-semibold uppercase text-zinc-500;
}

.token-flame-stats dd {
  @apply m-0 text-sm font-semibold text-zinc-950;
}

.token-flame-error {
  @apply m-0 mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700;
}

@keyframes flame-sway {
  from {
    transform: translateX(-50%) rotate(-7deg) scaleY(0.96);
  }
  to {
    transform: translateX(-50%) rotate(7deg) scaleY(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .token-flame-outer,
  .token-flame-mid {
    animation: none;
  }
}

:global(.app-dark) .token-flame-popover {
  border-color: var(--color-border);
  background: var(--color-panel);
  color: var(--color-text);
}

:global(.app-dark) .token-flame-popover-header p,
:global(.app-dark) .token-flame-stats dt {
  color: var(--color-text-muted);
}

:global(.app-dark) .token-flame-popover-header button,
:global(.app-dark) .token-flame-stats div {
  border-color: var(--color-border);
  background: var(--color-elevated);
  color: var(--color-text);
}

:global(.app-dark) .token-flame-stats dd {
  color: var(--color-text);
}
</style>
