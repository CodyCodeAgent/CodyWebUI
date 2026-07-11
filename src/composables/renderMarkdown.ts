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
