const SECRET_LIKE_VALUE = /[A-Za-z0-9_=-]{24,}/g

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function firstMessage(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Error && value.message.trim()) return value.message.trim()
  if (depth >= 4) return ''

  const row = record(value)
  if (!row) return ''
  const responseData = record(record(row.response)?.data)
  for (const candidate of [
    row.message,
    row.msg,
    row.error_msg,
    row.error,
    row.reason,
    responseData?.message,
    responseData?.msg,
    responseData?.error_msg,
    responseData?.error,
  ]) {
    const message = firstMessage(candidate, depth + 1)
    if (message) return message
  }

  const code = responseData?.code ?? row.code
  return typeof code === 'string' || typeof code === 'number'
    ? `飞书错误 ${String(code)}`
    : ''
}

export function safeFeishuErrorMessage(error: unknown, fallback = '未知错误'): string {
  const row = record(error)
  const responseData = record(record(row?.response)?.data)
  const responseMessage = firstMessage(
    responseData?.message ?? responseData?.msg ?? responseData?.error_msg ?? responseData?.error,
    1,
  )
  const directMessage = error instanceof Error
    ? error.message.trim()
    : firstMessage(row?.message ?? row?.msg, 1)
  const responseCode = responseData?.code
  const code = typeof responseCode === 'string' || typeof responseCode === 'number'
    ? String(responseCode)
    : ''
  const message = directMessage && responseMessage && !directMessage.includes(responseMessage)
    ? `${directMessage}（${code ? `飞书错误 ${code}` : '飞书错误'}: ${responseMessage}）`
    : directMessage || responseMessage || firstMessage(error) || fallback
  return message.replace(SECRET_LIKE_VALUE, '***')
}
