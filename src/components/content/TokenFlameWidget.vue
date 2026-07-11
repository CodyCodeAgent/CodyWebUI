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
      <span class="token-flame-stage" aria-hidden="true">
        <svg class="token-flame-graphic" viewBox="0 0 100 128" role="presentation">
          <defs>
            <linearGradient id="token-flame-outer" x1="0" y1="1" x2="0.68" y2="0">
              <stop stop-color="#ff3d24" />
              <stop offset="0.58" stop-color="#ff6b24" />
              <stop offset="1" stop-color="#ff9b35" />
            </linearGradient>
            <linearGradient id="token-flame-middle" x1="0" y1="1" x2="0.42" y2="0">
              <stop stop-color="#ff8a1f" />
              <stop offset="1" stop-color="#ffd166" />
            </linearGradient>
            <linearGradient id="token-flame-core" x1="0" y1="1" x2="0.5" y2="0">
              <stop stop-color="#fff0bd" />
              <stop offset="1" stop-color="#fffdf4" />
            </linearGradient>
            <filter id="token-flame-blur" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>
          <ellipse class="token-flame-glow" cx="50" cy="84" rx="33" ry="31" filter="url(#token-flame-blur)" />
          <g class="token-flame-sparks">
            <circle class="token-flame-spark token-flame-spark-one" cx="23" cy="47" r="2.5" />
            <circle class="token-flame-spark token-flame-spark-two" cx="76" cy="31" r="2" />
            <circle class="token-flame-spark token-flame-spark-three" cx="57" cy="13" r="1.7" />
          </g>
          <g class="token-flame-body">
            <path class="token-flame-outer" :d="outerFlamePath" />
            <path class="token-flame-middle" d="M50 108C29 101 25 82 35 66C42 55 45 45 44 34C59 46 68 65 65 82C62 98 56 105 50 108Z" />
            <path class="token-flame-core" d="M50 104C39 98 37 85 43 76C47 70 49 63 50 55C59 65 63 77 60 89C58 98 54 102 50 104Z" />
          </g>
        </svg>
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
import type { UiDailyTokenUsage } from '../../types/codex'

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
}>()

const DEFAULT_SETTINGS: FlameSettings = {
  enabled: true,
  defaultCorner: 'bottom-right',
  reducedMotion: false,
  position: null,
}
const WIDGET_WIDTH = 84
const WIDGET_HEIGHT = 92
const WIDGET_MARGIN = 12
const BOTTOM_ACTION_SAFE_AREA = 112

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
  const right = Math.max(WIDGET_MARGIN, window.innerWidth - WIDGET_WIDTH - 20)
  const bottom = Math.max(WIDGET_MARGIN, window.innerHeight - WIDGET_HEIGHT - BOTTOM_ACTION_SAFE_AREA)
  if (corner === 'bottom-left') return { x: 20, y: bottom }
  if (corner === 'top-right') return { x: right, y: 80 }
  if (corner === 'top-left') return { x: 20, y: 80 }
  return { x: right, y: bottom }
}

function clampPosition(position: NonNullable<FlameSettings['position']>): NonNullable<FlameSettings['position']> {
  const rect = widgetRef.value?.getBoundingClientRect()
  const width = rect?.width || WIDGET_WIDTH
  const height = rect?.height || WIDGET_HEIGHT
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
  const width = rect?.width || WIDGET_WIDTH
  const height = rect?.height || WIDGET_HEIGHT
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

const hasUsage = computed(() => (usage.value?.tokenUsageEventCount ?? 0) > 0)
const displayTotalTokens = computed(() => usage.value?.totalTokens ?? 0)
const displayInputTokens = computed(() => usage.value?.inputTokens ?? 0)
const displayOutputTokens = computed(() => usage.value?.outputTokens ?? 0)
const fireLevel = computed<FlameLevel>(() => levelFromTokens(displayTotalTokens.value))
const outerFlamePath = computed(() => {
  if (fireLevel.value === 'spark') {
    return 'M50 114C25 105 19 83 30 62C37 49 43 39 43 23C58 37 72 55 71 76C70 97 61 109 50 114Z'
  }
  if (fireLevel.value === 'campfire' || fireLevel.value === 'steady') {
    return 'M50 114C21 105 15 80 28 57C36 43 40 32 38 15C49 24 55 36 55 47C65 39 73 46 78 57C88 77 79 104 50 114Z'
  }
  return 'M50 114C19 105 12 79 26 55C33 43 36 31 33 15C44 23 50 34 51 44C60 31 64 19 61 4C78 18 85 39 79 56C92 66 95 82 88 96C81 108 66 114 50 114Z'
})
const compactTokenCount = computed(() => hasUsage.value ? compactNumber(displayTotalTokens.value) : '—')
const formattedTotalTokens = computed(() => hasUsage.value ? formatNumber(displayTotalTokens.value) : 'Unavailable')
const fireLevelLabel = computed(() => ({
  spark: 'Spark',
  campfire: 'Campfire',
  steady: 'Steady burn',
  bonfire: 'Bonfire',
  blaze: 'Blaze',
  inferno: 'Inferno',
})[fireLevel.value])
const usageSourceLabel = computed(() => {
  if (usage.value?.source === 'reconciled-rollouts') {
    const timestamp = usage.value.lastReconciledAtIso
    const reconciled = timestamp ? new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)) : 'recently'
    return `Local Codex sessions · checked ${reconciled}`
  }
  if (usage.value?.source === 'realtime-events') return 'Live Codex events · awaiting cross-check'
  return 'No local token usage found today'
})
const summaryTitle = computed(() => hasUsage.value
  ? `Today: ${formattedTotalTokens.value} tokens · ${fireLevelLabel.value}`
  : 'Today’s token usage is unavailable')
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
@reference "../../style.css";

.token-flame-widget {
  @apply fixed z-40;
}

.token-flame-widget.is-dragging {
  @apply select-none;
}

.token-flame-button {
  --flame-size: 32px;
  --flame-motion: 2.8s;
  --flame-aura-size: 72px;
  --flame-aura-opacity: 0.24;
  @apply relative flex h-[92px] w-[84px] cursor-move flex-col items-center justify-end border-0 bg-transparent pb-1 text-white transition duration-200 hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2;
  touch-action: none;
}

.token-flame-stage {
  @apply absolute bottom-7 left-1/2 flex items-end justify-center;
  width: 72px;
  height: 70px;
  isolation: isolate;
  transform: translateX(-50%);
}

.token-flame-stage::before {
  position: absolute;
  z-index: -1;
  bottom: -8px;
  left: 50%;
  width: var(--flame-aura-size);
  height: var(--flame-aura-size);
  border-radius: 50%;
  background: radial-gradient(circle, rgb(255 196 82 / 0.78) 0%, rgb(255 101 35 / 0.48) 28%, rgb(255 61 36 / 0.2) 52%, transparent 74%);
  content: '';
  opacity: var(--flame-aura-opacity);
  filter: blur(5px);
  pointer-events: none;
  transform: translateX(-50%) scale(0.94);
  animation: token-flame-aura-breathe calc(var(--flame-motion) * 1.55) ease-in-out infinite alternate;
}

.token-flame-graphic {
  display: block;
  width: var(--flame-size);
  height: calc(var(--flame-size) * 1.28);
  overflow: visible;
  filter: drop-shadow(0 8px 8px rgb(0 0 0 / 0.34));
  transition: width 320ms cubic-bezier(.2,.8,.2,1), height 320ms cubic-bezier(.2,.8,.2,1), filter 320ms ease;
}

.token-flame-glow {
  fill: #ff5b2c;
  opacity: 0.14;
  transition: opacity 320ms ease;
  animation: token-flame-glow-breathe calc(var(--flame-motion) * 1.7) ease-in-out infinite;
}

.token-flame-outer {
  fill: url(#token-flame-outer);
  transform-origin: 50px 112px;
  animation: token-flame-outer-sway var(--flame-motion) ease-in-out infinite alternate;
}

.token-flame-middle {
  fill: url(#token-flame-middle);
  transform-origin: 50px 108px;
  animation: token-flame-middle-sway calc(var(--flame-motion) * 0.82) ease-in-out infinite alternate-reverse;
}

.token-flame-core {
  fill: url(#token-flame-core);
  transform-origin: 50px 104px;
  animation: token-flame-core-breathe calc(var(--flame-motion) * 1.2) ease-in-out infinite alternate;
}

.token-flame-spark {
  fill: #ffd166;
  opacity: 0;
  transform-origin: center;
}

.token-flame-spark-two { fill: #ff8a1f; }
.token-flame-spark-three { fill: #fff4d6; }

.token-flame-widget[data-level='bonfire'] .token-flame-spark-one,
.token-flame-widget[data-level='blaze'] .token-flame-spark-one,
.token-flame-widget[data-level='blaze'] .token-flame-spark-two,
.token-flame-widget[data-level='inferno'] .token-flame-spark {
  animation: token-flame-spark-rise 2.2s ease-out infinite;
}

.token-flame-widget[data-level='blaze'] .token-flame-spark-two,
.token-flame-widget[data-level='inferno'] .token-flame-spark-two { animation-delay: -0.9s; }
.token-flame-widget[data-level='inferno'] .token-flame-spark-three { animation-delay: -1.55s; }

.token-flame-count {
  @apply relative z-10 min-w-11 rounded-full border border-orange-200/20 bg-zinc-950/80 px-2 py-1 text-center font-mono text-[0.67rem] font-semibold leading-none tracking-wide text-orange-50 shadow-lg backdrop-blur-md;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.token-flame-widget[data-level='spark'] .token-flame-button { --flame-size: 30px; --flame-motion: 3.4s; --flame-aura-size: 62px; --flame-aura-opacity: 0.16; }
.token-flame-widget[data-level='campfire'] .token-flame-button { --flame-size: 36px; --flame-motion: 3s; --flame-aura-size: 72px; --flame-aura-opacity: 0.22; }
.token-flame-widget[data-level='steady'] .token-flame-button { --flame-size: 43px; --flame-motion: 2.7s; --flame-aura-size: 82px; --flame-aura-opacity: 0.3; }
.token-flame-widget[data-level='bonfire'] .token-flame-button { --flame-size: 50px; --flame-motion: 2.35s; --flame-aura-size: 94px; --flame-aura-opacity: 0.38; }
.token-flame-widget[data-level='blaze'] .token-flame-button { --flame-size: 58px; --flame-motion: 2.05s; --flame-aura-size: 108px; --flame-aura-opacity: 0.48; }
.token-flame-widget[data-level='inferno'] .token-flame-button { --flame-size: 67px; --flame-motion: 1.8s; --flame-aura-size: 124px; --flame-aura-opacity: 0.58; }

.token-flame-widget[data-level='spark'] .token-flame-glow { opacity: 0.08; }
.token-flame-widget[data-level='campfire'] .token-flame-glow { opacity: 0.13; }
.token-flame-widget[data-level='steady'] .token-flame-glow { opacity: 0.18; }
.token-flame-widget[data-level='bonfire'] .token-flame-glow { opacity: 0.24; }
.token-flame-widget[data-level='blaze'] .token-flame-glow { opacity: 0.31; }
.token-flame-widget[data-level='inferno'] .token-flame-glow { opacity: 0.4; }

.token-flame-widget[data-level='blaze'] .token-flame-graphic,
.token-flame-widget[data-level='inferno'] .token-flame-graphic {
  filter: drop-shadow(0 9px 10px rgb(0 0 0 / 0.35)) drop-shadow(0 0 12px rgb(255 83 36 / 0.28));
}

@media (max-width: 900px) {
  .token-flame-widget {
    display: none;
  }
}

.token-flame-widget[data-calm='true'] :is(.token-flame-outer, .token-flame-middle, .token-flame-core, .token-flame-glow, .token-flame-spark) {
  animation: none;
}

.token-flame-widget[data-calm='true'] .token-flame-stage::before {
  animation: none;
}

.token-flame-popover {
  @apply absolute bottom-[calc(100%+0.75rem)] right-0 w-72 rounded-lg border theme-border theme-bg-panel p-3 theme-text shadow-2xl;
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
  @apply m-0 mt-0.5 text-xs theme-muted;
}

.token-flame-popover-header button {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md border theme-border theme-bg-panel text-sm theme-muted transition hover:theme-bg-subtle;
}

.token-flame-stats {
  @apply mt-3 grid grid-cols-2 gap-2;
}

.token-flame-stats div {
  @apply rounded-md border theme-border theme-bg-subtle px-2 py-1.5;
}

.token-flame-stats dt {
  @apply text-[0.65rem] font-semibold uppercase theme-muted;
}

.token-flame-stats dd {
  @apply m-0 text-sm font-semibold theme-text;
}

.token-flame-error {
  @apply m-0 mt-2 rounded-md border theme-border-danger theme-bg-danger-soft px-2 py-1 text-xs theme-text-danger;
}

@keyframes token-flame-aura-breathe {
  from { opacity: calc(var(--flame-aura-opacity) * 0.72); transform: translateX(-50%) scale(0.88); }
  to { opacity: var(--flame-aura-opacity); transform: translateX(-50%) scale(1.04); }
}

@keyframes token-flame-outer-sway {
  from { transform: rotate(-2.7deg) scaleX(0.985) scaleY(0.97); }
  to { transform: rotate(2.7deg) scaleX(1.015) scaleY(1.025); }
}

@keyframes token-flame-middle-sway {
  from { transform: rotate(-2deg) translateY(1px) scaleY(0.98); }
  to { transform: rotate(2.4deg) translateY(-1px) scaleY(1.025); }
}

@keyframes token-flame-core-breathe {
  from { transform: scale(0.96, 0.975); opacity: 0.92; }
  to { transform: scale(1.025, 1.035); opacity: 1; }
}

@keyframes token-flame-glow-breathe {
  0%, 100% { transform: scale(0.88); }
  50% { transform: scale(1.12); }
}

@keyframes token-flame-spark-rise {
  0% { opacity: 0; transform: translateY(8px) scale(0.65); }
  24% { opacity: 0.95; }
  100% { opacity: 0; transform: translateY(-18px) translateX(3px) scale(0.2); }
}

@media (prefers-reduced-motion: reduce) {
  .token-flame-widget :is(.token-flame-outer, .token-flame-middle, .token-flame-core, .token-flame-glow, .token-flame-spark) {
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
