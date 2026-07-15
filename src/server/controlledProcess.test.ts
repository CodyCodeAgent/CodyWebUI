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
