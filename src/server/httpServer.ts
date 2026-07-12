import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import express, { type Express } from 'express'
import { attachCodexBridgeWebSocketServer, createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthMiddleware, type AuthMiddleware } from './authMiddleware.js'
import { buildSecurityAccessSnapshot } from './securityAccess.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

export type ServerOptions = {
  password?: string
  host?: string
  port?: number | null
  distDir?: string
}

export type ServerInstance = {
  app: Express
  attachWebSocketServer: (server: HttpServer) => () => void
  dispose: () => void
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const staticDistDir = options.distDir ?? distDir
  const bridge = createCodexBridgeMiddleware()
  const authEnabled = Boolean(options.password)
  let authMiddleware: AuthMiddleware | null = null

  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    next()
  })

  // 1. Auth middleware (if password is set)
  if (options.password) {
    authMiddleware = createAuthMiddleware(options.password)
    app.use(authMiddleware)
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
  app.use(express.static(staticDistDir))

  // 5. SPA fallback
  app.use((_req, res) => {
    res.sendFile(join(staticDistDir, 'index.html'))
  })

  return {
    app,
    attachWebSocketServer: (server) => attachCodexBridgeWebSocketServer(server, {
      authorizeUpgrade: authMiddleware?.authorizeUpgrade,
    }),
    dispose: () => bridge.dispose(),
  }
}
