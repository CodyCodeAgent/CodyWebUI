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
- Open a header work log for commands and file changes.
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

Run the built local server:

```bash
npm run build
npm start -- --no-password
```

Build the production frontend and CLI bundle:

```bash
npm run build
```

Run tests:

```bash
npm run verify
```

Useful targeted checks while developing:

```bash
npm test
npm run typecheck
npm test -- src/server/settingsStore.test.ts
npm test -- src/composables/useDesktopState.test.ts
git diff --check
```

`npm run verify` builds the app and runs the default non-token validation
suite: typecheck, unit tests, whitespace checks, packaged CLI smoke, npm package
dry-run smoke, approval center browser smoke, composer input smoke, Settings
theme persistence and visual-health smoke, empty thread lifecycle smoke, and
Work log browser smoke with panel/fullscreen visual-health checks. It also runs
`smoke:turn` in its default skip mode and `smoke:turn-approval` in its default
skip mode to confirm the opt-in live-turn smokes are installed. It does **not**
start a real Codex turn, so it does not intentionally spend model tokens.

Manual smoke checks before publishing or sharing a build:

- Run `npm run build && npm run smoke:cli` to verify the packaged CLI can
  start, serve the app shell, and answer the local meta API.
- Run `npm run smoke:package` after a build to verify `npm pack --dry-run`
  contains the expected `cody-web-ui` package name, CLI bin, built frontend,
  built CLI, README, license, smoke scripts, and no legacy package branding.
- Run `npm run smoke:approval` to browser-test the Approval Center: it enables
  smoke-only bridge hooks, injects a pending command approval, verifies the
  badge/card/actions render, clicks the Session action, and confirms the
  pending request is resolved.
- Run `npm run smoke:composer` to browser-test that the real composer input is
  enabled and the send button activates after typing, without sending to a
  model.
- Run `npm run smoke:theme` to browser-test Settings theme controls against a
  temporary SQLite settings database, clear browser storage, reload, verify the
  theme persisted through the server settings API, and assert the Settings page
  still renders without horizontal overflow, with visible theme/flame cards,
  accessible text contrast, and a populated desktop screenshot.
- Run `npm run smoke:thread` to verify the real app-server thread lifecycle:
  create an empty thread and read it back. Empty app-server threads can be
  readable before they appear in `thread/list` or accept archive cleanup because
  they may not have a materialized rollout yet; CodyWebUI keeps newly created
  threads visible in the UI with an optimistic local row while the first turn is
  starting. Add `--require-listed` or set
  `CODY_WEB_UI_SMOKE_REQUIRE_THREAD_LIST=1` when you specifically want to
  diagnose app-server list materialization.
- Run `npm run smoke:turn` to confirm the opt-in turn smoke is installed. By
  default it skips without starting a model turn.
- Run `npm run smoke:turn-approval` to confirm the opt-in natural approval
  smoke is installed. By default it skips without starting a model turn.
- Run `npm run smoke:worklog` to let CodyWebUI find a recent real Codex thread
  with file changes and browser-test the header Work log badge, panel layout,
  file search, fullscreen diff, split/unified switching, and populated desktop
  screenshots. Use `npm run smoke:worklog -- --thread-id <id>` when you want a
  deterministic thread fixture. Add `--require-diff` or set
  `CODY_WEB_UI_SMOKE_REQUIRE_WORKLOG=1` when this check should fail instead of
  skipping if no real diff thread is available.
- Real `turn/start` message submission is intentionally not part of the default
  smoke suite because it starts an actual Codex turn and can consume model
  tokens. To explicitly verify a live model response end to end, run:

  ```bash
  CODY_WEB_UI_SMOKE_ALLOW_TURN=1 npm run smoke:turn
  ```

  The opt-in smoke connects to `/codex-api/ws` before sending the turn and
  reports realtime lifecycle and live-delta evidence after the response lands.
  It tolerates the short empty-rollout window that can appear immediately after
  `turn/start` before the app-server has written readable thread content.
  You can pass `-- --cwd <path> --message <prompt> --model <model>
  --effort <effort> --timeout-ms <ms> --require-live-delta` to customize that
  opt-in smoke and make live assistant/plan/reasoning delta frames mandatory.
- Natural command approval is also intentionally opt-in because it starts a
  real Codex turn and depends on the model choosing to execute the requested
  command. To diagnose whether a genuine app-server
  `item/commandExecution/requestApproval` reaches the bridge and can be
  resolved, run:

  ```bash
  CODY_WEB_UI_SMOKE_ALLOW_TURN_APPROVAL=1 npm run smoke:turn-approval
  ```

  The smoke asks Codex to run a harmless command, waits for the natural pending
  approval request, responds with `decline`, verifies the pending request is
  cleared, and archives the created thread best-effort. It starts the diagnostic
  turn with `approvalPolicy: "untrusted"` and a read-only sandbox override, but
  the check is still not deterministic: if the model answers without actually
  invoking command execution, no approval request exists for CodyWebUI to render.
  Use `npm run smoke:approval` as the deterministic browser regression for the
  approval UI, bridge pending queue, and response path.
- Start the built server with `npm start -- --no-password`.
- Open a Codex thread that contains file changes and verify the header Work log
  badge matches the changed-file count.
- Open the Work log panel and verify changed files, line counts, diff preview,
  and fullscreen diff still render.
- Open Settings, change skin, density, layout, and accent, then reload and
  verify the selected theme persists.

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
npm run verify
```

## License

[MIT](./LICENSE)
