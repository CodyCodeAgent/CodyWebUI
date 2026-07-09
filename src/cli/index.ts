import { createServer } from 'node:http'
import { Command } from 'commander'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'
import {
  buildStartupBanner,
  normalizeListenHost,
  parseListenPort,
} from './cliStartup.js'

const program = new Command()
  .name('cody-web-ui')
  .description('Web interface for Codex app-server')
  .option('-p, --port <port>', 'port to listen on', '3000')
  .option('--host <host>', 'host to listen on', '127.0.0.1')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .parse()

const opts = program.opts<{ host: string; port: string; password: string | boolean }>()
let port = 3000
try {
  port = parseListenPort(opts.port)
} catch (error) {
  program.error(error instanceof Error ? error.message : 'Invalid port')
}
const host = normalizeListenHost(opts.host)

let password: string | undefined
if (opts.password === false) {
  password = undefined
} else if (typeof opts.password === 'string') {
  password = opts.password
} else {
  password = generatePassword()
}

const { app, attachWebSocketServer, dispose } = createApp({ password, host, port })
const server = createServer(app)
const disposeWebSocketServer = attachWebSocketServer(server)

server.listen(port, host, () => {
  console.log(buildStartupBanner({ host, port, password }))
})

function shutdown() {
  console.log('\nShutting down...')
  server.close(() => {
    disposeWebSocketServer()
    dispose()
    process.exit(0)
  })
  // Force exit after timeout
  setTimeout(() => {
    disposeWebSocketServer()
    dispose()
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
