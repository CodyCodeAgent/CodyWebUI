import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: true,
  typographer: false,
})

markdown.use(taskLists, { enabled: false, label: true, labelAfter: true })
markdown.use(footnote)

function toolbarButton(action: string, label: string): string {
  return `<button type="button" class="markdown-tool-button" data-markdown-action="${action}" aria-label="${label}" title="${label}">${label}</button>`
}

function codeBlockHtml(content: string, language = ''): string {
  const normalizedLanguage = language.toLowerCase()
  if (normalizedLanguage === 'mermaid' || normalizedLanguage === 'plantuml' || normalizedLanguage === 'puml') {
    const engine = normalizedLanguage === 'mermaid' ? 'mermaid' : 'plantuml'
    return `<div class="markdown-diagram-shell" data-diagram-engine="${engine}"><header class="markdown-diagram-toolbar"><span>${engine}</span><span class="markdown-diagram-actions">${toolbarButton('diagram-zoom-out', 'Zoom out')}${toolbarButton('diagram-fit', 'Fit')}${toolbarButton('diagram-zoom-in', 'Zoom in')}${toolbarButton('diagram-source', 'Source')}${toolbarButton('diagram-fullscreen', 'Fullscreen')}${toolbarButton('diagram-export-svg', 'SVG')}${toolbarButton('diagram-export-png', 'PNG')}</span></header><div class="markdown-diagram-stage" role="img" aria-label="${engine} technical diagram"><p class="markdown-diagram-status">Rendering ${engine}…</p></div><pre class="markdown-diagram-source" hidden><code>${markdown.utils.escapeHtml(content)}</code></pre></div>\n`
  }
  const lines = content.replace(/\n$/u, '').split('\n')
  const isCompact = lines.length <= 2 && lines.every((line) => line.length <= 96)
  const blockClass = isCompact ? 'markdown-code-block is-compact' : 'markdown-code-block'
  const codeClasses = [isCompact ? 'is-compact-code' : '', /^[A-Za-z0-9_-]+$/u.test(language) ? `language-${language}` : ''].filter(Boolean)
  const codeClass = codeClasses.length > 0 ? ` class="${codeClasses.join(' ')}"` : ''
  const languageLabel = language || 'text'
  return `<section class="markdown-code-shell${isCompact ? ' is-compact' : ''}" data-language="${languageLabel}"><header class="markdown-code-toolbar"><span>${languageLabel}</span><span class="markdown-code-actions">${toolbarButton('wrap-code', 'Wrap')}${toolbarButton('copy-code', 'Copy')}${toolbarButton('save-code', 'Save')}</span></header><pre class="${blockClass}"><code${codeClass}>${markdown.utils.escapeHtml(content)}</code></pre></section>\n`
}

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/u)[0] ?? ''
  return codeBlockHtml(token.content, language)
}
markdown.renderer.rules.code_block = (tokens, index) => codeBlockHtml(tokens[index].content)

markdown.renderer.rules.table_open = () => `<section class="markdown-table-shell" role="region" aria-label="Data table" tabindex="0"><header class="markdown-table-toolbar">${toolbarButton('copy-table', 'Copy CSV')}</header><div class="markdown-table-scroll"><table>\n`
markdown.renderer.rules.table_close = () => '</table></div></section>\n'

const defaultCodeInline = markdown.renderer.rules.code_inline
markdown.renderer.rules.code_inline = (tokens, index, options, env, self) => {
  const value = tokens[index].content
  const match = value.match(/^(.+?\.[A-Za-z0-9_-]{1,12})(?::(\d+))?$/u)
  if (!match || /\s/u.test(value)) {
    return defaultCodeInline ? defaultCodeInline(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
  }
  const path = markdown.utils.escapeHtml(match[1])
  const line = match[2] ?? ''
  return `<button type="button" class="markdown-file-link" data-markdown-action="open-file" data-file-path="${path}" data-file-line="${line}" title="Open ${path}"><code>${markdown.utils.escapeHtml(value)}</code></button>`
}

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const href = token.attrGet('href') ?? ''
  if (/^https?:\/\//u.test(href)) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen ? defaultLinkOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(markdown.render(source), {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['table'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  })
}
