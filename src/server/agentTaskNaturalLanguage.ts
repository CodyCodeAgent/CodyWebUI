import type { AgentTaskInput, AgentTaskSchedule } from './agentTaskStore.js'

export type AgentTaskDraft = Pick<AgentTaskInput, 'name' | 'prompt' | 'schedule' | 'timezone'> & {
  confidence: 'high' | 'medium' | 'low'
  explanation: string
}

const weekdayNames: Array<[RegExp, number]> = [
  [/(?:周日|星期日|sunday\b|sun\b)/iu, 0], [/(?:周一|星期一|monday\b|mon\b)/iu, 1],
  [/(?:周二|星期二|tuesday\b|tue\b)/iu, 2], [/(?:周三|星期三|wednesday\b|wed\b)/iu, 3],
  [/(?:周四|星期四|thursday\b|thu\b)/iu, 4], [/(?:周五|星期五|friday\b|fri\b)/iu, 5],
  [/(?:周六|星期六|saturday\b|sat\b)/iu, 6],
]

function timeFromText(text: string): string {
  const match = text.match(/at\s*(\d{1,2})(?::(\d{1,2}))?/iu)
    ?? text.match(/(\d{1,2})点(\d{1,2})?/u)
    ?? text.match(/(\d{1,2}):(\d{1,2})/u)
  if (!match) return '09:00'
  const hour = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2] ?? 0)))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function titleFromText(text: string): string {
  const compact = text.replace(/\s+/gu, ' ').trim()
  return compact.length > 48 ? `${compact.slice(0, 48)}…` : compact
}

export function parseAgentTaskInstruction(
  instruction: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  now = new Date(),
): AgentTaskDraft {
  const text = instruction.trim()
  if (!text) throw new Error('Describe the task you want to schedule')
  let schedule: AgentTaskSchedule = { kind: 'daily', time: '09:00' }
  let confidence: AgentTaskDraft['confidence'] = 'medium'
  let explanation = 'Daily schedule inferred; review the time before saving.'

  const cron = text.match(/(?:cron\s*[:：]?\s*)([^\n,，;；]+)/iu)
  const interval = text.match(/(?:每|every)\s*(\d+)\s*(分钟|分|小时|hours?|minutes?|mins?)/iu)
  const monthDay = text.match(/(?:每月|monthly(?:\s+on)?)\s*(\d{1,2})(?:号|日|st|nd|rd|th)?/iu)
  const weekdaysOnly = /工作日|weekdays?|business days?/iu.test(text)
  const weekday = weekdayNames.find(([pattern]) => pattern.test(text))
  const once = /明天|tomorrow/iu.test(text)

  if (cron) {
    schedule = { kind: 'cron', expression: cron[1]!.trim() }
    confidence = 'high'
    explanation = 'Cron expression detected.'
  } else if (interval) {
    const amount = Number(interval[1])
    const isHour = /小时|hour/iu.test(interval[2]!)
    schedule = { kind: 'interval', intervalMinutes: Math.max(5, amount * (isHour ? 60 : 1)) }
    confidence = 'high'
    explanation = `Runs every ${String(schedule.intervalMinutes)} minutes.`
  } else if (monthDay) {
    schedule = { kind: 'monthly', day: Math.min(31, Math.max(1, Number(monthDay[1]))), time: timeFromText(text) }
    confidence = 'high'
    explanation = 'Monthly date and time detected.'
  } else if (once) {
    const [hour, minute] = timeFromText(text).split(':').map(Number) as [number, number]
    const date = new Date(now)
    date.setDate(date.getDate() + 1)
    date.setHours(hour, minute, 0, 0)
    schedule = { kind: 'once', runAtIso: date.toISOString() }
    confidence = 'medium'
    explanation = 'One-time run tomorrow detected; confirm the displayed local time.'
  } else if (weekdaysOnly) {
    schedule = { kind: 'daily', time: timeFromText(text), weekdaysOnly: true }
    confidence = 'high'
    explanation = 'Weekday schedule detected.'
  } else if (weekday) {
    schedule = { kind: 'weekly', weekday: weekday[1], time: timeFromText(text) }
    confidence = 'high'
    explanation = 'Weekly day and time detected.'
  } else if (/每天|daily|every day/iu.test(text)) {
    schedule = { kind: 'daily', time: timeFromText(text) }
    confidence = 'high'
    explanation = 'Daily time detected.'
  }

  return { name: titleFromText(text), prompt: text, schedule, timezone, confidence, explanation }
}
