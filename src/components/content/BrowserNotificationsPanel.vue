<template>
  <div class="browser-notifications" data-testid="browser-notifications-panel">
    <button
      class="browser-notifications-trigger"
      type="button"
      :aria-expanded="isOpen"
      :aria-label="t('notifications.open')"
      :title="t('notifications.title')"
      @click="isOpen = !isOpen"
    >
      <IconTablerBell class="browser-notifications-trigger-icon" />
      <span v-if="unreadCount > 0" class="browser-notifications-badge">{{ badgeText }}</span>
    </button>

    <section v-if="isOpen" class="browser-notifications-popover" :aria-label="t('notifications.title')">
      <header class="browser-notifications-header">
        <div>
          <h2>{{ t('notifications.title') }}</h2>
          <p>{{ permissionLabel }}</p>
        </div>
        <button class="browser-notifications-clear" type="button" :disabled="events.length === 0" @click="clearEvents">
          {{ t('notifications.clear') }}
        </button>
      </header>

      <div class="browser-notifications-controls">
        <label>
          <span>{{ t('notifications.browserAlerts') }}</span>
          <select :value="preference" @change="onPreferenceChange">
            <option value="off">{{ t('notifications.off') }}</option>
            <option value="important">{{ t('notifications.important') }}</option>
            <option value="all">{{ t('notifications.all') }}</option>
          </select>
        </label>
        <button
          v-if="isSupported && permission === 'default'"
          class="browser-notifications-enable"
          type="button"
          @click="requestPermission"
        >
          {{ t('notifications.enable') }}
        </button>
      </div>

      <p v-if="lastError" class="browser-notifications-error">{{ lastError }}</p>

      <ol v-if="events.length > 0" class="browser-notifications-list">
        <li
          v-for="event in events"
          :key="event.id"
          class="browser-notifications-event"
          :data-severity="event.severity"
        >
          <div class="browser-notifications-event-header">
            <span>{{ event.title }}</span>
            <time :datetime="event.createdAtIso">{{ formatTime(event.createdAtIso) }}</time>
          </div>
          <p>{{ event.body }}</p>
        </li>
      </ol>

      <p v-else class="browser-notifications-empty">{{ t('notifications.empty') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconTablerBell from '../icons/IconTablerBell.vue'
import { useLocale } from '../../composables/useLocale'
import type {
  BrowserNotificationEvent,
  BrowserNotificationPermission,
  BrowserNotificationPreference,
} from '../../composables/useBrowserNotifications'

const props = defineProps<{
  preference: BrowserNotificationPreference
  permission: BrowserNotificationPermission
  events: BrowserNotificationEvent[]
  unreadCount: number
  isSupported: boolean
  lastError: string
}>()

const emit = defineEmits<{
  'update:preference': [value: BrowserNotificationPreference]
  requestPermission: []
  clear: []
}>()

const isOpen = ref(false)
const { t } = useLocale()

const badgeText = computed(() => (props.unreadCount > 9 ? '9+' : String(props.unreadCount)))
const permissionLabel = computed(() => {
  if (!props.isSupported) return t('notifications.permission.unsupported')
  if (props.permission === 'granted') return t('notifications.permission.granted')
  if (props.permission === 'denied') return t('notifications.permission.denied')
  return t('notifications.permission.default')
})

function onPreferenceChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'off' || value === 'important' || value === 'all') {
    emit('update:preference', value)
  }
}

function requestPermission(): void {
  emit('requestPermission')
}

function clearEvents(): void {
  emit('clear')
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '--:--'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<style scoped>
@reference "../../style.css";

.browser-notifications {
  position: relative;
}

.browser-notifications-trigger {
  @apply relative inline-flex h-9 w-9 items-center justify-center rounded-md border theme-border theme-bg-panel theme-muted shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2;
}

.browser-notifications-trigger:hover,
.browser-notifications-trigger[aria-expanded='true'] {
  border-color: color-mix(in srgb, var(--color-accent) 55%, var(--color-border));
  background: var(--color-info-soft);
  color: var(--color-info);
}

.browser-notifications-trigger-icon {
  @apply h-5 w-5;
}

.browser-notifications-badge {
  @apply absolute -right-1.5 -top-1.5 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full theme-bg-danger px-1 font-mono text-[0.58rem] font-bold leading-none theme-on-danger;
  box-shadow: 0 0 0 2px var(--color-background);
}

.browser-notifications-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 50;
  width: min(23rem, calc(100vw - 1rem));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-panel) 97%, transparent);
  padding: 0.75rem;
  color: var(--color-text);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(18px);
}

.browser-notifications-header,
.browser-notifications-controls,
.browser-notifications-event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.browser-notifications-header h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.2;
}

.browser-notifications-header p,
.browser-notifications-empty,
.browser-notifications-error {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.35;
}

.browser-notifications-clear,
.browser-notifications-enable {
  min-height: 1.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-control);
  padding: 0 0.55rem;
  color: var(--color-text);
  font-size: 0.72rem;
  font-weight: 600;
}

.browser-notifications-clear:disabled {
  cursor: default;
  opacity: 0.45;
}

.browser-notifications-clear:hover:not(:disabled),
.browser-notifications-enable:hover { background: var(--color-control-hover); }

.browser-notifications-controls {
  margin-top: 0.75rem;
}

.browser-notifications-controls label {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 8rem;
  align-items: center;
  gap: 0.75rem;
}

.browser-notifications-controls span {
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 600;
}

.browser-notifications-controls select {
  width: 100%;
  min-height: 1.85rem;
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  background: var(--color-control);
  color: var(--color-text);
  font-size: 0.76rem;
}

.browser-notifications-error {
  color: var(--color-danger);
}

.browser-notifications-list {
  display: flex;
  max-height: 19rem;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  overflow: auto;
  padding: 0;
  list-style: none;
}

.browser-notifications-event {
  border: 1px solid var(--color-border);
  border-left-width: 0.25rem;
  border-radius: 0.5rem;
  background: var(--color-surface-muted);
  padding: 0.55rem 0.65rem;
}

.browser-notifications-event[data-severity='success'] {
  border-left-color: var(--color-success);
}

.browser-notifications-event[data-severity='warning'] {
  border-left-color: var(--color-warning);
}

.browser-notifications-event[data-severity='danger'] {
  border-left-color: var(--color-danger);
}

.browser-notifications-event[data-severity='info'] {
  border-left-color: var(--color-info);
}

.browser-notifications-event-header span {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-notifications-event-header time {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: 0.68rem;
}

.browser-notifications-event p {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.browser-notifications-empty {
  margin-top: 0.75rem;
}

@media (max-width: 700px) {
  .browser-notifications-popover {
    right: -0.5rem;
  }

  .browser-notifications-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .browser-notifications-controls label {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
}
</style>
