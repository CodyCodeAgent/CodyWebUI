<template>
  <div class="agent-task-editor-backdrop" @click.self="$emit('close')">
    <form class="agent-task-editor" @submit.prevent="$emit('submit')">
      <header>
        <div><span>{{ kicker }}</span><h3>{{ title }}</h3></div>
        <button type="button" :aria-label="t('agentTasks.close')" :disabled="saving" @click="$emit('close')"><IconTablerX /></button>
      </header>
      <slot />
      <footer>
        <button type="button" :disabled="saving" @click="$emit('close')">{{ t('agentTasks.cancel') }}</button>
        <button class="primary" type="submit" :disabled="saving">{{ saving ? t('agentTasks.saving') : t('agentTasks.save') }}</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '../../composables/useLocale'
import IconTablerX from '../icons/IconTablerX.vue'

defineProps<{ kicker: string; title: string; saving: boolean }>()
defineEmits<{ close: []; submit: [] }>()
const { t } = useLocale()
</script>
