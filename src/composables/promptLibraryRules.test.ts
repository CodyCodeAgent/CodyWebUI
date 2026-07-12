import { describe, expect, it } from 'vitest'
import {
  defaultPromptTemplates,
  createPromptTemplateId,
  insertPromptIntoDraft,
  normalizePromptTemplates,
  visiblePromptTemplates,
} from './promptLibraryRules'

describe('prompt library rules', () => {
  it('provides useful defaults and rejects malformed stored rows', () => {
    expect(defaultPromptTemplates()).toHaveLength(4)
    expect(normalizePromptTemplates([{ id: '', title: 'Bad', content: '' }])).toHaveLength(4)
  })

  it('creates prompt ids without requiring secure-context randomUUID', () => {
    expect(createPromptTemplateId({ randomUUID: () => 'secure-id' })).toBe('prompt-secure-id')
    expect(createPromptTemplateId(null)).toMatch(/^prompt-[a-z0-9]+-[a-z0-9]+$/u)
  })

  it('filters workspace prompts without leaking them into another workspace', () => {
    const templates = normalizePromptTemplates([
      { id: 'global', title: 'Global review', content: 'Review', category: 'Review', scope: 'global' },
      { id: 'local', title: 'Local build', content: 'Build', category: 'Build', scope: 'workspace', workspaceCwd: '/repo/a' },
    ])

    expect(visiblePromptTemplates(templates, '/repo/a', '').map((item) => item.id)).toEqual(['global', 'local'])
    expect(visiblePromptTemplates(templates, '/repo/b', '').map((item) => item.id)).toEqual(['global'])
    expect(visiblePromptTemplates(templates, '/repo/a', 'build').map((item) => item.id)).toEqual(['local'])
  })

  it('inserts safely at the cursor and supports explicit replacement', () => {
    expect(insertPromptIntoDraft('BeforeAfter', 'Prompt', 6, 'insert')).toEqual({
      text: 'Before\n\nPrompt\n\nAfter',
      cursor: 14,
    })
    expect(insertPromptIntoDraft('Existing draft', 'Prompt', 4, 'replace')).toEqual({
      text: 'Prompt',
      cursor: 6,
    })
  })
})
