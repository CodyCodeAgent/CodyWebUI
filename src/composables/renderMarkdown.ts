import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: true,
  typographer: false,
})

markdown.use(taskLists, { enabled: false, label: true, labelAfter: true })

function codeBlockHtml(content: string, language = ''): string {
  const lines = content.replace(/\n$/u, '').split('\n')
  const isCompact = lines.length <= 2 && lines.every((line) => line.length <= 96)
  const blockClass = isCompact ? 'markdown-code-block is-compact' : 'markdown-code-block'
  const codeClasses = [isCompact ? 'is-compact-code' : '', /^[A-Za-z0-9_-]+$/u.test(language) ? `language-${language}` : ''].filter(Boolean)
  const codeClass = codeClasses.length > 0 ? ` class="${codeClasses.join(' ')}"` : ''
  return `<pre class="${blockClass}"><code${codeClass}>${markdown.utils.escapeHtml(content)}</code></pre>\n`
}

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/u)[0] ?? ''
  return codeBlockHtml(token.content, language)
}
markdown.renderer.rules.code_block = (tokens, index) => codeBlockHtml(tokens[index].content)

const defaultLinkOpen = markdown.renderer.rules.link_open
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen ? defaultLinkOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(markdown.render(source), {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['table'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  })
}
