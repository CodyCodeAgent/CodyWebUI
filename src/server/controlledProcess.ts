import { spawn } from 'node:child_process'

export type ControlledProcessOptions = {
  command: string
  args: string[]
  cwd: string
  input?: string
  timeoutMs?: number
  maxOutputBytes?: number
  signal?: AbortSignal
}

export type ControlledProcessResult = {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

const MAX_CONCURRENT_PROCESSES = 4
let activeProcesses = 0
const waiters: Array<() => void> = []

async function acquire(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) throw signal.reason
  if (activeProcesses < MAX_CONCURRENT_PROCESSES) {
    activeProcesses += 1
    return release
  }
  await new Promise<void>((resolve, reject) => {
    const waiter = () => {
      signal?.removeEventListener('abort', onAbort)
      activeProcesses += 1
      resolve()
    }
    const onAbort = () => {
      const index = waiters.indexOf(waiter)
      if (index >= 0) waiters.splice(index, 1)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    waiters.push(waiter)
  })
  return release
}

function release(): void {
  activeProcesses = Math.max(0, activeProcesses - 1)
  const next = waiters.shift()
  next?.()
}

export async function runControlledProcess(options: ControlledProcessOptions): Promise<ControlledProcessResult> {
  const releaseSlot = await acquire(options.signal)
  const startedAt = Date.now()
  const timeoutMs = Math.max(250, options.timeoutMs ?? 15_000)
  const maxOutputBytes = Math.max(1_024, options.maxOutputBytes ?? 2 * 1024 * 1024)
  const hasInput = typeof options.input === 'string' && options.input.length > 0

  try {
    return await new Promise<ControlledProcessResult>((resolve, reject) => {
      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        stdio: [hasInput ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let outputBytes = 0
      let settled = false
      let terminationTimer: ReturnType<typeof setTimeout> | null = null
      let terminationError: Error | null = null

      const finish = (error?: Error, exitCode = 0) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        if (terminationTimer) clearTimeout(terminationTimer)
        options.signal?.removeEventListener('abort', onAbort)
        const result = {
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode,
          durationMs: Math.max(0, Date.now() - startedAt),
        }
        if (error) reject(error)
        else if (exitCode !== 0) reject(new Error(result.stderr.trim() || `${options.command} exited with code ${String(exitCode)}`))
        else resolve(result)
      }

      const terminate = (error: Error) => {
        if (settled || terminationError) return
        terminationError = error
        child.kill('SIGTERM')
        terminationTimer = setTimeout(() => child.kill('SIGKILL'), 1_000)
        terminationTimer.unref?.()
      }

      const collect = (target: Buffer[], chunk: Buffer) => {
        outputBytes += chunk.length
        if (outputBytes > maxOutputBytes) {
          terminate(new Error(`${options.command} exceeded the ${String(maxOutputBytes)} byte output limit`))
          return
        }
        target.push(chunk)
      }

      const onAbort = () => terminate(options.signal?.reason instanceof Error
        ? options.signal.reason
        : new Error(`${options.command} aborted`))
      const timeoutTimer = setTimeout(() => terminate(new Error(`${options.command} timed out after ${String(timeoutMs)}ms`)), timeoutMs)
      timeoutTimer.unref?.()
      options.signal?.addEventListener('abort', onAbort, { once: true })
      child.stdout?.on('data', (chunk: Buffer) => collect(stdout, chunk))
      child.stderr?.on('data', (chunk: Buffer) => collect(stderr, chunk))
      child.once('error', (error) => finish(error))
      child.once('close', (code) => finish(terminationError ?? undefined, code ?? -1))
      if (hasInput && child.stdin) {
        child.stdin.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') return
          terminate(error)
        })
        child.stdin.end(options.input)
      }
    })
  } finally {
    releaseSlot()
  }
}
