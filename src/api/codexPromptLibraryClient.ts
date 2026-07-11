import { CodexApiError } from './codexErrors'
import { asRecord, fetchCodexResultRecord, jsonPostInit } from './codexHttpClient'
import type { PromptTemplate } from '../composables/promptLibraryRules'

function normalizeTemplates(value: unknown, status: number): PromptTemplate[] {
  if (!Array.isArray(value)) throw new CodexApiError('Prompt library returned malformed response', { code: 'invalid_response', method: 'prompt-templates', status })
  return value as PromptTemplate[]
}

export async function fetchPromptTemplates(): Promise<PromptTemplate[]> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/prompt-templates', {
    method: 'prompt-templates/list', networkErrorMessage: 'Prompt library request failed before it was sent',
    httpErrorMessage: 'Prompt library request failed', malformedMessage: 'Prompt library returned malformed response',
  })
  return normalizeTemplates(result.templates, status)
}

export async function replacePromptTemplates(templates: PromptTemplate[]): Promise<PromptTemplate[]> {
  const { result, status } = await fetchCodexResultRecord('/codex-api/prompt-templates', {
    init: jsonPostInit({ templates }), method: 'prompt-templates/replace',
    networkErrorMessage: 'Prompt library save failed before it was sent', httpErrorMessage: 'Prompt library save failed',
    malformedMessage: 'Prompt library save returned malformed response',
  })
  const row = asRecord(result)
  return normalizeTemplates(row?.templates, status)
}
