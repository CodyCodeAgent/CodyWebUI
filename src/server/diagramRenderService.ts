import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const MAX_DIAGRAM_CHARS = 200_000
const FORBIDDEN_PLANTUML_DIRECTIVE = /^\s*!(?:includeurl|include_many|import|pragma)\b/imu
const LOCAL_INCLUDE_DIRECTIVE = /^\s*!include\s+(?!<[A-Za-z0-9_./-]+>)/imu

export function validatePlantUmlSource(source: string): string {
  const normalized = source.trim()
  if (!normalized) throw new Error('PlantUML source is required')
  if (normalized.length > MAX_DIAGRAM_CHARS) throw new Error('PlantUML source is too large')
  if (!/@startuml\b/iu.test(normalized) || !/@enduml\b/iu.test(normalized)) {
    throw new Error('PlantUML source must include @startuml and @enduml')
  }
  if (FORBIDDEN_PLANTUML_DIRECTIVE.test(normalized) || LOCAL_INCLUDE_DIRECTIVE.test(normalized)) {
    throw new Error('PlantUML include/import directives are disabled for workspace safety')
  }
  return normalized
}

async function plantUmlCommand(): Promise<{ command: string; args: string[] }> {
  const jar = process.env.PLANTUML_JAR?.trim() ?? ''
  if (jar) {
    await access(jar)
    return { command: 'java', args: ['-Djava.awt.headless=true', '-jar', jar, '-pipe', '-tsvg', '-nometadata'] }
  }
  try {
    const bundledJar = require.resolve('node-plantuml/vendor/plantuml.jar')
    await access(bundledJar)
    return { command: 'java', args: ['-Djava.awt.headless=true', '-jar', bundledJar, '-pipe', '-tsvg', '-nometadata'] }
  } catch {
    // Fall back to a system installation for lean/custom deployments.
  }
  return { command: 'plantuml', args: ['-pipe', '-tsvg', '-nometadata'] }
}

export async function renderPlantUmlSvg(source: string): Promise<string> {
  const normalized = validatePlantUmlSource(source)
  const invocation = await plantUmlCommand()
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('PlantUML rendering timed out'))
    }, 15_000)
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Local PlantUML is unavailable. Install the plantuml CLI or set PLANTUML_JAR.'))
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const svg = Buffer.concat(stdout).toString('utf8')
      if (code !== 0 || !svg.includes('<svg')) {
        const message = Buffer.concat(stderr).toString('utf8').trim()
        reject(new Error(/unable to locate a java runtime/iu.test(message)
          ? 'Local PlantUML needs a Java runtime. Install Java or configure a system plantuml CLI.'
          : message || 'PlantUML rendering failed'))
        return
      }
      resolve(svg)
    })
    child.stdin.end(normalized)
  })
}
