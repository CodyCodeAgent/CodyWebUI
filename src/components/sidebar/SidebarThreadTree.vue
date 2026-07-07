<template>
  <section class="thread-tree-root">
    <section
      v-if="pinnedThreads.length > 0"
      class="pinned-section"
      :data-thread-menu-open="hasPinnedThreadMenuOpen"
    >
      <ul class="thread-list">
        <li v-for="thread in pinnedThreads" :key="thread.id" class="thread-row-item">
          <SidebarMenuRow
            class="thread-row"
            :data-active="thread.id === selectedThreadId"
            :data-pinned="isPinned(thread.id)"
            :force-right-hover="isThreadMenuOpen(thread.id)"
            @mouseleave="onThreadRowLeave(thread.id)"
          >
            <template #left>
              <span class="thread-left-stack">
                <span v-if="thread.inProgress || thread.unread" class="thread-status-indicator" :data-state="getThreadState(thread)" />
                <button class="thread-pin-button" type="button" title="pin" @click="togglePin(thread.id)">
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
            <button v-else class="thread-main-button" type="button" @click="onSelect(thread.id)">
              <span class="thread-row-title">{{ thread.title }}</span>
            </button>
            <template #right>
              <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
            </template>
            <template #right-hover>
              <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                <button class="thread-menu-trigger" type="button" title="thread_menu" @click.stop="toggleThreadMenu(thread.id)">
                  <IconTablerDots class="thread-icon" />
                </button>

                <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                  <button class="thread-menu-item" type="button" @click="startThreadRenameFromMenu(thread)">Rename</button>
                  <button v-if="!isArchiveView" class="thread-menu-item" type="button" @click="onForkClick(thread.id)">Fork</button>
                  <button v-if="!isArchiveView" class="thread-menu-item" type="button" @click="onCompactClick(thread.id)">Compact</button>
                  <button v-if="isArchiveView" class="thread-menu-item" type="button" @click="onUnarchiveClick(thread.id)">Restore</button>
                  <button v-else class="thread-menu-item thread-menu-item-danger" type="button" @click="onArchiveClick(thread.id)">
                    {{ archiveThreadButtonLabel(thread.id) }}
                  </button>
                </div>
              </div>
            </template>
          </SidebarMenuRow>
        </li>
      </ul>
    </section>

    <SidebarMenuRow as="header" class="thread-tree-header-row">
      <span class="thread-tree-header">{{ archiveViewHeaderLabel }}</span>
      <template #right>
        <button class="thread-archive-view-toggle" type="button" @click="$emit('toggle-archive-view', !isArchiveView)">
          {{ archiveViewToggleLabel }}
        </button>
      </template>
    </SidebarMenuRow>

    <p v-if="isSearchActive && filteredGroups.length === 0" class="thread-tree-no-results">No matching threads</p>

    <p v-else-if="isLoading && groups.length === 0" class="thread-tree-loading">Loading threads...</p>

    <div v-else ref="groupsContainerRef" class="thread-tree-groups" :style="groupsContainerStyle">
      <article
        v-for="group in filteredGroups"
        :key="group.projectName"
        :ref="(el) => setProjectGroupRef(group.projectName, el)"
        class="project-group"
        :data-project-name="group.projectName"
        :data-expanded="!isCollapsed(group.projectName)"
        :data-dragging="isDraggingProject(group.projectName)"
        :data-thread-menu-open="isThreadMenuOpenInProject(group)"
        :style="projectGroupStyle(group.projectName)"
      >
          <SidebarMenuRow
            as="div"
            class="project-header-row"
            :force-right-hover="isProjectMenuOpen(group.projectName)"
            role="button"
            tabindex="0"
            @click="toggleProjectCollapse(group.projectName)"
            @keydown.enter.prevent="toggleProjectCollapse(group.projectName)"
            @keydown.space.prevent="toggleProjectCollapse(group.projectName)"
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
                <span v-if="getProjectPath(group)" class="project-title-path">
                  ({{ getProjectPath(group) }})
                </span>
              </span>
            </span>
            <template #right-hover>
              <div class="project-hover-controls">
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
                      <button
                        class="project-menu-item project-menu-item-danger"
                        type="button"
                        @click="onRemoveProject(group.projectName)"
                      >
                        Remove
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

          <ul v-if="hasThreads(group)" class="thread-list">
            <li v-for="thread in visibleThreads(group)" :key="thread.id" class="thread-row-item">
              <SidebarMenuRow
                class="thread-row"
                :data-active="thread.id === selectedThreadId"
                :data-pinned="isPinned(thread.id)"
                :force-right-hover="isThreadMenuOpen(thread.id)"
                @mouseleave="onThreadRowLeave(thread.id)"
              >
                <template #left>
                  <span class="thread-left-stack">
                    <span
                      v-if="thread.inProgress || thread.unread"
                      class="thread-status-indicator"
                      :data-state="getThreadState(thread)"
                    />
                    <button class="thread-pin-button" type="button" title="pin" @click="togglePin(thread.id)">
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
                <button v-else class="thread-main-button" type="button" @click="onSelect(thread.id)">
                  <span class="thread-row-title">{{ thread.title }}</span>
                </button>
                <template #right>
                  <span class="thread-row-time">{{ formatRelative(thread.createdAtIso || thread.updatedAtIso) }}</span>
                </template>
                <template #right-hover>
                  <div :ref="(el) => setThreadMenuWrapRef(thread.id, el)" class="thread-menu-wrap">
                    <button class="thread-menu-trigger" type="button" title="thread_menu" @click.stop="toggleThreadMenu(thread.id)">
                      <IconTablerDots class="thread-icon" />
                    </button>

                    <div v-if="isThreadMenuOpen(thread.id)" class="thread-menu-panel" @click.stop>
                      <button class="thread-menu-item" type="button" @click="startThreadRenameFromMenu(thread)">Rename</button>
                      <button v-if="!isArchiveView" class="thread-menu-item" type="button" @click="onForkClick(thread.id)">Fork</button>
                      <button v-if="!isArchiveView" class="thread-menu-item" type="button" @click="onCompactClick(thread.id)">Compact</button>
                      <button v-if="isArchiveView" class="thread-menu-item" type="button" @click="onUnarchiveClick(thread.id)">Restore</button>
                      <button v-else class="thread-menu-item thread-menu-item-danger" type="button" @click="onArchiveClick(thread.id)">
                        {{ archiveThreadButtonLabel(thread.id) }}
                      </button>
                    </div>
                  </div>
                </template>
              </SidebarMenuRow>
            </li>
          </ul>

          <SidebarMenuRow v-else as="p" class="project-empty-row">
            <template #left>
              <span class="project-empty-spacer" />
            </template>
            <span class="project-empty">No threads</span>
          </SidebarMenuRow>

          <SidebarMenuRow v-if="hasHiddenThreads(group)" class="thread-show-more-row">
            <template #left>
              <span class="thread-show-more-spacer" />
            </template>
            <button class="thread-show-more-button" type="button" @click="toggleProjectExpansion(group.projectName)">
              {{ projectExpansionButtonLabel(group.projectName) }}
            </button>
          </SidebarMenuRow>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { UiProjectGroup, UiThread } from '../../types/codex'
import {
  buildSidebarGroupsContainerStyle,
  buildSidebarLayoutProjectOrder,
  buildSidebarLayoutTopByProject,
  buildSidebarPinnedThreads,
  closedSidebarThreadMenuState,
  filterSidebarGroupsBySearch,
  formatSidebarRelativeTime,
  hasSidebarHiddenThreads,
  hasSidebarThreads,
  isSidebarEventInsideElement,
  isSidebarPointerInProjectDropZone,
  normalizeSidebarSearchQuery,
  sidebarArchiveThreadButtonLabel,
  sidebarArchiveViewHeaderLabel,
  sidebarArchiveViewToggleLabel,
  sidebarElementFromRef,
  sidebarDropTargetIndex,
  sidebarProjectGroupStyle,
  sidebarProjectDisplayName,
  sidebarProjectExpansionButtonLabel,
  sidebarProjectOuterHeight,
  sidebarProjectPath,
  sidebarProjectedDropProjectIndex,
  sidebarProjectTitleText,
  sidebarArchiveThreadClickResult,
  sidebarThreadState,
  sidebarThreadRenameResult,
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

const props = defineProps<{
  groups: UiProjectGroup[]
  projectDisplayNameById: Record<string, string>
  selectedThreadId: string
  isLoading: boolean
  searchQuery: string
  isArchiveView: boolean
}>()

const emit = defineEmits<{
  select: [threadId: string]
  archive: [threadId: string]
  unarchive: [threadId: string]
  fork: [threadId: string]
  compact: [threadId: string]
  'toggle-archive-view': [value: boolean]
  'rename-thread': [payload: { threadId: string; title: string }]
  'start-new-thread': [projectName: string]
  'rename-project': [payload: { projectName: string; displayName: string }]
  'remove-project': [projectName: string]
  'reorder-project': [payload: { projectName: string; toIndex: number }]
}>()

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
const PROJECT_GROUP_EXPANDED_GAP_PX = 6
const expandedProjects = ref<Record<string, boolean>>({})
const collapsedProjects = ref<Record<string, boolean>>({})
const pinnedThreadIds = ref<string[]>([])
const archiveConfirmThreadId = ref('')
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
const COLLAPSED_STORAGE_KEY = 'codex-web-local.collapsed-projects.v1'

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

const filteredGroups = computed<UiProjectGroup[]>(() => {
  return filterSidebarGroupsBySearch(props.groups, normalizedSearchQuery.value)
})
const archiveViewHeaderLabel = computed(() => sidebarArchiveViewHeaderLabel(props.isArchiveView))
const archiveViewToggleLabel = computed(() => sidebarArchiveViewToggleLabel(props.isArchiveView))

const pinnedThreads = computed(() =>
  buildSidebarPinnedThreads(props.groups, pinnedThreadIds.value, normalizedSearchQuery.value),
)
const hasPinnedThreadMenuOpen = computed(() =>
  pinnedThreads.value.some((thread) => isThreadMenuOpen(thread.id)),
)

const projectedDropProjectIndex = computed<number | null>(() => {
  return sidebarProjectedDropProjectIndex({
    drag: activeProjectDrag.value,
    projectCount: props.groups.length,
  })
})

const layoutProjectOrder = computed<string[]>(() => {
  const sourceGroups = isSearchActive.value ? filteredGroups.value : props.groups
  const names = sourceGroups.map((group) => group.projectName)
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

function onArchiveClick(threadId: string): void {
  const result = sidebarArchiveThreadClickResult(
    {
      openThreadMenuId: openThreadMenuId.value,
      archiveConfirmThreadId: archiveConfirmThreadId.value,
    },
    pinnedThreadIds.value,
    threadId,
  )
  openThreadMenuId.value = result.menuState.openThreadMenuId
  archiveConfirmThreadId.value = result.menuState.archiveConfirmThreadId
  pinnedThreadIds.value = result.pinnedThreadIds
  if (result.shouldArchive) emit('archive', threadId)
}

function archiveThreadButtonLabel(threadId: string): string {
  return sidebarArchiveThreadButtonLabel({
    archiveConfirmThreadId: archiveConfirmThreadId.value,
    threadId,
  })
}

function onUnarchiveClick(threadId: string): void {
  closeThreadMenu()
  emit('unarchive', threadId)
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

function isThreadMenuOpenInProject(group: UiProjectGroup): boolean {
  return group.threads.some((thread) => isThreadMenuOpen(thread.id))
}

function closeThreadMenu(): void {
  const state = closedSidebarThreadMenuState()
  openThreadMenuId.value = state.openThreadMenuId
  archiveConfirmThreadId.value = state.archiveConfirmThreadId
}

function toggleThreadMenu(threadId: string): void {
  const wasOpening = openThreadMenuId.value !== threadId
  const state = toggleSidebarThreadMenuState({
    openThreadMenuId: openThreadMenuId.value,
    archiveConfirmThreadId: archiveConfirmThreadId.value,
  }, threadId)
  if (wasOpening) closeProjectMenu()
  openThreadMenuId.value = state.openThreadMenuId
  archiveConfirmThreadId.value = state.archiveConfirmThreadId
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
  archiveConfirmThreadId.value = ''
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

function onThreadRowLeave(threadId: string): void {
  if (archiveConfirmThreadId.value === threadId) {
    archiveConfirmThreadId.value = ''
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

function onRemoveProject(projectName: string): void {
  emit('remove-project', projectName)
  closeProjectMenu()
}

function isExpanded(projectName: string): boolean {
  return expandedProjects.value[projectName] === true
}

function projectExpansionButtonLabel(projectName: string): string {
  return sidebarProjectExpansionButtonLabel(isExpanded(projectName))
}

function isCollapsed(projectName: string): boolean {
  return collapsedProjects.value[projectName] === true
}

function toggleProjectExpansion(projectName: string): void {
  expandedProjects.value = toggleSidebarProjectExpansionState(expandedProjects.value, projectName)
}

function toggleProjectCollapse(projectName: string): void {
  const result = toggleSidebarProjectCollapseState({
    collapsedProjects: collapsedProjects.value,
    projectName,
    suppressProjectName: suppressNextProjectToggleId.value,
  })
  collapsedProjects.value = result.collapsedProjects
  suppressNextProjectToggleId.value = result.suppressProjectName
}

function getProjectOuterHeight(projectName: string): number {
  const measuredHeight = measuredHeightByProject.value[projectName] ?? 0
  const drag = activeProjectDrag.value
  const dragHeight = drag?.projectName === projectName ? drag.groupHeight : null
  return sidebarProjectOuterHeight({
    measuredHeight,
    dragHeight,
    isCollapsed: isCollapsed(projectName),
    expandedGapPx: PROJECT_GROUP_EXPANDED_GAP_PX,
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
  if (pendingProjectDrag.value || activeProjectDrag.value) return

  const fromIndex = props.groups.findIndex((group) => group.projectName === projectName)
  const projectGroupElement = projectGroupElementByName.get(projectName)
  if (fromIndex < 0 || !projectGroupElement) return

  const groupRect = projectGroupElement.getBoundingClientRect()
  const groupGap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
  pendingProjectDrag.value = {
    projectName,
    fromIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerOffsetY: event.clientY - groupRect.top,
    groupLeft: groupRect.left,
    groupWidth: groupRect.width,
    groupHeight: groupRect.height,
    groupOuterHeight: groupRect.height + groupGap,
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
    const currentProjectIndex = props.groups.findIndex((group) => group.projectName === drag.projectName)
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

  resetProjectDragState()
}

function onProjectDragKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!pendingProjectDrag.value && !activeProjectDrag.value) return

  event.preventDefault()
  resetProjectDragState()
}

function resetProjectDragState(): void {
  if (dragPointerRafId !== null) {
    window.cancelAnimationFrame(dragPointerRafId)
    dragPointerRafId = null
  }
  pendingDragPointerSample = null
  pendingProjectDrag.value = null
  activeProjectDrag.value = null
  suppressNextProjectToggleId.value = ''
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
    projectNames: props.groups.map((group) => group.projectName),
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
  const isMenuOpen = isProjectMenuOpen(projectName) || props.groups
    .find((group) => group.projectName === projectName)
    ?.threads.some((thread) => isThreadMenuOpen(thread.id)) === true

  return sidebarProjectGroupStyle({
    projectName,
    drag,
    targetTop,
    isMenuOpen,
  })
}

function visibleThreads(group: UiProjectGroup): UiThread[] {
  return visibleSidebarThreads(group, {
    pinnedThreadIds: pinnedThreadIds.value,
    isSearchActive: isSearchActive.value,
    isCollapsed: isCollapsed(group.projectName),
    isExpanded: isExpanded(group.projectName),
  })
}

function hasHiddenThreads(group: UiProjectGroup): boolean {
  return hasSidebarHiddenThreads(group, {
    pinnedThreadIds: pinnedThreadIds.value,
    isSearchActive: isSearchActive.value,
    isCollapsed: isCollapsed(group.projectName),
  })
}

function hasThreads(group: UiProjectGroup): boolean {
  return hasSidebarThreads(group, pinnedThreadIds.value)
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
@reference "tailwindcss";

.thread-tree-root {
  @apply flex flex-col;
}

.pinned-section {
  @apply relative z-20 mb-1;
}

.pinned-section[data-thread-menu-open='true'] {
  @apply z-50;
}

.thread-tree-header-row {
  @apply cursor-default;
}

.thread-tree-header {
  @apply text-sm font-normal text-zinc-500 select-none;
}

.thread-archive-view-toggle {
  @apply rounded px-1.5 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800;
}

.thread-start-button {
  @apply h-5 w-5 rounded text-zinc-500 flex items-center justify-center transition hover:bg-zinc-200 hover:text-zinc-700;
}

.thread-tree-loading {
  @apply px-3 py-2 text-sm text-zinc-500;
}

.thread-tree-no-results {
  @apply px-3 py-2 text-sm text-zinc-400;
}

.thread-tree-groups {
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

.project-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5 cursor-grab;
}

.project-main-button[data-dragging-handle='true'] {
  @apply cursor-grabbing;
}

.project-icon-stack {
  @apply relative w-4 h-4 flex items-center justify-center text-zinc-500;
}

.project-icon-folder {
  @apply absolute inset-0 flex items-center justify-center opacity-100;
}

.project-icon-chevron {
  @apply absolute inset-0 items-center justify-center opacity-0 hidden;
}

.project-title {
  @apply min-w-0 text-sm font-normal text-zinc-700 truncate select-none;
}

.project-title-name {
  @apply align-baseline;
}

.project-title-path {
  @apply ml-1 align-baseline text-xs text-zinc-400;
}

.project-menu-wrap {
  @apply relative;
}

.project-hover-controls {
  @apply flex items-center gap-1;
}

.project-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-zinc-600 flex items-center justify-center;
}

.project-menu-panel {
  @apply absolute right-0 top-full mt-1 z-50 min-w-36 rounded-md border border-zinc-200 bg-white p-1 shadow-md flex flex-col gap-0.5;
}

.project-menu-item {
  @apply rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100;
}

.project-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.project-menu-label {
  @apply px-2 pt-1 text-xs text-zinc-500;
}

.project-menu-input {
  @apply px-2 py-1 text-sm text-zinc-800 bg-transparent border-none outline-none;
}

.project-empty-row {
  @apply cursor-default;
}

.project-empty-spacer {
  @apply block w-4 h-4;
}

.project-empty {
  @apply text-sm text-zinc-400;
}

.thread-list {
  @apply list-none m-0 p-0 flex flex-col gap-0.5;
}

.project-group > .thread-list {
  @apply mt-0.5;
}

.thread-row-item {
  @apply m-0;
}

.thread-row {
  @apply hover:bg-zinc-200;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-pin-button {
  @apply absolute inset-0 w-4 h-4 rounded text-zinc-500 opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5;
}

.thread-row-title {
  @apply block text-sm leading-5 font-normal text-zinc-800 truncate whitespace-nowrap;
}

.thread-rename-input {
  @apply block h-5 w-full min-w-0 rounded border border-zinc-300 bg-white px-1 text-sm leading-5 text-zinc-900 outline-none focus:border-zinc-500;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time {
  @apply block text-sm font-normal text-zinc-500;
}

.thread-archive-button {
  @apply h-4 w-4 rounded p-0 text-xs text-zinc-600 flex items-center justify-center;
}

.thread-action-button {
  @apply h-4 w-4 rounded p-0 text-xs text-zinc-600 flex items-center justify-center hover:text-zinc-900;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-zinc-600 flex items-center justify-center hover:text-zinc-900;
}

.thread-menu-panel {
  @apply absolute right-0 top-full mt-1 z-50 min-w-32 rounded-md border border-zinc-200 bg-white p-1 shadow-md flex flex-col gap-0.5;
}

.thread-menu-item {
  @apply rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100;
}

.thread-menu-item-danger {
  @apply text-rose-700 hover:bg-rose-50;
}

.thread-archive-button[data-confirm='true'] {
  @apply h-5 w-auto px-1.5;
}

.thread-icon {
  @apply w-4 h-4;
}

.thread-show-more-row {
  @apply mt-1;
}

.thread-show-more-spacer {
  @apply block w-4 h-4;
}

.thread-show-more-button {
  @apply block mx-auto rounded-lg px-2 py-0.5 text-sm font-normal text-zinc-600 transition hover:text-zinc-800 hover:bg-zinc-200;
}

.project-header-row:hover .project-icon-folder {
  @apply opacity-0;
}

.project-header-row:hover .project-icon-chevron {
  @apply flex opacity-100;
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
