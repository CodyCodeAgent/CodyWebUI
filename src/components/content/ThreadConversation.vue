<template>
  <section class="conversation-root">
    <p v-if="showBlockingLoading" class="conversation-loading">Loading messages...</p>

    <article v-else-if="showBlockingLoadError" class="conversation-load-error" role="alert">
      <p class="conversation-load-error-title">Could not load this thread.</p>
      <p class="conversation-load-error-message">{{ loadError }}</p>
      <button type="button" class="conversation-load-error-retry" @click="emit('retryLoad')">Retry</button>
    </article>

    <p
      v-else-if="showEmptyConversation"
      class="conversation-empty"
    >
      No messages in this thread yet.
    </p>

    <ul
      v-else
      ref="conversationListRef"
      class="conversation-list"
      data-testid="conversation-list"
      @scroll="onConversationScroll"
    >
      <li v-if="showRefreshStatus" class="conversation-item conversation-item-refresh">
        <p class="conversation-refresh-status">Refreshing messages...</p>
      </li>

      <li v-if="showInlineLoadError" class="conversation-item conversation-item-refresh">
        <article class="conversation-load-error conversation-load-error-inline" role="alert">
          <p class="conversation-load-error-title">Message refresh failed.</p>
          <p class="conversation-load-error-message">{{ loadError }}</p>
          <button type="button" class="conversation-load-error-retry" @click="emit('retryLoad')">Retry</button>
        </article>
      </li>

      <li
        v-for="card in conversationRequestCards"
        :key="`server-request:${card.request.id}`"
        class="conversation-item conversation-item-request"
      >
        <div class="message-row">
          <div class="message-stack">
            <article class="request-card">
              <p class="request-title">{{ card.summary.title }}</p>
              <p class="request-meta">{{ serverRequestMetaLabel({ request: card.request, idPrefix: 'Request #' }) }}</p>

              <p class="request-subject">{{ card.summary.subject }}</p>
              <div class="request-risk-line">
                <span class="request-risk-badge" :data-level="card.summary.level">
                  {{ card.summary.level }}
                </span>
                <span
                  v-for="label in card.summary.riskLabels"
                  :key="`${card.request.id}:${label}`"
                  class="request-risk-label"
                >
                  {{ label }}
                </span>
              </div>
              <p class="request-reason">{{ card.summary.description }}</p>
              <ul class="request-impact-list">
                <li v-for="impact in card.summary.impacts" :key="`${card.request.id}:${impact}`">
                  {{ impact }}
                </li>
              </ul>
              <div class="request-scope-line" aria-label="Approval scopes">
                <span
                  v-for="scope in approvalScopeOptions"
                  :key="`${card.request.id}:${scope.scope}`"
                  class="request-scope"
                  :data-enabled="scope.enabled"
                  :title="scope.description"
                >
                  {{ scope.label }}
                </span>
              </div>
              <p class="request-recommendation">{{ card.summary.recommendation }}</p>

              <section v-if="isConversationApprovalRequestKind(card.kind)" class="request-actions">
                <button
                  v-for="scope in approvalScopeOptions"
                  :key="`${card.request.id}:${conversationRequestActionKeyPrefix(card.kind)}:${scope.scope}`"
                  type="button"
                  class="request-button"
                  :class="{ 'request-button-primary': scope.scope === 'single', 'request-button-danger': scope.scope === 'permanent' }"
                  @click="onRespondApprovalScope(card.request.id, scope.scope)"
                >
                  {{ scope.label }}
                </button>
                <button type="button" class="request-button" @click="onRespondApproval(card.request.id, 'decline')">Decline</button>
                <button type="button" class="request-button" @click="onRespondApproval(card.request.id, 'cancel')">Cancel</button>
              </section>

              <section v-else-if="card.kind === 'tool_user_input'" class="request-user-input">
                <div
                  v-for="question in readToolQuestions(card.request)"
                  :key="`${card.request.id}:${question.id}`"
                  class="request-question"
                >
                  <p class="request-question-title">{{ toolQuestionTitle(question) }}</p>
                  <p v-if="shouldShowToolQuestionText(question)" class="request-question-text">{{ question.question }}</p>
                  <select
                    class="request-select"
                    :value="readQuestionAnswer(card.request.id, question.id, question.options[0] || '')"
                    @change="onQuestionAnswerChange(card.request.id, question.id, $event)"
                  >
                    <option v-for="option in question.options" :key="`${card.request.id}:${question.id}:${option}`" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <input
                    v-if="question.isOther"
                    class="request-input"
                    type="text"
                    :value="readQuestionOtherAnswer(card.request.id, question.id)"
                    placeholder="Other answer"
                    @input="onQuestionOtherAnswerInput(card.request.id, question.id, $event)"
                  />
                </div>

                <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(card.request)">
                  Submit Answers
                </button>
              </section>

              <section v-else-if="card.kind === 'tool_call'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(card.request.id)">Fail Tool Call</button>
                <button type="button" class="request-button" @click="onRespondToolCallSuccess(card.request.id)">Success (Empty)</button>
              </section>

              <section v-else class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(card.request.id)">Return Empty Result</button>
                <button type="button" class="request-button" @click="onRejectUnknownRequest(card.request.id)">Reject Request</button>
              </section>
            </article>
          </div>
        </div>
      </li>

      <li
        v-if="hiddenMessagesCount > 0"
        class="conversation-item conversation-item-history"
      >
        <button
          data-testid="conversation-history-button"
          class="conversation-history-button"
          type="button"
          @click="onLoadEarlierMessages"
        >
          {{ historyButtonLabel }}
          <span>{{ hiddenMessagesCount }} hidden</span>
        </button>
        <p class="conversation-history-window">{{ visibleMessageWindowLabel }}</p>
      </li>

      <li
        v-for="(message, renderedMessageIndex) in visibleMessages"
        :key="message.id"
        class="conversation-item"
        data-testid="conversation-message"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
        :data-message-id="message.id"
      >
        <div class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.skills && message.skills.length > 0"
                class="message-skill-list"
                :data-role="message.role"
              >
                <li v-for="skill in message.skills" :key="`${skill.name}:${skill.path}`" class="message-skill-item">
                  ${{ skill.displayName || skill.name }}
                </li>
              </ul>

              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <img class="message-image-preview" :src="imageUrl" alt="Message image preview" loading="lazy" />
                  </button>
                </li>
              </ul>

              <details
                v-if="message.tool"
                class="tool-timeline-card"
                :data-kind="message.tool.kind"
                :data-tone="toolStatusTone(message.tool.status)"
                :open="isToolTimelineOpen(message)"
                @toggle="onToolTimelineToggle(message.id, $event)"
              >
                <summary class="tool-timeline-summary-row">
                  <span class="tool-timeline-chevron" aria-hidden="true">›</span>
                  <span class="tool-timeline-summary-copy">
                    <span class="tool-timeline-header">
                      <span class="tool-timeline-title">{{ message.tool.title }}</span>
                      <span class="tool-timeline-status">{{ formatToolStatus(message.tool.status) }}</span>
                    </span>
                    <span class="tool-timeline-summary">{{ message.tool.summary }}</span>
                  </span>
                </summary>
                <div v-if="shouldMountToolTimelineBody(message)" class="tool-timeline-body">
                  <ul v-if="message.tool.details.length > 0" class="tool-timeline-detail-list">
                    <li v-for="detail in message.tool.details" :key="detail" class="tool-timeline-detail">
                      {{ detail }}
                    </li>
                  </ul>
                  <section v-if="message.tool.output" class="tool-timeline-output">
                    <div class="tool-timeline-output-header">
                      <p class="tool-timeline-output-label">{{ message.tool.outputLabel || 'Output' }}</p>
                      <button
                        v-if="isToolOutputPreviewable(message)"
                        class="tool-timeline-output-toggle"
                        type="button"
                        @click="toggleToolOutput(message.id)"
                      >
                        {{ toolOutputButtonLabel(message.id) }}
                      </button>
                    </div>
                    <pre class="tool-timeline-output-block"><code>{{ renderedToolOutput(message) }}</code></pre>
                  </section>
                </div>
              </details>

              <article
                v-if="message.text.length > 0"
                class="message-card"
                :data-role="message.role"
                :data-message-type="message.messageType || ''"
              >
                <details v-if="message.messageType === 'worked'" class="turn-receipt" aria-live="polite">
                  <summary>
                    <span class="turn-receipt-rail" aria-hidden="true" />
                    <span class="turn-receipt-status">{{ turnReceiptHeadline(message) }}</span>
                    <span class="turn-receipt-evidence">{{ turnReceiptEvidence(message) }}</span>
                    <span class="turn-receipt-chevron" aria-hidden="true">›</span>
                  </summary>
                  <dl v-if="turnReceiptDetails(message).length > 0">
                    <div v-for="detail in turnReceiptDetails(message)" :key="detail.label"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
                  </dl>
                </details>
                <div v-else-if="message.messageType === 'plan' || message.messageType === 'plan.live'" class="plan-message">
                  <p class="plan-message-title">Plan</p>
                  <MessageMarkdown :text="message.text" :cwd="cwd" />
                </div>
                <MessageMarkdown v-else :text="message.text" :cwd="cwd" />
              </article>

              <button
                v-if="shouldShowCopyButton(message, renderedMessageIndex)"
                data-testid="conversation-copy-button"
                class="message-copy-button"
                type="button"
                :aria-label="copyButtonAriaLabel(message.id)"
                :title="copyButtonTitle(message.id)"
                :data-copied="copiedMessageId === message.id"
                @click="copyMessage(message, renderedMessageIndex)"
              >
                <IconTablerCopy class="message-copy-icon" />
              </button>
            </article>
          </div>
        </div>
      </li>
      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <button
                data-testid="conversation-live-overlay-toggle"
                class="live-overlay-toggle"
                type="button"
                :aria-expanded="isLiveOverlayExpanded"
                :disabled="!hasLiveOverlayDetails"
                @click="toggleLiveOverlay"
              >
                <IconTablerChevronRight class="live-overlay-chevron" :data-expanded="isLiveOverlayExpanded" />
                <span class="live-overlay-label">{{ liveOverlay.activityLabel }}</span>
                <span v-if="hasLiveOverlayDetails" class="live-overlay-hint">
                  {{ liveOverlayDetailsLabel }}
                </span>
              </button>

              <div v-if="isLiveOverlayExpanded && hasLiveOverlayDetails" class="live-overlay-details" data-testid="conversation-live-overlay-details">
                <ul v-if="liveOverlay.activityDetails.length > 0" class="live-overlay-detail-list">
                  <li v-for="detail in liveOverlay.activityDetails" :key="detail" class="live-overlay-detail-item">
                    {{ detail }}
                  </li>
                </ul>
                <p
                  v-if="liveOverlay.reasoningText"
                  class="live-overlay-reasoning"
                  data-testid="conversation-live-overlay-reasoning"
                >
                  {{ liveOverlay.reasoningText }}
                </p>
              </div>
              <p v-if="liveOverlay.errorText" class="live-overlay-error">{{ liveOverlay.errorText }}</p>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <button
      v-if="showScrollToBottomButton"
      class="conversation-scroll-bottom"
      type="button"
      aria-label="Scroll to latest message"
      title="Scroll to latest message"
      @click="onScrollToBottomClick"
    >
      <IconTablerChevronDown class="conversation-scroll-bottom-icon" />
    </button>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" aria-label="Close image preview" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" alt="Expanded message image" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ThreadScrollState, UiApprovalDecisionScope, UiLiveOverlay, UiMessage, UiServerRequest, UiServerRequestReply } from '../../types/codex'
import {
  APPROVAL_SCOPE_OPTIONS,
  type UiApprovalDecision,
} from '../../composables/useApprovalRisk'
import {
  buildConversationScrollMetrics,
  buildConversationRequestCards,
  buildConversationScrollState,
  buildCopyTextAt as buildThreadCopyTextAt,
  buildToolCallFailureReply,
  buildToolCallSuccessReply,
  buildToolUserInputReply,
  conversationRequestActionKeyPrefix,
  DEFAULT_VISIBLE_MESSAGE_COUNT,
  hasLiveOverlayDetails as hasThreadLiveOverlayDetails,
  historyPageButtonLabel,
  hiddenMessageCount as hiddenThreadMessageCount,
  isConversationApprovalRequestKind,
  liveOverlayDetailsToggleLabel,
  MESSAGE_HISTORY_PAGE_SIZE,
  messageCopyAriaLabel,
  messageCopyTitle,
  nextVisibleMessageCount,
  normalizedVisibleMessageCount,
  normalizedConversationBottomLockFrames,
  preservedConversationScrollTop,
  readToolQuestionAnswer,
  readToolQuestionOtherAnswer,
  readToolQuestions,
  restoredConversationScrollTop,
  shouldShowBlockingConversationLoadError,
  shouldLockConversationToBottom,
  shouldPreserveConversationViewport,
  shouldRestoreConversationToBottom,
  shouldShowBlockingConversationLoading,
  shouldShowInlineConversationLoadError,
  shouldShowConversationRefreshStatus,
  shouldShowCopyButton as shouldShowThreadCopyButton,
  shouldShowScrollToBottomButton as shouldShowThreadScrollToBottomButton,
  shouldShowToolQuestionText,
  toolQuestionKey,
  toolQuestionTitle,
  visibleMessageWindowSummary,
  visibleMessageStartIndex,
} from '../../composables/threadConversationRules'
import {
  formatToolStatus,
  buildToolOutputPreview,
  isToolOutputTruncated,
  isToolTimelineExpandedByDefault,
  toolOutputToggleLabel,
  toolStatusTone,
} from '../../composables/threadToolTimelineRules'
import {
  buildApprovalDecisionReply,
  buildApprovalScopeReply,
  buildEmptyServerRequestReply,
  buildRejectedServerRequestReply,
  serverRequestMetaLabel,
} from '../../composables/serverRequestRules'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import MessageMarkdown from './MessageMarkdown.vue'

const props = defineProps<{
  cwd?: string
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  loadError: string
  activeThreadId: string
  scrollState: ThreadScrollState | null
}>()

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  respondServerRequest: [payload: UiServerRequestReply]
  retryLoad: []
}>()
const approvalScopeOptions = APPROVAL_SCOPE_OPTIONS

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const copiedMessageId = ref('')
const isLiveOverlayExpanded = ref((props.liveOverlay?.reasoningText ?? '').trim().length > 0)
const visibleMessageCount = ref(DEFAULT_VISIBLE_MESSAGE_COUNT)
const openToolMessageIds = ref<Record<string, boolean>>({})
const expandedToolOutputIds = ref<Record<string, boolean>>({})
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const BOTTOM_THRESHOLD_PX = 16
const HISTORY_TOP_THRESHOLD_PX = 12

let scrollRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedMessageTimer: number | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()

const hasLiveOverlayDetails = computed(() => {
  return hasThreadLiveOverlayDetails(props.liveOverlay)
})
const liveOverlayDetailsLabel = computed(() => liveOverlayDetailsToggleLabel(isLiveOverlayExpanded.value))
const conversationRequestCards = computed(() => buildConversationRequestCards(props.pendingRequests))
const normalizedVisibleMessagesCount = computed(() => normalizedVisibleMessageCount(
  props.messages.length,
  visibleMessageCount.value,
))
const visibleMessagesStartIndex = computed(() => visibleMessageStartIndex(
  props.messages.length,
  normalizedVisibleMessagesCount.value,
))
const hiddenMessagesCount = computed(() => hiddenThreadMessageCount(
  props.messages.length,
  normalizedVisibleMessagesCount.value,
))
const visibleMessages = computed(() => props.messages.slice(visibleMessagesStartIndex.value))
const historyButtonLabel = computed(() => historyPageButtonLabel(hiddenMessagesCount.value, MESSAGE_HISTORY_PAGE_SIZE))
const visibleMessageWindowLabel = computed(() => visibleMessageWindowSummary(
  props.messages.length,
  normalizedVisibleMessagesCount.value,
))
const showBlockingLoading = computed(() => shouldShowBlockingConversationLoading({
  isLoading: props.isLoading,
  messageCount: props.messages.length,
  pendingRequestCount: props.pendingRequests.length,
  hasLiveOverlay: props.liveOverlay !== null,
}))
const showRefreshStatus = computed(() => shouldShowConversationRefreshStatus({
  isLoading: props.isLoading,
  messageCount: props.messages.length,
  pendingRequestCount: props.pendingRequests.length,
  hasLiveOverlay: props.liveOverlay !== null,
}))
const showBlockingLoadError = computed(() => shouldShowBlockingConversationLoadError({
  isLoading: props.isLoading,
  loadError: props.loadError,
  messageCount: props.messages.length,
  pendingRequestCount: props.pendingRequests.length,
  hasLiveOverlay: props.liveOverlay !== null,
}))
const showInlineLoadError = computed(() => shouldShowInlineConversationLoadError({
  isLoading: props.isLoading,
  loadError: props.loadError,
  messageCount: props.messages.length,
  pendingRequestCount: props.pendingRequests.length,
  hasLiveOverlay: props.liveOverlay !== null,
}))
const showEmptyConversation = computed(() =>
  !showBlockingLoadError.value &&
  props.messages.length === 0 &&
  props.pendingRequests.length === 0 &&
  props.liveOverlay === null,
)

const showScrollToBottomButton = computed(() => {
  return shouldShowThreadScrollToBottomButton({
    activeThreadId: props.activeThreadId,
    isLoading: props.isLoading,
    messageCount: props.messages.length,
    pendingRequestCount: props.pendingRequests.length,
    hasLiveOverlay: props.liveOverlay !== null,
    scrollState: props.scrollState,
  })
})

function toAbsoluteMessageIndex(renderedMessageIndex: number): number {
  return visibleMessagesStartIndex.value + renderedMessageIndex
}

function shouldShowCopyButton(message: UiMessage, renderedMessageIndex: number): boolean {
  return shouldShowThreadCopyButton(props.messages, message, toAbsoluteMessageIndex(renderedMessageIndex))
}

function buildCopyTextAt(message: UiMessage, renderedMessageIndex: number): string {
  return buildThreadCopyTextAt(props.messages, message, toAbsoluteMessageIndex(renderedMessageIndex))
}

function defaultToolTimelineOpen(message: UiMessage): boolean {
  return message.tool ? isToolTimelineExpandedByDefault(message.tool) : false
}

function isToolTimelineOpen(message: UiMessage): boolean {
  const saved = openToolMessageIds.value[message.id]
  return typeof saved === 'boolean' ? saved : defaultToolTimelineOpen(message)
}

function shouldMountToolTimelineBody(message: UiMessage): boolean {
  return isToolTimelineOpen(message)
}

function isToolOutputPreviewable(message: UiMessage): boolean {
  return message.tool?.output ? isToolOutputTruncated(message.tool.output) : false
}

function isToolOutputExpanded(messageId: string): boolean {
  return expandedToolOutputIds.value[messageId] === true
}

function renderedToolOutput(message: UiMessage): string {
  const output = message.tool?.output ?? ''
  if (!output || isToolOutputExpanded(message.id) || !isToolOutputTruncated(output)) return output
  return buildToolOutputPreview(output)
}

function toolOutputButtonLabel(messageId: string): string {
  return toolOutputToggleLabel(isToolOutputExpanded(messageId))
}

function toggleToolOutput(messageId: string): void {
  expandedToolOutputIds.value = {
    ...expandedToolOutputIds.value,
    [messageId]: !isToolOutputExpanded(messageId),
  }
}

function onToolTimelineToggle(messageId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLDetailsElement)) return
  openToolMessageIds.value = {
    ...openToolMessageIds.value,
    [messageId]: target.open,
  }
}

function isMessageCopied(messageId: string): boolean {
  return copiedMessageId.value === messageId
}

function copyButtonAriaLabel(messageId: string): string {
  return messageCopyAriaLabel(isMessageCopied(messageId))
}

function copyButtonTitle(messageId: string): string {
  return messageCopyTitle(isMessageCopied(messageId))
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyMessage(message: UiMessage, renderedMessageIndex: number): Promise<void> {
  const text = buildCopyTextAt(message, renderedMessageIndex)
  if (text.length === 0) return

  await writeClipboardText(text)
  copiedMessageId.value = message.id

  if (copiedMessageTimer !== null) {
    window.clearTimeout(copiedMessageTimer)
  }
  copiedMessageTimer = window.setTimeout(() => {
    if (copiedMessageId.value === message.id) {
      copiedMessageId.value = ''
    }
    copiedMessageTimer = null
  }, 1400)
}

function toggleLiveOverlay(): void {
  if (!hasLiveOverlayDetails.value) return
  isLiveOverlayExpanded.value = !isLiveOverlayExpanded.value
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  return readToolQuestionAnswer(toolQuestionAnswers.value, requestId, questionId, fallback)
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  return readToolQuestionOtherAnswer(toolQuestionOtherAnswers.value, requestId, questionId)
}

function onQuestionAnswerChange(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onRespondApproval(requestId: number, decision: UiApprovalDecision): void {
  emit('respondServerRequest', buildApprovalDecisionReply(requestId, decision))
}

function onRespondApprovalScope(requestId: number, scope: UiApprovalDecisionScope): void {
  emit('respondServerRequest', buildApprovalScopeReply(requestId, scope))
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  emit('respondServerRequest', buildToolUserInputReply({
    request,
    answersByKey: toolQuestionAnswers.value,
    otherAnswersByKey: toolQuestionOtherAnswers.value,
  }))
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', buildToolCallFailureReply(requestId))
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', buildToolCallSuccessReply(requestId))
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', buildEmptyServerRequestReply(requestId))
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', buildRejectedServerRequestReply(
    requestId,
    'Rejected from cody-web-ui UI.',
  ))
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function onScrollToBottomClick(): void {
  enforceBottomState()
  scheduleBottomLock(3)
}

async function revealEarlierMessages(): Promise<void> {
  if (hiddenMessagesCount.value <= 0) return
  const container = conversationListRef.value
  const previousScrollHeight = container?.scrollHeight ?? 0
  visibleMessageCount.value = nextVisibleMessageCount(props.messages.length, visibleMessageCount.value)
  await nextTick()
  if (container) {
    container.scrollTop += container.scrollHeight - previousScrollHeight
    emitScrollState(container)
  }
}

function onLoadEarlierMessages(): void {
  void revealEarlierMessages()
}

function emitScrollState(container: HTMLElement): void {
  if (!props.activeThreadId) return
  const state = buildConversationScrollState({
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    bottomThresholdPx: BOTTOM_THRESHOLD_PX,
  })
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state,
  })
}

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  const savedState = props.scrollState
  if (!savedState || shouldRestoreConversationToBottom(savedState)) {
    enforceBottomState()
    return
  }

  const metrics = buildConversationScrollMetrics({
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    bottomThresholdPx: BOTTOM_THRESHOLD_PX,
  })
  container.scrollTop = shouldPreserveConversationViewport(savedState)
    ? preservedConversationScrollTop(savedState, metrics.maxScrollTop)
    : restoredConversationScrollTop(savedState, metrics.maxScrollTop)
  emitScrollState(container)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
  emitScrollState(container)
}

function shouldLockToBottom(): boolean {
  return shouldLockConversationToBottom(props.scrollState)
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = normalizedConversationBottomLockFrames(frames)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleScrollRestore(): Promise<void> {
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    applySavedScrollState()
    bindPendingImageHandlers()
    scheduleBottomLock()
  })
}

watch(
  () => props.messages,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    if (overlay.reasoningText.trim().length > 0) {
      isLiveOverlayExpanded.value = true
    } else if (!hasLiveOverlayDetails.value) {
      isLiveOverlayExpanded.value = false
    }
    await nextTick()
    if (!shouldPreserveConversationViewport(props.scrollState)) {
      enforceBottomState()
    }
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.activeThreadId,
  () => {
    modalImageUrl.value = ''
    isLiveOverlayExpanded.value = false
    visibleMessageCount.value = DEFAULT_VISIBLE_MESSAGE_COUNT
    openToolMessageIds.value = {}
    expandedToolOutputIds.value = {}
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  if (container.scrollTop <= HISTORY_TOP_THRESHOLD_PX && hiddenMessagesCount.value > 0) {
    void revealEarlierMessages()
  }
  emitScrollState(container)
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onBeforeUnmount(() => {
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
  if (copiedMessageTimer !== null) {
    window.clearTimeout(copiedMessageTimer)
  }
})
type TurnReceiptDetail = { label: string; value: string }

function turnReceiptPayload(message: UiMessage): Record<string, unknown> | null {
  if (!message.rawPayload) return null
  try {
    const value = JSON.parse(message.rawPayload) as unknown
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

function turnReceiptHeadline(message: UiMessage): string {
  const payload = turnReceiptPayload(message)
  if (typeof payload?.label === 'string') return payload.label
  const [headline] = message.text.split(' · ')
  return headline || message.text
}

function turnReceiptEvidence(message: UiMessage): string {
  const parts = message.text.split(' · ')
  return parts.slice(1).join(' · ') || (message.text.startsWith('Worked for ') ? message.text.replace('Worked for ', '') : '')
}

function turnReceiptDetails(message: UiMessage): TurnReceiptDetail[] {
  const payload = turnReceiptPayload(message)
  if (!payload) return []
  return [
    typeof payload.fileCount === 'number' && payload.fileCount > 0 ? { label: 'Files changed', value: String(payload.fileCount) } : null,
    typeof payload.commandCount === 'number' && payload.commandCount > 0 ? { label: 'Commands', value: String(payload.commandCount) } : null,
    typeof payload.validationCount === 'number' && payload.validationCount > 0 ? { label: 'Validations', value: `${String(payload.validationCount)} passed` } : null,
  ].filter((detail): detail is TurnReceiptDetail => detail !== null)
}
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply relative h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-load-error {
  @apply mx-6 max-w-2xl rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm;
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-panel));
  border-color: color-mix(in srgb, var(--color-danger) 36%, var(--color-border));
  color: var(--color-text);
}

.conversation-load-error-inline {
  @apply mx-0 w-full max-w-180;
}

.conversation-load-error-title {
  @apply m-0 font-semibold;
}

.conversation-load-error-message {
  @apply m-0 mt-1 break-words text-xs leading-5 text-rose-700;
  color: color-mix(in srgb, var(--color-danger) 34%, var(--color-text-muted));
}

.conversation-load-error-retry {
  @apply mt-3 inline-flex h-8 items-center rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200;
  background: var(--color-surface);
  border-color: color-mix(in srgb, var(--color-danger) 42%, var(--color-border));
  color: color-mix(in srgb, var(--color-danger) 34%, var(--color-text));
}

.conversation-load-error-retry:hover {
  background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-3;
}

.conversation-item {
  @apply m-0 w-full flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.conversation-item-history {
  @apply flex-col items-center justify-center gap-1;
}

.conversation-item-refresh {
  @apply justify-center;
}

.conversation-refresh-status {
  @apply m-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm;
}

.conversation-history-button {
  @apply mx-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300;
}

.conversation-history-button span {
  @apply text-slate-400;
}

.conversation-history-window {
  @apply m-0 text-[0.68rem] leading-4 text-slate-400;
}

.message-row {
  @apply relative w-full max-w-180 mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.conversation-scroll-bottom {
  @apply absolute bottom-3 right-8 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300;
}

.conversation-scroll-bottom-icon {
  @apply h-5 w-5;
}

.message-stack {
  @apply flex flex-col w-full;
}

.request-card {
  @apply w-full max-w-180 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-subject {
  @apply m-0 max-w-full whitespace-pre-wrap break-words font-mono text-xs leading-5 text-amber-950;
}

.request-risk-line {
  @apply flex flex-wrap items-center gap-1.5;
}

.request-risk-badge {
  @apply rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase leading-4;
}

.request-risk-badge[data-level='low'] {
  @apply border-emerald-300 bg-emerald-50 text-emerald-800;
}

.request-risk-badge[data-level='medium'] {
  @apply border-amber-300 bg-amber-100 text-amber-900;
}

.request-risk-badge[data-level='high'] {
  @apply border-rose-300 bg-rose-100 text-rose-800;
}

.request-risk-label {
  @apply rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[0.68rem] leading-4 text-amber-900;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap;
}

.request-impact-list {
  @apply m-0 list-disc space-y-1 pl-4 text-xs leading-4 text-amber-900;
}

.request-scope-line {
  @apply flex flex-wrap gap-1.5;
}

.request-scope {
  @apply rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-normal text-blue-700;
}

.request-scope[data-enabled='false'] {
  @apply border-amber-200 bg-amber-100 text-amber-800;
}

.request-recommendation {
  @apply m-0 rounded-md border border-amber-200 bg-white/70 px-2 py-1.5 text-xs leading-4 text-amber-950;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-button-danger {
  @apply border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.live-overlay-inline {
  @apply w-full max-w-180 px-0 py-1 flex flex-col gap-2;
}

.live-overlay-toggle {
  @apply flex w-fit max-w-full items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-left transition hover:border-zinc-200 hover:bg-zinc-50 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent;
}

.live-overlay-chevron {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform;
}

.live-overlay-chevron[data-expanded='true'] {
  @apply rotate-90;
}

.live-overlay-label {
  @apply min-w-0 truncate text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-hint {
  @apply shrink-0 text-xs leading-5 text-zinc-400;
}

.live-overlay-details {
  @apply ml-6 flex max-w-170 flex-col gap-2 border-l border-zinc-200 pl-3;
}

.live-overlay-detail-list {
  @apply m-0 flex list-none flex-col gap-1 p-0;
}

.live-overlay-detail-item {
  @apply m-0 text-sm leading-5 text-zinc-500;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap;
}

.live-overlay-error {
  @apply m-0 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.message-body {
  @apply relative flex flex-col max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-skill-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-skill-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-skill-item {
  @apply m-0 rounded-md border border-slate-300 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.tool-timeline-card {
  @apply w-full max-w-[min(760px,100%)] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800;
}

.tool-timeline-card summary::-webkit-details-marker {
  display: none;
}

.tool-timeline-card[data-tone='success'] {
  @apply border-emerald-200 bg-emerald-50;
}

.tool-timeline-card[data-tone='danger'] {
  @apply border-rose-200 bg-rose-50;
}

.tool-timeline-card[data-tone='working'] {
  @apply border-blue-200 bg-blue-50;
}

.tool-timeline-summary-row {
  @apply grid cursor-pointer list-none grid-cols-[1rem_minmax(0,1fr)] items-start gap-2;
}

.tool-timeline-chevron {
  @apply mt-0.5 select-none text-base leading-4 text-slate-500 transition-transform;
}

.tool-timeline-card[open] .tool-timeline-chevron {
  transform: rotate(90deg);
}

.tool-timeline-summary-copy {
  @apply min-w-0;
}

.tool-timeline-header {
  @apply flex items-center gap-2;
}

.tool-timeline-title {
  @apply min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-normal text-slate-600;
}

.tool-timeline-status {
  @apply shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.68rem] leading-4 font-medium text-slate-600;
}

.tool-timeline-card[data-tone='success'] .tool-timeline-status {
  @apply border-emerald-200 bg-emerald-100 text-emerald-800;
}

.tool-timeline-card[data-tone='danger'] .tool-timeline-status {
  @apply border-rose-200 bg-rose-100 text-rose-800;
}

.tool-timeline-card[data-tone='working'] .tool-timeline-status {
  @apply border-blue-200 bg-blue-100 text-blue-800;
}

.tool-timeline-summary {
  @apply mt-1 block max-w-full whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-900;
}

.tool-timeline-body {
  @apply ml-6;
}

.tool-timeline-detail-list {
  @apply mt-2 mb-0 grid list-none gap-1 p-0;
}

.tool-timeline-detail {
  @apply m-0 min-w-0 truncate font-mono text-xs leading-4 text-slate-600;
}

.tool-timeline-output {
  @apply mt-2 border-t border-slate-200 pt-2;
}

.tool-timeline-output-header {
  @apply mb-1 flex items-center justify-between gap-3;
}

.tool-timeline-output-label {
  @apply m-0 text-xs font-medium text-slate-500;
}

.tool-timeline-output-toggle {
  @apply shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300;
}

.tool-timeline-output-block {
  @apply m-0 max-h-80 overflow-auto rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 text-slate-800;
}

.tool-timeline-output-block code {
  @apply whitespace-pre font-mono;
}

.message-card {
  @apply max-w-[min(76ch,100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-copy-button {
  @apply mt-1 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 opacity-45 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-300;
}

.message-body[data-role='user'] .message-copy-button {
  @apply self-start;
}

.message-body[data-role='assistant'] .message-copy-button,
.message-body[data-role='system'] .message-copy-button {
  @apply self-end;
}

.message-copy-button[data-copied='true'] {
  @apply border-emerald-300 bg-emerald-50 text-emerald-700 opacity-100;
}

.message-copy-icon {
  @apply h-4 w-4;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl bg-slate-200 px-4 py-3 max-w-[min(560px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

.plan-message {
  @apply border-l-2 border-slate-300 pl-3;
}

.plan-message-title {
  @apply mb-2 mt-0 text-xs font-semibold uppercase tracking-normal text-slate-500;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator {
  @apply w-full flex items-center gap-4;
}

.worked-separator-line {
  @apply h-px bg-zinc-300/80 flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal text-slate-800;
}

.turn-receipt {
  width: min(100%, 42rem);
  margin: .35rem auto .2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-panel) 74%, transparent);
  color: var(--color-text-muted);
}

.turn-receipt summary {
  display: grid;
  grid-template-columns: 2.75rem auto minmax(0,1fr) auto;
  align-items: center;
  gap: .65rem;
  min-height: 2.35rem;
  cursor: pointer;
  list-style: none;
  padding: .35rem .65rem;
}

.turn-receipt summary::-webkit-details-marker { display: none; }
.turn-receipt-rail { height: 2px; background: var(--color-success); box-shadow: 0 0 10px color-mix(in srgb, var(--color-success) 46%, transparent); }
.turn-receipt-status { color: var(--color-text); font-size: .75rem; font-weight: 680; }
.turn-receipt-evidence { overflow: hidden; font-family: var(--font-mono); font-size: .64rem; text-overflow: ellipsis; white-space: nowrap; }
.turn-receipt-chevron { font-size: 1rem; transition: transform var(--motion-fast); }
.turn-receipt[open] .turn-receipt-chevron { transform: rotate(90deg); }
.turn-receipt dl { display: grid; gap: .35rem; margin: 0; border-top: 1px solid var(--color-border); padding: .65rem; }
.turn-receipt dl div { display: flex; justify-content: space-between; gap: 1rem; }
.turn-receipt dt { color: var(--color-text-muted); font-size: .7rem; }
.turn-receipt dd { margin: 0; color: var(--color-text); font-family: var(--font-mono); font-size: .68rem; }

@media (max-width: 720px) {
  .turn-receipt { width: 100%; }
  .turn-receipt summary { grid-template-columns: 2rem auto minmax(0,1fr) auto; gap: .45rem; }
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}
</style>
