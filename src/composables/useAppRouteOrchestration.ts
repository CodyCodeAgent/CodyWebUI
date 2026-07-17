import { computed, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import type { UiProjectGroup, UiThread } from '../types/codex'

export function useAppRouteOrchestration(input: {
  projectGroups: Ref<UiProjectGroup[]>
  projectDisplayNameById: Ref<Record<string, string>>
  selectedThread: Ref<UiThread | null>
  newThreadCwd: Ref<string>
  translate: (key: 'app.title.settings' | 'skills.title' | 'app.title.newThread' | 'app.title.chooseThread') => string
}) {
  const route = useRoute()
  const routeThreadId = computed(() => typeof route.params.threadId === 'string' ? route.params.threadId : '')
  const isHomeRoute = computed(() => route.name === 'home')
  const isSettingsRoute = computed(() => route.name === 'settings')
  const isSkillsRoute = computed(() => route.name === 'skills')
  const skillsCwd = computed(() => typeof route.query.cwd === 'string' ? route.query.cwd.trim() : input.newThreadCwd.value)
  const skillsProjectLabel = computed(() => {
    const group = input.projectGroups.value.find((item) => {
      const cwd = item.cwd?.trim() || item.threads[0]?.cwd?.trim() || ''
      return cwd === skillsCwd.value
    })
    return group
      ? input.projectDisplayNameById.value[group.projectName]?.trim() || group.projectName
      : skillsCwd.value
  })
  const contentTitle = computed(() => {
    if (isSettingsRoute.value) return input.translate('app.title.settings')
    if (isSkillsRoute.value) return input.translate('skills.title')
    if (isHomeRoute.value) return input.translate('app.title.newThread')
    return input.selectedThread.value?.title ?? input.translate('app.title.chooseThread')
  })
  return { routeThreadId, isHomeRoute, isSettingsRoute, isSkillsRoute, skillsCwd, skillsProjectLabel, contentTitle }
}
