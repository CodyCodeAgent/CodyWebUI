import { describe, expect, it } from 'vitest'
import { runControlledProcess } from './controlledProcess'

describe('controlled process executor', () => {
  it('captures bounded output and stdin', async () => {
    const result = await runControlledProcess({
      command: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      cwd: process.cwd(),
      input: 'hello',
      timeoutMs: 2_000,
    })
    expect(result).toMatchObject({ stdout: 'hello', stderr: '', exitCode: 0 })
  })

  it('does not crash when a child closes stdin before a large input is written', async () => {
    const result = await runControlledProcess({
      command: process.execPath,
      args: ['-e', 'process.stdin.destroy(); setTimeout(() => process.exit(0), 25)'],
      cwd: process.cwd(),
      input: 'x'.repeat(8 * 1024 * 1024),
      timeoutMs: 2_000,
    })
    expect(result.exitCode).toBe(0)
  })

  it('runs commands without creating a writable stdin pipe when input is absent', async () => {
    const result = await runControlledProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("ready")'],
      cwd: process.cwd(),
      timeoutMs: 2_000,
    })
    expect(result).toMatchObject({ stdout: 'ready', stderr: '', exitCode: 0 })
  })

  it('terminates commands that exceed their deadline', async () => {
    await expect(runControlledProcess({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 10_000)'],
      cwd: process.cwd(),
      timeoutMs: 250,
    })).rejects.toThrow('timed out')
  })

  it('terminates commands that exceed their output budget', async () => {
    await expect(runControlledProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(4096))'],
      cwd: process.cwd(),
      maxOutputBytes: 1024,
    })).rejects.toThrow('output limit')
  })
})
