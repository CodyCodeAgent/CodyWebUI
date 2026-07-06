import { createServer } from 'node:http'
import { Command } from 'commander'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'

const program = new Command()
  .name('codex-web-local')
  .description('Web interface for Codex app-server')
  .option('-p, --port <port>', 'port to listen on', '3000')
  .option('--host <host>', 'host to listen on', '127.0.0.1')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .parse()

const opts = program.opts<{ host: string; port: string; password: string | boolean }>()
const port = parseInt(opts.port, 10)
const host = opts.host.trim() || '127.0.0.1'

let password: string | undefined
if (opts.password === false) {
  password = undefined
} else if (typeof opts.password === 'string') {
  password = opts.password
} else {
  password = generatePassword()
}

const { app, dispose } = createApp({ password, host, port })
const server = createServer(app)

server.listen(port, host, () => {
  const lines = [
    '',
    'Codex Web Local is running!',
    '',
    `  Local:    http://${host === '127.0.0.1' ? '127.0.0.1' : host}:${String(port)}`,
  ]

  if (password) {
    lines.push(`  Password: ${password}`)
  } else {
    lines.push('  Password: disabled')
  }

  if (host === '0.0.0.0' || host === '::' || host === '*') {
    lines.push('  Warning: listening on all interfaces. Use HTTPS and a strong password for remote access.')
  } else if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    lines.push('  Warning: listening on a non-loopback host. Review firewall, HTTPS, and authentication settings.')
  }

  lines.push('')
  console.log(lines.join('\n'))
})

function shutdown() {
  console.log('\nShutting down...')
  server.close(() => {
    dispose()
    process.exit(0)
  })
  // Force exit after timeout
  setTimeout(() => {
    dispose()
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
