# CodyWebUI

CodyWebUI is a local-first web control surface for AI coding agents.

Today it supports **Codex only**. It runs a Node.js web server, starts and
bridges to the local Codex `app-server`, and gives you a browser-based
workspace for starting threads, supervising tool calls, reviewing diffs,
approving risky operations, and tracking local agent activity.

The project name is CodyWebUI. The npm package and CLI command are
`cody-web-ui`.

The project is early but already aims at a larger shape: a practical,
auditable, browser-accessible engineering console for coding agents.

## Status

- Runtime support: Codex only.
- UI: browser-based desktop-style workspace.
- Storage: local SQLite via `better-sqlite3`.
- Network model: local web server with WebSocket updates.
- Maturity: active development; APIs and UI details may change.

Future versions may support additional agent runtimes, but this repository
currently assumes Codex semantics, Codex threads, and the Codex app-server
protocol.

## Features

- Browse Codex threads grouped by workspace.
- Create, resume, archive, and inspect Codex threads.
- Stream assistant output, tool activity, approvals, and thread updates.
- Send text and local image inputs.
- Switch model, reasoning effort, and Codex collaboration mode.
- Review command and file-change approval requests.
- Inspect changed files and diff previews.
- Track a floating work log for commands and file changes.
- Persist app preferences in local SQLite.
- View account rate limits and token usage.
- Use a configurable token flame widget for daily usage intensity.
- Protect remote browser access with a password by default.

## Requirements

- Node.js 18 or newer.
- npm.
- Codex CLI installed and available in `PATH`.

CodyWebUI uses the npm package `better-sqlite3` for local settings. On common
platforms npm installs a prebuilt native binary. On less common platforms, npm
may need a working native build toolchain.

## Quick Start

Run directly:

```bash
npx cody-web-ui
```

Or install globally:

```bash
npm install -g cody-web-ui
cody-web-ui
```

By default the server listens on `127.0.0.1:3000` and prints a generated
password. Open the printed URL in a browser and sign in with that password.

## CLI Usage

```text
Usage: cody-web-ui [options]

Web interface for Codex app-server

Options:
  -p, --port <port>    port to listen on (default: "3000")
  --host <host>        host to listen on (default: "127.0.0.1")
  --password <pass>    set a specific password
  --no-password        disable password protection
  -h, --help           display help for command
```

Examples:

```bash
cody-web-ui
cody-web-ui --port 8080
cody-web-ui --host 0.0.0.0 --password my-secret
cody-web-ui --no-password
```

Use `--host 0.0.0.0` only on trusted networks or behind your own HTTPS,
authentication, and firewall controls. Browser access to CodyWebUI can expose
local code, commands, credentials, and Codex capabilities.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Build the production frontend and CLI bundle:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Useful targeted checks while developing:

```bash
npm test -- src/server/settingsStore.test.ts
npm test -- src/composables/useDesktopState.test.ts
git diff --check
```

## Architecture

CodyWebUI has three main layers:

- **Frontend**: Vue, Vite, and TypeScript. The UI lives under `src/components`
  and `src/composables`.
- **Local web server**: Node.js and Express. The server lives under
  `src/server` and handles static assets, authentication, WebSocket updates,
  file/image helpers, local settings, and the Codex bridge.
- **Codex bridge**: a Node-side bridge that starts `codex app-server`, proxies
  JSON-RPC requests, and normalizes app-server notifications for the UI.

Local settings are stored in:

```text
~/.cody-web-ui/settings.sqlite3
```

You can override that path with:

```bash
CODY_WEB_UI_SETTINGS_DB=/path/to/settings.sqlite3 cody-web-ui
```

## Documentation

- [Final product vision](docs/FINAL_PRODUCT_VISION.md)
- [Codex app-server protocol notes](documentation/APP_SERVER_DOCUMENTATION.md)
- [App-server schema usage guide](documentation/APP_SERVER_SCHEMA_USAGE.md)

The generated app-server schemas live under:

```text
documentation/app-server-schemas/
```

Do not edit generated schema files by hand.

## Current Limitations

- Only Codex is supported.
- The app-server protocol is still evolving, so some integrations may require
  schema updates.
- The UI is optimized for trusted local or private-network use, not public
  internet exposure.
- Some features depend on Codex app-server capabilities that may differ across
  Codex versions.

## Contributing

Contributions are welcome. For protocol-facing work, read
[APP_SERVER_SCHEMA_USAGE.md](documentation/APP_SERVER_SCHEMA_USAGE.md) before
changing request or notification payloads.

Please keep changes focused, add tests for behavior that crosses the app-server
boundary, and run:

```bash
npm test
npm run build
```

## License

[MIT](./LICENSE)
