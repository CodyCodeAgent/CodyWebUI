import DOMPurify from 'dompurify'

export function sanitizeDiagramSvg(svg: string): string {
  const sanitized = DOMPurify.sanitize(svg, {
    // Mermaid renders flowchart labels as XHTML inside SVG foreignObject nodes.
    // The SVG-only profile removes those labels while leaving the shapes intact.
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    ADD_ATTR: ['xmlns'],
  })
  const wrapped = sanitized.trimStart().startsWith('<svg')
    ? sanitized
    : `<svg xmlns="http://www.w3.org/2000/svg">${sanitized}</svg>`
  const documentNode = new DOMParser().parseFromString(wrapped, 'image/svg+xml')
  if (documentNode.querySelector('parsererror')) return ''
  for (const element of documentNode.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name)
    }
  }
  documentNode.querySelectorAll('script').forEach((script) => script.remove())
  return new XMLSerializer().serializeToString(documentNode.documentElement)
}
