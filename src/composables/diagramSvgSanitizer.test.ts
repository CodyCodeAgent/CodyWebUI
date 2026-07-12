// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { sanitizeDiagramSvg } from './diagramSvgSanitizer'

describe('diagram SVG sanitizer', () => {
  it('preserves Mermaid XHTML labels inside foreignObject nodes', () => {
    const result = sanitizeDiagramSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <foreignObject width="120" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">Order service</span></div></foreignObject>
      <text x="10" y="20">SVG label</text>
    </svg>`)

    expect(result).toContain('foreignObject')
    expect(result).toContain('Order service')
    expect(result).toContain('SVG label')
  })

  it('still removes executable content and event handlers', () => {
    const result = sanitizeDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(2)">Safe label</div></foreignObject></svg>')
    expect(result).not.toContain('onclick')
    expect(result).toContain('Safe label')
    expect(sanitizeDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).not.toContain('<script')
  })
})
