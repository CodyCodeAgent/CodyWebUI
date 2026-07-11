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

export type MarkdownUiLabels = {
  zoomOut: string; fit: string; zoomIn: string; source: string; fullscreen: string
  rendering: (engine: string) => string; diagramAria: (engine: string) => string
  wrap: string; copy: string; save: string; dataTable: string; copyCsv: string
  openFile: (path: string) => string
}

const DEFAULT_LABELS: MarkdownUiLabels = {
  zoomOut: 'Zoom out', fit: 'Fit', zoomIn: 'Zoom in', source: 'Source', fullscreen: 'Fullscreen',
  rendering: (engine) => `Rendering ${engine}…`, diagramAria: (engine) => `${engine} technical diagram`,
  wrap: 'Wrap', copy: 'Copy', save: 'Save', dataTable: 'Data table', copyCsv: 'Copy CSV',
  openFile: (path) => `Open ${path}`,
}

function codeBlockHtml(content: string, language = '', labels = DEFAULT_LABELS): string {
  const normalizedLanguage = language.toLowerCase()
  if (normalizedLanguage === 'mermaid' || normalizedLanguage === 'plantuml' || normalizedLanguage === 'puml') {
    const engine = normalizedLanguage === 'mermaid' ? 'mermaid' : 'plantuml'
    return `<div class="markdown-diagram-shell" data-diagram-engine="${engine}"><header class="markdown-diagram-toolbar"><span>${engine}</span><span class="markdown-diagram-actions">${toolbarButton('diagram-zoom-out', labels.zoomOut)}${toolbarButton('diagram-fit', labels.fit)}${toolbarButton('diagram-zoom-in', labels.zoomIn)}${toolbarButton('diagram-source', labels.source)}${toolbarButton('diagram-fullscreen', labels.fullscreen)}${toolbarButton('diagram-export-svg', 'SVG')}${toolbarButton('diagram-export-png', 'PNG')}</span></header><div class="markdown-diagram-stage" role="img" aria-label="${labels.diagramAria(engine)}"><p class="markdown-diagram-status">${labels.rendering(engine)}</p></div><pre class="markdown-diagram-source" hidden><code>${markdown.utils.escapeHtml(content)}</code></pre></div>\n`
  }
  const lines = content.replace(/\n$/u, '').split('\n')
  const isCompact = lines.length <= 2 && lines.every((line) => line.length <= 96)
  const blockClass = isCompact ? 'markdown-code-block is-compact' : 'markdown-code-block'
  const codeClasses = [isCompact ? 'is-compact-code' : '', /^[A-Za-z0-9_-]+$/u.test(language) ? `language-${language}` : ''].filter(Boolean)
  const codeClass = codeClasses.length > 0 ? ` class="${codeClasses.join(' ')}"` : ''
  const languageLabel = language || 'text'
  return `<section class="markdown-code-shell${isCompact ? ' is-compact' : ''}" data-language="${languageLabel}"><header class="markdown-code-toolbar"><span>${languageLabel}</span><span class="markdown-code-actions">${toolbarButton('wrap-code', labels.wrap)}${toolbarButton('copy-code', labels.copy)}${toolbarButton('save-code', labels.save)}</span></header><pre class="${blockClass}"><code${codeClass}>${markdown.utils.escapeHtml(content)}</code></pre></section>\n`
}

markdown.renderer.rules.fence = (tokens, index, _options, env) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/u)[0] ?? ''
  return codeBlockHtml(token.content, language, env.labels as MarkdownUiLabels | undefined)
}
markdown.renderer.rules.code_block = (tokens, index, _options, env) => codeBlockHtml(tokens[index].content, '', env.labels as MarkdownUiLabels | undefined)

markdown.renderer.rules.table_open = (_tokens, _index, _options, env) => {
  const labels = (env.labels as MarkdownUiLabels | undefined) ?? DEFAULT_LABELS
  return `<section class="markdown-table-shell" role="region" aria-label="${labels.dataTable}" tabindex="0"><header class="markdown-table-toolbar">${toolbarButton('copy-table', labels.copyCsv)}</header><div class="markdown-table-scroll"><table>\n`
}
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
  const labels = (env.labels as MarkdownUiLabels | undefined) ?? DEFAULT_LABELS
  return `<button type="button" class="markdown-file-link" data-markdown-action="open-file" data-file-path="${path}" data-file-line="${line}" title="${labels.openFile(path)}"><code>${markdown.utils.escapeHtml(value)}</code></button>`
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

export function renderMarkdown(source: string, labels = DEFAULT_LABELS): string {
  return DOMPurify.sanitize(markdown.render(source, { labels }), {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['table'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  })
}
