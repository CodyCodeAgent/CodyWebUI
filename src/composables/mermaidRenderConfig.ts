import type { MermaidConfig } from 'mermaid'

export function mermaidRenderConfig(isDark: boolean): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark ? 'dark' : 'default',
    // Native SVG <text> survives sanitization, fullscreen, export, and theme
    // boundaries more reliably than XHTML labels inside <foreignObject>.
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: false },
  }
}
