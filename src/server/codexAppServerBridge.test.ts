import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import {
  attachCodexBridgeWebSocketServer,
  CODEX_APP_SERVER_ARGS,
  createAutomaticTurnCheckpoint,
  mergeMcpServerDiagnostics,
  normalizeApprovalDecisionScope,
  normalizeMcpServerInventory,
  readApprovalDecisionFromReply,
} from './codexAppServerBridge'
import { listToolingCheckpoints } from './toolingService'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

describe('app-server launch contract', () => {
  it('uses stdio transport explicitly for JSON-RPC bridge traffic', () => {
    expect(CODEX_APP_SERVER_ARGS).toEqual(['app-server', '--listen', 'stdio://'])
  })
})

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return result.stdout
}

async function createRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cody-web-ui-bridge-'))
  tempDirs.push(dir)
  await git(dir, ['init'])
  await git(dir, ['config', 'user.email', 'cody-web-ui@example.test'])
  await git(dir, ['config', 'user.name', 'CodyWebUI'])
  await writeFile(join(dir, 'example.txt'), 'one\n', 'utf8')
  await git(dir, ['add', 'example.txt'])
  await git(dir, ['commit', '-m', 'initial'])
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })))
})

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind test server to a TCP port'))
        return
      }
      resolve(address.port)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function readFirstWebSocketMessage(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('Timed out waiting for websocket message'))
    }, 3000)

    socket.once('message', (data) => {
      clearTimeout(timeout)
      socket.close()
      try {
        resolve(JSON.parse(String(data)))
      } catch (error) {
        reject(error)
      }
    })
    socket.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

describe('bridge websocket server', () => {
  it('accepts websocket upgrades and sends a ready frame', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(404)
      res.end()
    })
    const disposeWebSocketServer = attachCodexBridgeWebSocketServer(server)

    try {
      const port = await listen(server)
      await expect(readFirstWebSocketMessage(`ws://127.0.0.1:${String(port)}/codex-api/ws`)).resolves.toMatchObject({
        type: 'ready',
      })
    } finally {
      disposeWebSocketServer()
      await closeServer(server)
    }
  })
})

describe('MCP diagnostics helpers', () => {
  it('normalizes mcpServerStatus/list responses into safe inventory summaries', () => {
    const rows = normalizeMcpServerInventory({
      data: [
        {
          name: 'github',
          authStatus: 'oAuth',
          serverInfo: {
            title: 'GitHub',
            version: '1.2.3',
            websiteUrl: 'https://github.com',
          },
          tools: {
            listIssues: {},
            createPullRequest: {},
          },
          resources: [{ name: 'repo', uri: 'repo://current' }],
          resourceTemplates: [{ name: 'issue', uriTemplate: 'issue://{id}' }],
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'github',
      status: 'unknown',
      authStatus: 'oAuth',
      title: 'GitHub',
      version: '1.2.3',
      websiteUrl: 'https://github.com',
      toolCount: 2,
      resourceCount: 1,
      resourceTemplateCount: 1,
      error: '',
      threadId: '',
    })
  })

  it('merges startup failures with inventory metadata without losing failure evidence', () => {
    const startup = normalizeMcpServerInventory({
      data: [
        {
          name: 'github',
          authStatus: 'oAuth',
          serverInfo: { title: 'GitHub', version: '1.0.0' },
          tools: {},
          resources: [],
          resourceTemplates: [],
        },
      ],
    }).map((row) => ({
      ...row,
      status: 'failed' as const,
      error: 'token expired',
      threadId: 'thread-1',
      updatedAtIso: '2026-07-05T10:00:00.000Z',
    }))

    const inventory = normalizeMcpServerInventory({
      data: [
        {
          name: 'github',
          authStatus: 'notLoggedIn',
          serverInfo: { title: 'GitHub MCP', version: '2.0.0' },
          tools: { read: {}, write: {} },
          resources: [],
          resourceTemplates: [],
        },
      ],
    })

    expect(mergeMcpServerDiagnostics(startup, inventory)).toEqual([
      expect.objectContaining({
        name: 'github',
        status: 'failed',
        authStatus: 'notLoggedIn',
        title: 'GitHub MCP',
        version: '2.0.0',
        toolCount: 2,
        error: 'token expired',
        threadId: 'thread-1',
        updatedAtIso: '2026-07-05T10:00:00.000Z',
      }),
    ])
  })
})

describe('approval audit helpers', () => {
  it('normalizes explicit and legacy approval scopes', () => {
    expect(normalizeApprovalDecisionScope('workspace')).toBe('workspace')
    expect(normalizeApprovalDecisionScope('permanent')).toBe('permanent')
    expect(normalizeApprovalDecisionScope(undefined, 'acceptForSession')).toBe('session')
    expect(normalizeApprovalDecisionScope(undefined, 'accept')).toBe('single')
    expect(normalizeApprovalDecisionScope('unknown', 'acceptForSession')).toBe('session')
  })

  it('reads approval decisions from server request replies', () => {
    expect(readApprovalDecisionFromReply({ result: { decision: 'acceptForSession' } })).toBe('acceptForSession')
    expect(readApprovalDecisionFromReply({ result: {} })).toBe('responded')
    expect(readApprovalDecisionFromReply({ error: { code: -32000, message: 'nope' } })).toBe('rejected')
  })
})

describe('automatic turn checkpoints', () => {
  it('creates before and after checkpoints for turn lifecycle notifications', async () => {
    const repo = await createRepo()
    await writeFile(join(repo, 'example.txt'), 'two\n', 'utf8')

    const before = await createAutomaticTurnCheckpoint(repo, {
      method: 'turn/started',
      params: {
        turn: {
          id: 'turn-123456789',
          threadId: 'thread-abcdef',
        },
      },
    })
    const after = await createAutomaticTurnCheckpoint(repo, {
      method: 'turn/completed',
      params: {
        turn: {
          id: 'turn-123456789',
          threadId: 'thread-abcdef',
        },
      },
    })
    const ignored = await createAutomaticTurnCheckpoint(repo, {
      method: 'item/completed',
      params: {},
    })

    expect(before).toMatchObject({
      beforeCheckpointHasPatch: true,
    })
    expect(typeof before.beforeCheckpointId).toBe('string')
    expect(after).toMatchObject({
      afterCheckpointHasPatch: true,
    })
    expect(typeof after.afterCheckpointId).toBe('string')
    expect(ignored).toEqual({})

    const checkpoints = await listToolingCheckpoints({ cwd: repo, limit: 10 })
    expect(checkpoints).toHaveLength(2)
    expect(checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'After turn turn-123 (thread-a)',
      'Before turn turn-123 (thread-a)',
    ])
  })
})
