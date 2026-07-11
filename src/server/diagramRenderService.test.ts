import { describe, expect, it } from 'vitest'
import { validatePlantUmlSource } from './diagramRenderService'

describe('validatePlantUmlSource', () => {
  it('accepts self-contained diagrams', () => {
    expect(validatePlantUmlSource('@startuml\nAlice -> Bob\n@enduml')).toContain('Alice -> Bob')
  })

  it('rejects missing boundaries and external includes', () => {
    expect(() => validatePlantUmlSource('Alice -> Bob')).toThrow('@startuml')
    expect(() => validatePlantUmlSource('@startuml\n!includeurl https://example.com/a.puml\n@enduml')).toThrow('disabled')
  })

  it('allows bundled standard-library includes for C4 diagrams', () => {
    expect(validatePlantUmlSource('@startuml\n!include <C4/C4_Container>\n@enduml')).toContain('C4_Container')
  })
})
