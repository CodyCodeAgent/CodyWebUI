declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const footnote: (markdown: MarkdownIt) => void
  export default footnote
}
