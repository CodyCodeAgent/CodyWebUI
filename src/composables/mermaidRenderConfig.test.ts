import { describe, expect, it } from 'vitest'
import { mermaidRenderConfig } from './mermaidRenderConfig'

describe('Mermaid render config', () => {
  it('uses native SVG text labels in both themes', () => {
    expect(mermaidRenderConfig(false)).toMatchObject({ theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false } })
    expect(mermaidRenderConfig(true)).toMatchObject({ theme: 'dark', htmlLabels: false, flowchart: { htmlLabels: false } })
  })
})
