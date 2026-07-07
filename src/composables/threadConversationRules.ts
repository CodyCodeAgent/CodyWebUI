import type { UiMessage, UiToolTimelineEntry } from '../types/codex'
import { formatToolStatus } from './threadToolTimelineRules'

export function buildToolCopyText(tool: UiToolTimelineEntry): string {
  const parts = [`${tool.title}: ${tool.summary}`]
  if (tool.status.trim().length > 0) {
    parts.push(`Status: ${formatToolStatus(tool.status)}`)
  }
  if (tool.details.length > 0) {
    parts.push(tool.details.join('\n'))
  }
  if (tool.output?.trim()) {
    parts.push(`${tool.outputLabel || 'Output'}:\n${tool.output.trim()}`)
  }
  return parts.join('\n')
}

export function buildCopyText(message: UiMessage): string {
  const parts: string[] = []
  if (message.tool) {
    parts.push(buildToolCopyText(message.tool))
  }

  const text = message.text.trim()
  if (text.length > 0) {
    parts.push(text)
  }

  const skills = message.skills?.filter((skill) => skill.name.trim().length > 0) ?? []
  if (skills.length > 0) {
    parts.push(skills.map((skill) => `$${skill.name}`).join('\n'))
  }

  const images = message.images?.filter((imageUrl) => imageUrl.trim().length > 0) ?? []
  if (images.length > 0) {
    parts.push(images.join('\n'))
  }

  return parts.join('\n\n')
}

export function isCopyableMessage(message: UiMessage): boolean {
  if (message.messageType === 'worked') return false
  return buildCopyText(message).length > 0
}

export function isAssistantResponseMessage(message: UiMessage): boolean {
  return message.role !== 'user' && isCopyableMessage(message)
}

export function findNextCopyableMessageIndex(messages: UiMessage[], startIndex: number): number {
  for (let index = startIndex; index < messages.length; index += 1) {
    if (isCopyableMessage(messages[index])) {
      return index
    }
  }
  return -1
}

export function shouldShowCopyButton(messages: UiMessage[], message: UiMessage, messageIndex: number): boolean {
  if (!isCopyableMessage(message)) return false
  if (message.role === 'user') return true

  const nextCopyableIndex = findNextCopyableMessageIndex(messages, messageIndex + 1)
  if (nextCopyableIndex === -1) return true
  return !isAssistantResponseMessage(messages[nextCopyableIndex])
}

export function buildCopyTextAt(messages: UiMessage[], message: UiMessage, messageIndex: number): string {
  if (message.role === 'user') return buildCopyText(message)

  const parts: string[] = []
  let startIndex = messageIndex
  while (startIndex > 0 && isAssistantResponseMessage(messages[startIndex - 1])) {
    startIndex -= 1
  }

  for (let index = startIndex; index <= messageIndex; index += 1) {
    const currentMessage = messages[index]
    if (!isAssistantResponseMessage(currentMessage)) continue

    const text = buildCopyText(currentMessage)
    if (text.length > 0) {
      parts.push(text)
    }
  }

  return parts.join('\n\n')
}
