import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const localizedSurfaces = [
  'src/App.vue',
  'src/components/content/PromptLibraryDrawer.vue',
  'src/components/content/BrowserNotificationsPanel.vue',
  'src/components/content/MissionChecklist.vue',
  'src/components/content/TokenFlameWidget.vue',
  'src/components/content/RateLimitFloatingStatus.vue',
  'src/components/content/ThreadComposer.vue',
  'src/components/content/MessageMarkdown.vue',
  'src/components/content/WorkspaceSkillsPage.vue',
]

const forbiddenUiLiterals = [
  'Open prompt library',
  'Search prompts',
  'Browser alerts',
  'Mission checklist',
  'Waiting for your approval',
  'Daily token flame',
  'Refresh rate limits',
  'Type a message...',
  'Run settings</span>',
  'Close image preview',
]

describe('localized UI coverage', () => {
  it('keeps global and recently added surfaces free of known English UI literals', () => {
    const source = localizedSurfaces.map((file) => readFileSync(resolve(file), 'utf8')).join('\n')
    for (const literal of forbiddenUiLiterals) expect(source).not.toContain(literal)
  })
})
