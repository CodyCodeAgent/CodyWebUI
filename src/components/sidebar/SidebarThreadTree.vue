<template>
  <section class="thread-tree-root">
    <SidebarMenuRow as="header" class="thread-tree-header-row">
      <span class="thread-tree-header">{{ projectHeaderLabel }}</span>
      <template #right>
        <button class="thread-hidden-view-toggle" type="button" @click="$emit('toggle-hidden-view', !isHiddenView)">
          {{ hiddenViewToggleLabel }}
        </button>
      </template>
    </SidebarMenuRow>

    <details class="thread-status-legend">
      <summary>Status guide</summary>
      <div>
        <span><i data-state="working" />Running</span>
        <span><i data-state="unread" />New activity</span>
        <span><i data-state="attention" />Needs review</span>
      </div>
    </details>

    <p v-if="isLoading && groups.length === 0" class="thread-tree-loading">Loading threads...</p>

    <template v-else>
      <p v-if="hasNoSearchResults" class="thread-tree-no-results">No matching threads</p>

      <div v-else ref="groupsContainerRef" class="thread-tree-projects" :style="groupsContainerStyle">
        <article
          v-for="group in filteredProjects"
          :key="group.projectName"
          :ref="(el) => setProjectGroupRef(group.projectName, el)"
          class="project-group"
          :data-project-name="group.projectName"
          :data-active="isProjectSelected(group)"
          :data-expanded="!isCollapsed(group.projectName)"
          :data-dragging="isDraggingProject(group.projectName)"
          :style="projectGroupStyle(group.projectName)"
        >
          <SidebarMenuRow
            as="div"
            class="project-header-row"
            :data-active="isProjectSelected(group)"
            :force-right-hover="isProjectMenuOpen(group.projectName)"
            role="button"
            tabindex="0"
            :aria-expanded="!isCollapsed(group.projectName)"
            @click="onProjectSelect(group.projectName)"
            @keydown.enter.prevent="onProjectSelect(group.projectName)"
            @keydown.space.prevent="onProjectSelect(group.projectName)"
          >
            <template #left>
              <span class="project-icon-stack">
                <span class="project-icon-folder">
                  <IconTablerFolder v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerFolderOpen v-else class="thread-icon" />
                </span>
                <span class="project-icon-chevron">
                  <IconTablerChevronRight v-if="isCollapsed(group.projectName)" class="thread-icon" />
                  <IconTablerChevronDown v-else class="thread-icon" />
                </span>
              </span>
            </template>
            <span
              class="project-main-button"
              :data-dragging-handle="isDraggingProject(group.projectName)"
              @mousedown.left="onProjectHandleMouseDown($event, group.projectName)"
            >
              <span class="project-title" :title="getProjectTitleText(group)">
                <span class="project-title-name">{{ getProjectDisplayName(group.projectName) }}</span>
                <span v-if="getProjectPath(group)" class="project-title-path" :title="getProjectPath(group)">
                  {{ getProjectPath(group) }}
                </span>
              </span>
            </span>
            <template #right>
              <button
                class="project-skills-entry"
                type="button"
                :aria-label="t('skills.openProject')"
                :title="t('skills.openProject')"
                @click.stop="onOpenProjectSkills(group)"
              >
                <span aria-hidden="true">◇</span>
                <small v-if="projectSkillCount(group) !== null">{{ projectSkillCount(group) }}</small>
              </button>
            </template>
            <template #right-hover>
              <div class="project-hover-controls">
                <button
                  class="project-skills-entry"
                  type="button"
                  :aria-label="t('skills.openProject')"
                  :title="t('skills.openProject')"
                  @click.stop="onOpenProjectSkills(group)"
                >
                  <span aria-hidden="true">◇</span>
                  <small v-if="projectSkillCount(group) !== null">{{ projectSkillCount(group) }}</small>
                </button>
                <div :ref="(el) => setProjectMenuWrapRef(group.projectName, el)" class="project-menu-wrap">
                  <button
                    class="project-menu-trigger"
                    type="button"
                    title="project_menu"
                    @click.stop="toggleProjectMenu(group.projectName)"
                  >
                    <IconTablerDots class="thread-icon" />
                  </button>

                  <div v-if="isProjectMenuOpen(group.projectName)" class="project-menu-panel" @click.stop>
                    <template v-if="projectMenuMode === 'actions'">
                      <button class="project-menu-item" type="button" @click="openRenameProjectMenu(group.projectName)">
                        Edit name
                      </button>
                      <button v-if="isHiddenView" class="project-menu-item" type="button" @click="onRestoreProject(group.projectName)">
                        Restore project
                      </button>
                      <button v-else class="project-menu-item project-menu-item-danger" type="button" @click="onHideProject(group.projectName)">
                        Hide project
                      </button>
                    </template>
                    <template v-else>
                      <label class="project-menu-label">Project name</label>
                      <input
                        v-model="projectRenameDraft"
                        class="project-menu-input"
                        type="text"
                        @input="onProjectNameInput(group.projectName)"
                      />
                    </template>
                  </div>
                </div>

                <button
                  class="thread-start-button"
                  type="button"
                  :aria-label="getNewThreadButtonAriaLabel(group.projectName)"
                  :title="getNewThreadButtonAriaLabel(group.projectName)"
                  @click.stop="onStartNewThread(group.projectName)"
                >
                  <IconTablerFilePencil class="thread-icon" />
                </button>
              </div>
            </template>
          </SidebarMenuRow>

          <ul v-if="hasProjectThreads(group)" class="thread-list project-thread-list">
            <li v-for="thread in visibleProjectThreads(group)" :key="thread.id" class="thread-row-item">
              <SidebarMenuRow
                class="thread-row"
                :data-active="thread.id === selectedThreadId"
                :data-pinned="isPinned(thread.id)"
                :force-right-hover="isThreadMenuOpen(thread.id)"
                @click="onSelect(thread.id)"
                @mouseleave="onThreadRowLeave(thread.id)"
              >
                <template #left>
                  <span class="thread-left-stack">
                    <span
                      v-if="thread.inProgress || thread.unread"
                      class="thread-status-indicator"
                      :data-state="getThreadState(thread)"
                    />
                    <button class="thread-pin-button" type="button" title="pin" @click.stop="togglePin(thread.id)">
                      <IconTablerPin class="thread-icon" />
                    </button>
                  </span>
                </template>
                <input
                  v-if="isRenamingThread(thread.id)"
                  :ref="(el) => setThreadRenameInputRef(thread.id, el)"
                  v-model="threadRenameDraft"
                  class="thread-rename-input"
                  type="text"
                  @click.stop
                  @mousedown.stop
                  @blur="submitThreadRename(thread)"
                  @keydown.enter.prevent="submitThreadRename(thread)"
                  @keydown.esc.stop.prevent="cancelThreadRename"
                />
                <button v-else class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
                  <span class="thread-row-title">{{ thread.title }}</span>
                </button>
                <template #right>
                  <span class="thread-row-time">{{ formatThreadRelative(thread) }}</span>
                </template>
                <template #right-hover>
                  <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                    <button class="thread-menu-trigger" type="button" title="thread_menu" @click.stop="toggleThreadMenu(thread.id)">
                      <IconTablerDots class="thread-icon" />
                    </button>

                    <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                      <button class="thread-menu-item" type="button" @click="startThreadRenameFromMenu(thread)">Rename</button>
                      <button v-if="!isHiddenView" class="thread-menu-item" type="button" @click="onForkClick(thread.id)">Fork</button>
                      <button v-if="!isHiddenView" class="thread-menu-item" type="button" @click="onCompactClick(thread.id)">Compact</button>
                      <button v-if="isHiddenView" class="thread-menu-item" type="button" @click="onRestoreClick(thread.id)">Restore</button>
                      <button v-else class="thread-menu-item thread-menu-item-danger" type="button" @click="onHideClick(thread.id)">
                        {{ hideThreadButtonLabel(thread.id) }}
                      </button>
                    </div>
                  </div>
                </template>
              </SidebarMenuRow>
            </li>
          </ul>

          <SidebarMenuRow
            v-if="hasHiddenProjectThreads(group)"
            as="button"
            class="thread-show-more-row"
            type="button"
            :data-expanded="isExpanded(group.projectName)"
            @click="toggleProjectExpansion(group.projectName)"
          >
            <template #left>
              <IconTablerChevronDown
                class="thread-show-more-chevron"
                :data-expanded="isExpanded(group.projectName)"
              />
            </template>
            <span class="thread-show-more-label">{{ projectExpansionButtonLabel(group) }}</span>
          </SidebarMenuRow>
        </article>
      </div>

      <SidebarMenuRow as="header" class="thread-tree-header-row conversation-section-header">
        <span class="thread-tree-header">{{ conversationHeaderLabel }}</span>
      </SidebarMenuRow>

      <ul v-if="conversationRows.length > 0" class="thread-list">
        <li v-for="thread in conversationRows" :key="thread.id" class="thread-row-item">
          <SidebarMenuRow
            class="thread-row"
            :data-active="thread.id === selectedThreadId"
            :data-pinned="isPinned(thread.id)"
            :force-right-hover="isThreadMenuOpen(thread.id)"
            @click="onSelect(thread.id)"
            @mouseleave="onThreadRowLeave(thread.id)"
          >
            <template #left>
              <span class="thread-left-stack">
                <span
                  v-if="thread.inProgress || thread.unread"
                  class="thread-status-indicator"
                  :data-state="getThreadState(thread)"
                />
                <button class="thread-pin-button" type="button" title="pin" @click.stop="togglePin(thread.id)">
                  <IconTablerPin class="thread-icon" />
                </button>
              </span>
            </template>
            <input
              v-if="isRenamingThread(thread.id)"
              :ref="(el) => setThreadRenameInputRef(thread.id, el)"
              v-model="threadRenameDraft"
              class="thread-rename-input"
              type="text"
              @click.stop
              @mousedown.stop
              @blur="submitThreadRename(thread)"
              @keydown.enter.prevent="submitThreadRename(thread)"
              @keydown.esc.stop.prevent="cancelThreadRename"
            />
            <button v-else class="thread-main-button" type="button" @click.stop="onSelect(thread.id)">
              <span class="thread-row-title">{{ thread.title }}</span>
            </button>
            <template #right>
              <span class="thread-row-time">{{ formatThreadRelative(thread) }}</span>
            </template>
            <template #right-hover>
              <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                <button class="thread-menu-trigger" type="button" title="thread_menu" @click.stop="toggleThreadMenu(thread.id)">
                  <IconTablerDots class="thread-icon" />
                </button>

                <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                  <button class="thread-menu-item" type="button" @click="startThreadRenameFromMenu(thread)">Rename</button>
                  <button v-if="!isHiddenView" class="thread-menu-item" type="button" @click="onForkClick(thread.id)">Fork</button>
                  <button v-if="!isHiddenView" class="thread-menu-item" type="button" @click="onCompactClick(thread.id)">Compact</button>
                  <button v-if="isHiddenView" class="thread-menu-item" type="button" @click="onRestoreClick(thread.id)">Restore</button>
                  <button v-else class="thread-menu-item thread-menu-item-danger" type="button" @click="onHideClick(thread.id)">
                    {{ hideThreadButtonLabel(thread.id) }}
                  </button>
                </div>
              </div>
            </template>
          </SidebarMenuRow>
        </li>
      </ul>

      <p v-else class="thread-tree-no-results">No conversations</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { UiProjectGroup, UiThread } from '../../types/codex'
import {
  buildSidebarConversationThreads,
  filterSidebarConversationGroups,
  buildSidebarGroupsContainerStyle,
  buildSidebarLayoutProjectOrder,
  buildSidebarLayoutTopByProject,
  buildSidebarPinnedThreads,
  closedSidebarThreadMenuState,
  filterSidebarProjectGroups,
  filterSidebarProjectsBySearch,
  formatSidebarRelativeTime,
  hasSidebarHiddenThreads,
  isSidebarEventInsideElement,
  isSidebarPointerInProjectDropZone,
  normalizeSidebarSearchQuery,
  sidebarHideThreadButtonLabel,
  sidebarHiddenViewToggleLabel,
  sidebarElementFromRef,
  sidebarDropTargetIndex,
  sidebarProjectGroupStyle,
  sidebarProjectHasOpenMenu,
  sidebarProjectDisplayName,
  sidebarProjectOuterHeight,
  sidebarProjectExpansionButtonLabel,
  sidebarProjectPath,
  sidebarProjectedDropProjectIndex,
  sidebarProjectTitleText,
  sidebarHideThreadClickResult,
  sidebarHiddenThreadCount,
  sidebarThreadTimeIso,
  sidebarThreadState,
  sidebarThreadRenameResult,
  threadMatchesSidebarSearch,
  type SidebarActiveProjectDrag,
  toggleSidebarPinnedThreadIds,
  toggleSidebarProjectCollapseState,
  toggleSidebarProjectExpansionState,
  toggleSidebarThreadMenuState,
  visibleSidebarThreads,
} from '../../composables/sidebarThreadTreeRules'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFolderOpen from '../icons/IconTablerFolderOpen.vue'
import IconTablerPin from '../icons/IconTablerPin.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'
import { useLocale } from '../../composables/useLocale'

const props = defineProps<{
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  selectedThreadId: string
  selectedProjectName?: string
  isLoading: boolean
  searchQuery: string
  isHiddenView: boolean
  skillCountsByCwd?: Record<string, number>
  collapseAllRequest?: number
}>()

const emit = defineEmits<{
  select: [threadId: string]
  hide: [threadId: string]
  restore: [threadId: string]
  fork: [threadId: string]
  compact: [threadId: string]
  'select-project': [projectName: string]
  'toggle-hidden-view': [value: boolean]
  'rename-thread': [payload: { threadId: string; title: string }]
  'start-new-thread': [projectName: string]
  'rename-project': [payload: { projectName: string; displayName: string }]
  'hide-project': [projectName: string]
  'restore-project': [projectName: string]
  'reorder-project': [payload: { projectName: string; toIndex: number }]
  'open-project-skills': [payload: { cwd: string; projectName: string }]
  'collapse-state-change': [allCollapsed: boolean]
}>()

const { t } = useLocale()

type PendingProjectDrag = {
  projectName: string
  fromIndex: number
  startClientX: number
  startClientY: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
}

type ActiveProjectDrag = SidebarActiveProjectDrag & {
  pointerOffsetY: number
  groupOuterHeight: number
}

type DragPointerSample = {
  clientX: number
  clientY: number
}

const DRAG_START_THRESHOLD_PX = 4
const PROJECT_GROUP_GAP_PX = 6
const collapsedProjects = ref<Record<string, boolean>>({})
const expandedProjects = ref<Record<string, boolean>>({})
const pinnedThreadIds = ref<string[]>([])
const hideConfirmThreadId = ref('')
const renamingThreadId = ref('')
const threadRenameDraft = ref('')
const openThreadMenuId = ref('')
const openProjectMenuId = ref('')
const projectMenuMode = ref<'actions' | 'rename'>('actions')
const projectRenameDraft = ref('')
const groupsContainerRef = ref<HTMLElement | null>(null)
const pendingProjectDrag = ref<PendingProjectDrag | null>(null)
const activeProjectDrag = ref<ActiveProjectDrag | null>(null)
let pendingDragPointerSample: DragPointerSample | null = null
let dragPointerRafId: number | null = null
const suppressNextProjectToggleId = ref('')
const measuredHeightByProject = ref<Record<string, number>>({})
const projectGroupElementByName = new Map<string, HTMLElement>()
const projectMenuWrapElementByName = new Map<string, HTMLElement>()
const threadMenuWrapElementById = new Map<string, HTMLElement>()
const threadRenameInputElementById = new Map<string, HTMLInputElement>()
const projectNameByElement = new WeakMap<HTMLElement, string>()
const projectGroupResizeObserver =
  typeof window !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          const projectName = projectNameByElement.get(element)
          if (!projectName) continue
          updateMeasuredProjectHeight(projectName, element)
        }
      })
    : null
const COLLAPSED_STORAGE_KEY = 'cody-web-ui.collapsed-projects.v1'

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

collapsedProjects.value = loadCollapsedState()

watch(
  collapsedProjects,
  (value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true },
)
const normalizedSearchQuery = computed(() => normalizeSidebarSearchQuery(props.searchQuery))

const isSearchActive = computed(() => normalizedSearchQuery.value.length > 0)

const projectGroups = computed(() => filterSidebarProjectGroups(props.groups))
const conversationGroups = computed(() => filterSidebarConversationGroups(props.groups))
const filteredProjects = computed<UiProjectGroup[]>(() => {
  return filterSidebarProjectsBySearch(
    projectGroups.value,
    normalizedSearchQuery.value,
    props.projectDisplayNameById,
  )
})
const projectHeaderLabel = computed(() => props.isHiddenView ? 'Hidden projects' : 'Projects')
const conversationHeaderLabel = computed(() => props.isHiddenView ? 'Hidden conversations' : 'Conversations')
const hiddenViewToggleLabel = computed(() => sidebarHiddenViewToggleLabel(props.isHiddenView))

const pinnedThreads = computed(() =>
  buildSidebarPinnedThreads(conversationGroups.value, pinnedThreadIds.value, normalizedSearchQuery.value),
)
const conversationThreads = computed(() =>
  buildSidebarConversationThreads(conversationGroups.value, pinnedThreadIds.value, normalizedSearchQuery.value),
)
const conversationRows = computed(() => [
  ...pinnedThreads.value,
  ...conversationThreads.value,
])
const hasNoSearchResults = computed(() =>
  isSearchActive.value && filteredProjects.value.length === 0 && conversationRows.value.length === 0,
)
const allProjectsCollapsed = computed(() =>
  projectGroups.value.length === 0 || projectGroups.value.every((group) => isCollapsed(group.projectName)),
)

watch(allProjectsCollapsed, (value) => emit('collapse-state-change', value), { immediate: true })
watch(() => props.collapseAllRequest, (request, previousRequest) => {
  if (request === previousRequest) return
  collapseAllProjects()
})

const projectedDropProjectIndex = computed<number | null>(() => {
  return sidebarProjectedDropProjectIndex({
    drag: activeProjectDrag.value,
    projectCount: projectGroups.value.length,
  })
})

const layoutProjectOrder = computed<string[]>(() => {
  const names = filteredProjects.value.map((group) => group.projectName)
  return buildSidebarLayoutProjectOrder({
    projectNames: names,
    drag: activeProjectDrag.value,
    projectedIndex: projectedDropProjectIndex.value,
  })
})

const layoutTopByProject = computed<Record<string, number>>(() => {
  return buildSidebarLayoutTopByProject(layoutProjectOrder.value, getProjectOuterHeight)
})

const groupsContainerStyle = computed<Record<string, string>>(() => {
  let totalHeight = 0
  for (const projectName of layoutProjectOrder.value) {
    totalHeight += getProjectOuterHeight(projectName)
  }

  return buildSidebarGroupsContainerStyle(totalHeight)
})

function formatRelative(value: string): string {
  return formatSidebarRelativeTime(value)
}

function formatThreadRelative(thread: UiThread): string {
  return formatRelative(sidebarThreadTimeIso(thread))
}

function isPinned(threadId: string): boolean {
  return pinnedThreadIds.value.includes(threadId)
}

function togglePin(threadId: string): void {
  pinnedThreadIds.value = toggleSidebarPinnedThreadIds(pinnedThreadIds.value, threadId)
}

function onSelect(threadId: string): void {
  if (renamingThreadId.value === threadId) return
  emit('select', threadId)
}

function projectCwd(group: UiProjectGroup): string {
  return group.cwd?.trim() || group.threads[0]?.cwd?.trim() || ''
}

function projectSkillCount(group: UiProjectGroup): number | null {
  const cwd = projectCwd(group)
  const count = cwd ? props.skillCountsByCwd?.[cwd] : undefined
  return typeof count === 'number' ? count : null
}

function onOpenProjectSkills(group: UiProjectGroup): void {
  const cwd = projectCwd(group)
  if (!cwd) return
  emit('open-project-skills', { cwd, projectName: group.projectName })
}

function onHideClick(threadId: string): void {
  const result = sidebarHideThreadClickResult(
    {
      openThreadMenuId: openThreadMenuId.value,
      hideConfirmThreadId: hideConfirmThreadId.value,
    },
    pinnedThreadIds.value,
    threadId,
  )
  openThreadMenuId.value = result.menuState.openThreadMenuId
  hideConfirmThreadId.value = result.menuState.hideConfirmThreadId
  pinnedThreadIds.value = result.pinnedThreadIds
  if (result.shouldHide) emit('hide', threadId)
}

function hideThreadButtonLabel(threadId: string): string {
  return sidebarHideThreadButtonLabel({
    hideConfirmThreadId: hideConfirmThreadId.value,
    threadId,
  })
}

function onRestoreClick(threadId: string): void {
  closeThreadMenu()
  emit('restore', threadId)
}

function onForkClick(threadId: string): void {
  closeThreadMenu()
  emit('fork', threadId)
}

function onCompactClick(threadId: string): void {
  closeThreadMenu()
  emit('compact', threadId)
}

function isThreadMenuOpen(threadId: string): boolean {
  return openThreadMenuId.value === threadId
}

function closeThreadMenu(): void {
  const state = closedSidebarThreadMenuState()
  openThreadMenuId.value = state.openThreadMenuId
  hideConfirmThreadId.value = state.hideConfirmThreadId
}

function toggleThreadMenu(threadId: string): void {
  const wasOpening = openThreadMenuId.value !== threadId
  const state = toggleSidebarThreadMenuState({
    openThreadMenuId: openThreadMenuId.value,
    hideConfirmThreadId: hideConfirmThreadId.value,
  }, threadId)
  if (wasOpening) closeProjectMenu()
  openThreadMenuId.value = state.openThreadMenuId
  hideConfirmThreadId.value = state.hideConfirmThreadId
}

function setThreadMenuWrapRef(threadId: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement = sidebarElementFromRef(element, HTMLElement)

  if (htmlElement) {
    threadMenuWrapElementById.set(threadId, htmlElement)
    return
  }

  threadMenuWrapElementById.delete(threadId)
}

function isRenamingThread(threadId: string): boolean {
  return renamingThreadId.value === threadId
}

function setThreadRenameInputRef(threadId: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement = sidebarElementFromRef(element, HTMLInputElement)

  if (htmlElement) {
    threadRenameInputElementById.set(threadId, htmlElement)
    return
  }

  threadRenameInputElementById.delete(threadId)
}

function startThreadRename(thread: UiThread): void {
  hideConfirmThreadId.value = ''
  openThreadMenuId.value = ''
  renamingThreadId.value = thread.id
  threadRenameDraft.value = thread.title
  void nextTick(() => {
    const input = threadRenameInputElementById.get(thread.id)
    input?.focus()
    input?.select()
  })
}

function startThreadRenameFromMenu(thread: UiThread): void {
  closeThreadMenu()
  startThreadRename(thread)
}

function cancelThreadRename(): void {
  renamingThreadId.value = ''
  threadRenameDraft.value = ''
}

function submitThreadRename(thread: UiThread): void {
  const result = sidebarThreadRenameResult(thread, renamingThreadId.value, threadRenameDraft.value)
  cancelThreadRename()
  if (!result) return

  emit('rename-thread', result)
}

function getNewThreadButtonAriaLabel(projectName: string): string {
  return `start new thread ${getProjectDisplayName(projectName)}`
}

function onStartNewThread(projectName: string): void {
  emit('start-new-thread', projectName)
}

function onProjectSelect(projectName: string): void {
  if (!projectName) return
  const shouldSuppressSelect = suppressNextProjectToggleId.value === projectName
  const result = toggleSidebarProjectCollapseState({
    collapsedProjects: collapsedProjects.value,
    projectName,
    suppressProjectName: suppressNextProjectToggleId.value,
  })
  collapsedProjects.value = result.collapsedProjects
  suppressNextProjectToggleId.value = result.suppressProjectName
  if (shouldSuppressSelect) return
  emit('select-project', projectName)
}

function collapseAllProjects(): void {
  collapsedProjects.value = {
    ...collapsedProjects.value,
    ...Object.fromEntries(projectGroups.value.map((group) => [group.projectName, true])),
  }
  closeProjectMenu()
  closeThreadMenu()
}

function onThreadRowLeave(threadId: string): void {
  if (hideConfirmThreadId.value === threadId) {
    hideConfirmThreadId.value = ''
  }
}

function getProjectDisplayName(projectName: string): string {
  return sidebarProjectDisplayName(projectName, props.projectDisplayNameById)
}

function getProjectPath(group: UiProjectGroup): string {
  return sidebarProjectPath(group)
}

function getProjectTitleText(group: UiProjectGroup): string {
  return sidebarProjectTitleText(group, props.projectDisplayNameById)
}

function isProjectSelected(group: UiProjectGroup): boolean {
  const selectedProjectName = props.selectedProjectName?.trim() ?? ''
  if (selectedProjectName) {
    return group.projectName === selectedProjectName || group.cwd === selectedProjectName
  }
  return group.threads.some((thread) => thread.id === props.selectedThreadId)
}

function isCollapsed(projectName: string): boolean {
  return collapsedProjects.value[projectName] !== false
}

function isProjectMenuOpen(projectName: string): boolean {
  return openProjectMenuId.value === projectName
}

function closeProjectMenu(): void {
  openProjectMenuId.value = ''
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = ''
}

function toggleProjectMenu(projectName: string): void {
  if (openProjectMenuId.value === projectName) {
    closeProjectMenu()
    return
  }

  closeThreadMenu()
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'actions'
  projectRenameDraft.value = getProjectDisplayName(projectName)
}

function openRenameProjectMenu(projectName: string): void {
  openProjectMenuId.value = projectName
  projectMenuMode.value = 'rename'
  projectRenameDraft.value = getProjectDisplayName(projectName)
}

function onProjectNameInput(projectName: string): void {
  emit('rename-project', {
    projectName,
    displayName: projectRenameDraft.value,
  })
}

function isEventInsideOpenThreadMenu(event: Event): boolean {
  const threadId = openThreadMenuId.value
  if (!threadId) return false

  const openMenuWrapElement = threadMenuWrapElementById.get(threadId)
  return isSidebarEventInsideElement(event, openMenuWrapElement ?? null)
}

function onThreadMenuPointerDown(event: PointerEvent): void {
  if (!openThreadMenuId.value) return
  if (isEventInsideOpenThreadMenu(event)) return
  closeThreadMenu()
}

function onThreadMenuFocusIn(event: FocusEvent): void {
  if (!openThreadMenuId.value) return
  if (isEventInsideOpenThreadMenu(event)) return
  closeThreadMenu()
}

function onWindowBlurForThreadMenu(): void {
  if (!openThreadMenuId.value) return
  closeThreadMenu()
}

function bindThreadMenuDismissListeners(): void {
  window.addEventListener('pointerdown', onThreadMenuPointerDown, { capture: true })
  window.addEventListener('focusin', onThreadMenuFocusIn, { capture: true })
  window.addEventListener('blur', onWindowBlurForThreadMenu)
}

function unbindThreadMenuDismissListeners(): void {
  window.removeEventListener('pointerdown', onThreadMenuPointerDown, { capture: true })
  window.removeEventListener('focusin', onThreadMenuFocusIn, { capture: true })
  window.removeEventListener('blur', onWindowBlurForThreadMenu)
}

function onHideProject(projectName: string): void {
  emit('hide-project', projectName)
  closeProjectMenu()
}

function onRestoreProject(projectName: string): void {
  emit('restore-project', projectName)
  closeProjectMenu()
}

function isExpanded(projectName: string): boolean {
  return expandedProjects.value[projectName] === true
}

function projectExpansionButtonLabel(group: UiProjectGroup): string {
  return sidebarProjectExpansionButtonLabel(
    isExpanded(group.projectName),
    hiddenProjectThreadCount(group),
  )
}

function toggleProjectExpansion(projectName: string): void {
  expandedProjects.value = toggleSidebarProjectExpansionState(expandedProjects.value, projectName)
}

function projectThreadsForDisplay(group: UiProjectGroup): UiThread[] {
  if (!isSearchActive.value) return group.threads
  return group.threads.filter((thread) => threadMatchesSidebarSearch(thread, normalizedSearchQuery.value))
}

function projectGroupForDisplay(group: UiProjectGroup): UiProjectGroup {
  return {
    ...group,
    threads: projectThreadsForDisplay(group),
  }
}

function visibleProjectThreads(group: UiProjectGroup): UiThread[] {
  return visibleSidebarThreads(projectGroupForDisplay(group), {
    pinnedThreadIds: [],
    isSearchActive: isSearchActive.value,
    isCollapsed: isCollapsed(group.projectName),
    isExpanded: isExpanded(group.projectName),
  })
}

function hasProjectThreads(group: UiProjectGroup): boolean {
  return visibleProjectThreads(group).length > 0
}

function hasHiddenProjectThreads(group: UiProjectGroup): boolean {
  return hasSidebarHiddenThreads(projectGroupForDisplay(group), {
    pinnedThreadIds: [],
    isSearchActive: isSearchActive.value,
    isCollapsed: isCollapsed(group.projectName),
  })
}

function hiddenProjectThreadCount(group: UiProjectGroup): number {
  return sidebarHiddenThreadCount(projectGroupForDisplay(group), [])
}

function getProjectOuterHeight(projectName: string): number {
  const measuredHeight = measuredHeightByProject.value[projectName] ?? 0
  const drag = activeProjectDrag.value
  const dragHeight = drag?.projectName === projectName ? drag.groupHeight : null
  return sidebarProjectOuterHeight({
    measuredHeight,
    dragHeight,
    isCollapsed: isCollapsed(projectName),
    expandedGapPx: PROJECT_GROUP_GAP_PX,
  })
}

function setProjectMenuWrapRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement = sidebarElementFromRef(element, HTMLElement)

  if (htmlElement) {
    projectMenuWrapElementByName.set(projectName, htmlElement)
    return
  }

  projectMenuWrapElementByName.delete(projectName)
}

function isEventInsideOpenProjectMenu(event: Event): boolean {
  const projectName = openProjectMenuId.value
  if (!projectName) return false

  const openMenuWrapElement = projectMenuWrapElementByName.get(projectName)
  return isSidebarEventInsideElement(event, openMenuWrapElement ?? null)
}

function onProjectMenuPointerDown(event: PointerEvent): void {
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onProjectMenuFocusIn(event: FocusEvent): void {
  if (!openProjectMenuId.value) return
  if (isEventInsideOpenProjectMenu(event)) return
  closeProjectMenu()
}

function onWindowBlurForProjectMenu(): void {
  if (!openProjectMenuId.value) return
  closeProjectMenu()
}

function bindProjectMenuDismissListeners(): void {
  window.addEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.addEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.addEventListener('blur', onWindowBlurForProjectMenu)
}

function unbindProjectMenuDismissListeners(): void {
  window.removeEventListener('pointerdown', onProjectMenuPointerDown, { capture: true })
  window.removeEventListener('focusin', onProjectMenuFocusIn, { capture: true })
  window.removeEventListener('blur', onWindowBlurForProjectMenu)
}

function updateMeasuredProjectHeight(projectName: string, element: HTMLElement): void {
  const nextHeight = element.getBoundingClientRect().height
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

  const previousHeight = measuredHeightByProject.value[projectName]
  if (previousHeight !== undefined && Math.abs(previousHeight - nextHeight) < 0.5) {
    return
  }

  measuredHeightByProject.value = {
    ...measuredHeightByProject.value,
    [projectName]: nextHeight,
  }
}

function setProjectGroupRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
  const previousElement = projectGroupElementByName.get(projectName)
  if (previousElement && previousElement !== element && projectGroupResizeObserver) {
    projectGroupResizeObserver.unobserve(previousElement)
  }

  const htmlElement = sidebarElementFromRef(element, HTMLElement)

  if (htmlElement) {
    projectGroupElementByName.set(projectName, htmlElement)
    projectNameByElement.set(htmlElement, projectName)
    updateMeasuredProjectHeight(projectName, htmlElement)
    projectGroupResizeObserver?.observe(htmlElement)
    return
  }

  if (previousElement) {
    projectGroupResizeObserver?.unobserve(previousElement)
  }

  projectGroupElementByName.delete(projectName)
}

function onProjectHandleMouseDown(event: MouseEvent, projectName: string): void {
  if (event.button !== 0) return
  if (isSearchActive.value) return
  if (pendingProjectDrag.value || activeProjectDrag.value) return

  const fromIndex = projectGroups.value.findIndex((group) => group.projectName === projectName)
  const projectGroupElement = projectGroupElementByName.get(projectName)
  if (fromIndex < 0 || !projectGroupElement) return

  const groupRect = projectGroupElement.getBoundingClientRect()
  pendingProjectDrag.value = {
    projectName,
    fromIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerOffsetY: event.clientY - groupRect.top,
    groupLeft: groupRect.left,
    groupWidth: groupRect.width,
    groupHeight: groupRect.height,
    groupOuterHeight: groupRect.height + PROJECT_GROUP_GAP_PX,
  }

  event.preventDefault()
  bindProjectDragListeners()
}

function bindProjectDragListeners(): void {
  window.addEventListener('mousemove', onProjectDragMouseMove)
  window.addEventListener('mouseup', onProjectDragMouseUp)
  window.addEventListener('keydown', onProjectDragKeyDown)
}

function unbindProjectDragListeners(): void {
  window.removeEventListener('mousemove', onProjectDragMouseMove)
  window.removeEventListener('mouseup', onProjectDragMouseUp)
  window.removeEventListener('keydown', onProjectDragKeyDown)
}

function onProjectDragMouseMove(event: MouseEvent): void {
  pendingDragPointerSample = {
    clientX: event.clientX,
    clientY: event.clientY,
  }
  scheduleProjectDragPointerFrame()
}

function onProjectDragMouseUp(event: MouseEvent): void {
  processProjectDragPointerSample({
    clientX: event.clientX,
    clientY: event.clientY,
  })

  const drag = activeProjectDrag.value
  if (drag && projectedDropProjectIndex.value !== null) {
    const currentProjectIndex = projectGroups.value.findIndex((group) => group.projectName === drag.projectName)
    if (currentProjectIndex >= 0) {
      const toIndex = projectedDropProjectIndex.value
      if (toIndex !== currentProjectIndex) {
        emit('reorder-project', {
          projectName: drag.projectName,
          toIndex,
        })
      }
    }
  }

  const suppressProjectName = drag?.projectName ?? ''
  resetProjectDragState({ preserveProjectToggleSuppression: Boolean(suppressProjectName) })
  if (suppressProjectName) {
    window.setTimeout(() => {
      if (suppressNextProjectToggleId.value === suppressProjectName) {
        suppressNextProjectToggleId.value = ''
      }
    }, 0)
  }
}

function onProjectDragKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!pendingProjectDrag.value && !activeProjectDrag.value) return

  event.preventDefault()
  resetProjectDragState()
}

function resetProjectDragState(options: { preserveProjectToggleSuppression?: boolean } = {}): void {
  if (dragPointerRafId !== null) {
    window.cancelAnimationFrame(dragPointerRafId)
    dragPointerRafId = null
  }
  pendingDragPointerSample = null
  pendingProjectDrag.value = null
  activeProjectDrag.value = null
  if (!options.preserveProjectToggleSuppression) {
    suppressNextProjectToggleId.value = ''
  }
  unbindProjectDragListeners()
}

function scheduleProjectDragPointerFrame(): void {
  if (dragPointerRafId !== null) return

  dragPointerRafId = window.requestAnimationFrame(() => {
    dragPointerRafId = null
    if (!pendingDragPointerSample) return

    const sample = pendingDragPointerSample
    pendingDragPointerSample = null
    processProjectDragPointerSample(sample)
  })
}

function processProjectDragPointerSample(sample: DragPointerSample): void {
  const pending = pendingProjectDrag.value
  if (!activeProjectDrag.value && pending) {
    const deltaX = sample.clientX - pending.startClientX
    const deltaY = sample.clientY - pending.startClientY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance < DRAG_START_THRESHOLD_PX) {
      return
    }

    closeProjectMenu()
    suppressNextProjectToggleId.value = pending.projectName
    activeProjectDrag.value = {
      projectName: pending.projectName,
      fromIndex: pending.fromIndex,
      pointerOffsetY: pending.pointerOffsetY,
      groupLeft: pending.groupLeft,
      groupWidth: pending.groupWidth,
      groupHeight: pending.groupHeight,
      groupOuterHeight: pending.groupOuterHeight,
      ghostTop: sample.clientY - pending.pointerOffsetY,
      dropTargetIndexFull: null,
    }
  }

  if (!activeProjectDrag.value) return
  updateProjectDropTarget(sample)
}

function updateProjectDropTarget(sample: DragPointerSample): void {
  const drag = activeProjectDrag.value
  if (!drag) return

  drag.ghostTop = sample.clientY - drag.pointerOffsetY
  const groupsContainer = groupsContainerRef.value
  const containerRect = groupsContainer?.getBoundingClientRect() ?? null
  if (!isSidebarPointerInProjectDropZone(sample, containerRect)) {
    drag.dropTargetIndexFull = null
    return
  }

  if (!containerRect) {
    drag.dropTargetIndexFull = null
    return
  }

  drag.dropTargetIndexFull = sidebarDropTargetIndex({
    cursorY: sample.clientY,
    containerTop: containerRect.top,
    projectNames: projectGroups.value.map((group) => group.projectName),
    draggedProjectName: drag.projectName,
    getProjectOuterHeight,
  })
}

function isDraggingProject(projectName: string): boolean {
  return activeProjectDrag.value?.projectName === projectName
}

function projectGroupStyle(projectName: string): Record<string, string> | undefined {
  const drag = activeProjectDrag.value
  const targetTop = layoutTopByProject.value[projectName] ?? 0
  const group = filteredProjects.value.find((candidate) => candidate.projectName === projectName)
  const isMenuOpen = group
    ? sidebarProjectHasOpenMenu({
        group,
        openProjectMenuId: openProjectMenuId.value,
        openThreadMenuId: openThreadMenuId.value,
      })
    : false

  return sidebarProjectGroupStyle({
    projectName,
    drag,
    targetTop,
    isMenuOpen,
  })
}

function getThreadState(thread: UiThread): 'working' | 'unread' | 'idle' {
  return sidebarThreadState(thread)
}

watch(
  () => props.groups.map((group) => group.projectName),
  (projectNames) => {
    const dragProjectName = activeProjectDrag.value?.projectName ?? pendingProjectDrag.value?.projectName ?? ''
    if (dragProjectName && !props.groups.some((group) => group.projectName === dragProjectName)) {
      resetProjectDragState()
    }

    const projectNameSet = new Set(projectNames)
    const nextMeasuredHeights = Object.fromEntries(
      Object.entries(measuredHeightByProject.value).filter(([projectName]) => projectNameSet.has(projectName)),
    ) as Record<string, number>

    if (Object.keys(nextMeasuredHeights).length !== Object.keys(measuredHeightByProject.value).length) {
      measuredHeightByProject.value = nextMeasuredHeights
    }
  },
)

watch(openProjectMenuId, (projectName) => {
  if (projectName) {
    bindProjectMenuDismissListeners()
    return
  }

  unbindProjectMenuDismissListeners()
})

watch(openThreadMenuId, (threadId) => {
  if (threadId) {
    bindThreadMenuDismissListeners()
    return
  }

  unbindThreadMenuDismissListeners()
})

onBeforeUnmount(() => {
  for (const element of projectGroupElementByName.values()) {
    projectGroupResizeObserver?.unobserve(element)
  }
  projectGroupElementByName.clear()
  projectMenuWrapElementByName.clear()
  threadMenuWrapElementById.clear()
  unbindProjectMenuDismissListeners()
  unbindThreadMenuDismissListeners()
  resetProjectDragState()
})
</script>

<style scoped>
@reference "../../style.css";

.thread-tree-root {
  @apply flex flex-col;
}

.thread-tree-header-row {
  @apply cursor-default;
}

.conversation-section-header {
  @apply mt-6;
}

.thread-tree-header {
  @apply text-sm font-normal theme-muted select-none;
}

.thread-hidden-view-toggle {
  @apply rounded px-1.5 py-0.5 text-xs theme-muted transition hover:bg-zinc-200 hover:theme-text;
}

.thread-start-button {
  @apply h-5 w-5 rounded theme-muted flex items-center justify-center transition hover:bg-zinc-200 hover:theme-muted;
}

.thread-tree-loading {
  @apply px-3 py-2 text-sm theme-muted;
}

.thread-status-legend {
  margin: 0 0.65rem 0.35rem;
  color: var(--color-text-muted);
  font-size: 0.68rem;
}

.thread-status-legend summary {
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.62rem;
}

.thread-status-legend div {
  display: grid;
  gap: 0.35rem;
  padding: 0.55rem 0.2rem 0.15rem;
}

.thread-status-legend span {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.thread-status-legend i {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.thread-status-legend i[data-state='working'] { background: var(--color-accent); }
.thread-status-legend i[data-state='unread'] { background: var(--color-success); }
.thread-status-legend i[data-state='attention'] { background: var(--color-warning); }

.thread-tree-no-results {
  @apply px-3 py-2 text-sm theme-muted;
}

.thread-tree-projects {
  @apply pr-0.5 relative;
}

.project-group {
  @apply m-0 transition-shadow;
}

.project-group[data-dragging='true'] {
  @apply shadow-lg;
}

.project-header-row {
  @apply hover:bg-zinc-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400;
}

.project-header-row[data-active='true'] {
  @apply bg-zinc-200 ring-1 ring-amber-500;
}

.project-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5 cursor-grab;
}

.project-main-button[data-dragging-handle='true'] {
  @apply cursor-grabbing;
}

.project-icon-stack {
  @apply w-8 h-4 flex items-center justify-start gap-0.5 theme-muted;
}

.project-icon-folder,
.project-icon-chevron {
  @apply h-4 w-4 flex items-center justify-center;
}

.project-title {
  @apply min-w-0 flex items-baseline gap-1.5 text-sm font-normal select-none;
}

.project-title-name {
  @apply min-w-0 shrink-0 max-w-[45%] truncate theme-muted align-baseline;
}

.project-title-path {
  @apply min-w-0 truncate text-xs theme-muted align-baseline;
}

.project-menu-wrap {
  @apply relative;
}

.project-skills-entry {
  @apply h-5 min-w-5 px-1 rounded flex items-center justify-center gap-0.5 theme-muted;
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.project-skills-entry:hover {
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.project-skills-entry small {
  font-size: 0.58rem;
}

.project-hover-controls {
  @apply flex items-center gap-1;
}

.project-menu-trigger {
  @apply h-4 w-4 rounded p-0 theme-muted flex items-center justify-center;
}

.project-menu-panel {
  @apply absolute right-0 top-full mt-1 z-50 min-w-36 rounded-md border theme-border theme-bg-panel p-1 shadow-md flex flex-col gap-0.5;
}

.project-menu-item {
  @apply rounded px-2 py-1 text-left text-sm theme-muted hover:theme-bg-control;
}

.project-menu-item-danger {
  @apply theme-text-danger hover:theme-bg-danger-soft;
}

.project-menu-label {
  @apply px-2 pt-1 text-xs theme-muted;
}

.project-menu-input {
  @apply px-2 py-1 text-sm theme-text bg-transparent border-none outline-none;
}

.thread-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.project-thread-list {
  @apply mt-0.5;
}

.thread-row-item {
  @apply m-0;
}

.thread-row {
  @apply cursor-pointer hover:bg-zinc-200;
}

.thread-row:focus-within {
  @apply outline-none ring-2 ring-emerald-400/50;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-pin-button {
  @apply absolute inset-0 w-4 h-4 rounded theme-muted opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-main-button {
  @apply min-w-0 w-full cursor-pointer text-left rounded px-0 py-0 flex items-center min-h-5 focus-visible:outline-none;
}

.thread-row-title {
  @apply block text-sm leading-5 font-normal theme-text truncate whitespace-nowrap;
}

.thread-rename-input {
  @apply block h-5 w-full min-w-0 rounded border theme-border theme-bg-panel px-1 text-sm leading-5 theme-text outline-none focus:border-zinc-500;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time {
  @apply block text-sm font-normal theme-muted;
}

.thread-action-button {
  @apply h-4 w-4 rounded p-0 text-xs theme-muted flex items-center justify-center hover:theme-text;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 theme-muted flex items-center justify-center hover:theme-text;
}

.thread-menu-panel {
  @apply absolute right-0 top-full mt-1 z-50 min-w-32 rounded-md border theme-border theme-bg-panel p-1 shadow-md flex flex-col gap-0.5;
}

.thread-menu-item {
  @apply rounded px-2 py-1 text-left text-sm theme-muted hover:theme-bg-control;
}

.thread-menu-item-danger {
  @apply theme-text-danger hover:theme-bg-danger-soft;
}

.thread-icon {
  @apply w-4 h-4;
}

.thread-show-more-row {
  @apply mt-1 border-0 bg-transparent theme-muted cursor-pointer hover:theme-bg-control hover:theme-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300;
}

.thread-show-more-chevron {
  @apply h-3.5 w-3.5 transition-transform;
}

.thread-show-more-chevron[data-expanded='true'] {
  transform: rotate(180deg);
}

.thread-show-more-label {
  @apply text-sm font-normal;
}

.thread-row[data-active='true'] {
  @apply bg-zinc-200;
}

.thread-row:hover .thread-pin-button,
.thread-row:focus-within .thread-pin-button {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-blue-600;
}

.thread-status-indicator[data-state='working'] {
  @apply border-2 border-zinc-500 border-t-transparent bg-transparent animate-spin;
}

.thread-row:hover .thread-status-indicator[data-state='unread'],
.thread-row:hover .thread-status-indicator[data-state='working'],
.thread-row:focus-within .thread-status-indicator[data-state='unread'],
.thread-row:focus-within .thread-status-indicator[data-state='working'] {
  @apply opacity-0;
}
</style>
