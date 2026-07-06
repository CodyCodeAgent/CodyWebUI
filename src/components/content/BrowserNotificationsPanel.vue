<template>
  <div class="browser-notifications" data-testid="browser-notifications-panel">
    <button
      class="browser-notifications-trigger"
      type="button"
      :aria-expanded="isOpen"
      aria-label="Open notifications"
      title="Notifications"
      @click="isOpen = !isOpen"
    >
      <IconTablerBell class="browser-notifications-trigger-icon" />
      <span v-if="unreadCount > 0" class="browser-notifications-badge">{{ badgeText }}</span>
    </button>

    <section v-if="isOpen" class="browser-notifications-popover" aria-label="Browser notifications">
      <header class="browser-notifications-header">
        <div>
          <h2>Notifications</h2>
          <p>{{ permissionLabel }}</p>
        </div>
        <button class="browser-notifications-clear" type="button" :disabled="events.length === 0" @click="clearEvents">
          Clear
        </button>
      </header>

      <div class="browser-notifications-controls">
        <label>
          <span>Browser alerts</span>
          <select :value="preference" @change="onPreferenceChange">
            <option value="off">Off</option>
            <option value="important">Important</option>
            <option value="all">All</option>
          </select>
        </label>
        <button
          v-if="isSupported && permission === 'default'"
          class="browser-notifications-enable"
          type="button"
          @click="requestPermission"
        >
          Enable
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

      <p v-else class="browser-notifications-empty">No remote supervision events yet.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconTablerBell from '../icons/IconTablerBell.vue'
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

const badgeText = computed(() => (props.unreadCount > 9 ? '9+' : String(props.unreadCount)))
const permissionLabel = computed(() => {
  if (!props.isSupported) return 'Not supported by this browser'
  if (props.permission === 'granted') return 'Native alerts enabled'
  if (props.permission === 'denied') return 'Native alerts blocked'
  return 'Native alerts need permission'
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
.browser-notifications {
  position: relative;
}

.browser-notifications-trigger {
  position: relative;
  display: flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #e4e4e7;
  border-radius: 0.5rem;
  background: #fff;
  color: #52525b;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.browser-notifications-trigger:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #18181b;
}

.browser-notifications-trigger-icon {
  width: 1rem;
  height: 1rem;
}

.browser-notifications-badge {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
  display: flex;
  min-width: 1.1rem;
  height: 1.1rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.browser-notifications-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 50;
  width: min(23rem, calc(100vw - 1rem));
  border: 1px solid #e4e4e7;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.98);
  padding: 0.75rem;
  color: #27272a;
  box-shadow: 0 18px 40px rgb(15 23 42 / 0.16);
  backdrop-filter: blur(10px);
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
  color: #18181b;
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.2;
}

.browser-notifications-header p,
.browser-notifications-empty,
.browser-notifications-error {
  margin: 0.2rem 0 0;
  color: #71717a;
  font-size: 0.72rem;
  line-height: 1.35;
}

.browser-notifications-clear,
.browser-notifications-enable {
  min-height: 1.75rem;
  border: 1px solid #e4e4e7;
  border-radius: 0.45rem;
  background: #fff;
  padding: 0 0.55rem;
  color: #3f3f46;
  font-size: 0.72rem;
  font-weight: 600;
}

.browser-notifications-clear:disabled {
  cursor: default;
  opacity: 0.45;
}

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
  color: #52525b;
  font-size: 0.74rem;
  font-weight: 600;
}

.browser-notifications-controls select {
  width: 100%;
  min-height: 1.85rem;
  border: 1px solid #d4d4d8;
  border-radius: 0.45rem;
  background: #fff;
  color: #27272a;
  font-size: 0.76rem;
}

.browser-notifications-error {
  color: #b91c1c;
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
  border: 1px solid #e4e4e7;
  border-left-width: 0.25rem;
  border-radius: 0.5rem;
  background: #fafafa;
  padding: 0.55rem 0.65rem;
}

.browser-notifications-event[data-severity='success'] {
  border-left-color: #16a34a;
}

.browser-notifications-event[data-severity='warning'] {
  border-left-color: #d97706;
}

.browser-notifications-event[data-severity='danger'] {
  border-left-color: #dc2626;
}

.browser-notifications-event[data-severity='info'] {
  border-left-color: #2563eb;
}

.browser-notifications-event-header span {
  min-width: 0;
  overflow: hidden;
  color: #27272a;
  font-size: 0.78rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-notifications-event-header time {
  flex: 0 0 auto;
  color: #71717a;
  font-size: 0.68rem;
}

.browser-notifications-event p {
  margin: 0.25rem 0 0;
  color: #52525b;
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
