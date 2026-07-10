import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  translateLocaleMessage,
} from './useLocale'

describe('useLocale helpers', () => {
  it('normalizes supported locales', () => {
    expect(normalizeAppLocale('en')).toBe('en')
    expect(normalizeAppLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeAppLocale('fr')).toBe(DEFAULT_APP_LOCALE)
    expect(normalizeAppLocale(null)).toBe(DEFAULT_APP_LOCALE)
  })

  it('translates messages and applies replacements', () => {
    expect(translateLocaleMessage('en', 'settings.language.title')).toBe('Language')
    expect(translateLocaleMessage('zh-CN', 'settings.language.title')).toBe('语言')
    expect(translateLocaleMessage('en', 'theme.imported', { name: 'Custom' })).toBe('Imported Custom.')
    expect(translateLocaleMessage('zh-CN', 'theme.imported', { name: 'Custom' })).toBe('已导入 Custom。')
    expect(translateLocaleMessage('en', 'workLog.floatSummary', { files: '2', commands: '3' })).toBe('2 files · 3 commands')
    expect(translateLocaleMessage('zh-CN', 'workLog.floatSummary', { files: '2', commands: '3' })).toBe('2 个文件 · 3 条命令')
    expect(translateLocaleMessage('zh-CN', 'workLog.fileStatus.modified')).toBe('已修改')
    expect(translateLocaleMessage('zh-CN', 'approvalRisk.label.deletesFiles')).toBe('删除文件')
    expect(translateLocaleMessage('zh-CN', 'approvalRisk.impact.outsideWorkspacePaths', { paths: '/etc/passwd' })).toBe('该命令引用了 cwd 外的路径：/etc/passwd')
  })
})
