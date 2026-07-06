import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express, { type Express } from 'express'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthMiddleware } from './authMiddleware.js'
import { buildSecurityAccessSnapshot } from './securityAccess.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

export type ServerOptions = {
  password?: string
  host?: string
  port?: number | null
}

export type ServerInstance = {
  app: Express
  dispose: () => void
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware()
  const authEnabled = Boolean(options.password)

  // 1. Auth middleware (if password is set)
  if (options.password) {
    app.use(createAuthMiddleware(options.password))
  }

  // 2. Security access status
  app.get('/codex-api/meta/access-security', (req, res) => {
    res.json({
      result: buildSecurityAccessSnapshot(req, {
        authEnabled,
        listenHost: options.host,
        listenPort: options.port ?? null,
      }),
    })
  })

  // 3. Bridge middleware for /codex-api/*
  app.use(bridge)

  // 4. Static files from Vue build
  app.use(express.static(distDir))

  // 5. SPA fallback
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })

  return {
    app,
    dispose: () => bridge.dispose(),
  }
}
