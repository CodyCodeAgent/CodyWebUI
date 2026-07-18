# Feishu capability audit: botmux → CodyWebUI

This is an architectural comparison, not a promise of byte-for-byte source
copying. botmux is a broad multi-agent/CLI product; CodyWebUI is a Web and
`app-server` control plane for Codex. The useful goal is to retain mature
Feishu interaction and reliability behaviour while preserving one authoritative
Codex thread.

## Decision rule

Port or adapt a botmux capability when it improves Feishu conversation safety,
durability, user experience, or operational visibility for CodyWebUI's Codex
threads. Do not import a parallel execution/runtime layer that would create a
second owner of a Session.

## Capability matrix

| botmux capability | CodyWebUI decision | Current CodyWebUI state |
| --- | --- | --- |
| One-scan Open Platform app creation | Adapt | Implemented with the official SDK `registerApp` device flow as the default: Feishu/Lark confirms account, tenant and exact addons; CodyWebUI persists credentials, configures via public Open APIs, and readbacks scopes, WebSocket event/callbacks, bot ability, published version, visibility and bot identity before enablement. Exact-App-ID adoption uses the SDK `appId` update flow and cannot create a replacement. Private Web-session discovery and manual credentials remain recovery fallbacks. |
| Long connection, reconnect, bot identity | Adapt | Implemented through the Feishu SDK transport and per-bot runtime state. |
| Direct/group/topic routing and mention handling | Adapt | Implemented; topic lookup fails closed, and both `open_id` and `app_id` bot mentions are distinguished from mentions of other users/apps. `always`/`topic`/`bound` group trigger modes are per bot. |
| Stable event dedupe and queued input | Adapt | Implemented in SQLite with claimed inbound events, durable pending selections, and FIFO turns. |
| Feishu message `uuid` idempotency | Adapt | Implemented on durable sends/replies/cards; retries reuse the same provider uuid. |
| Retry/backoff, withdrawn-source fallback, dead-lettering | Adapt | Implemented; temporary errors retry, known permanent failures dead-letter, reply-source failure may fall back to chat delivery. |
| Fast card callback acknowledgement | Adapt | Implemented for slow session-selection and request actions; completion patches the card asynchronously. |
| Card interaction authorization | Adapt | Implemented using verified callback operator plus persisted binding/request ownership; action value identity is untrusted. |
| Streaming/terminal cards | Adapt | Implemented with durable card versions and terminal freeze. |
| Existing Session/new Session picker | Adapt | Implemented against the CodyWebUI visible project catalog and `thread/start`; the opening prompt and creation intent remain durable until a turn is prepared, including restart recovery. |
| Approval and request-user-input cards | Adapt | Implemented through CodyWebUI's existing app-server server-request response path; group prompts are private when supported. |
| Rich message parser | Adapt | Implemented for text/post/card/file/media/audio/image/sticker, mentions and quote hints. |
| Attachment download and local handoff | Adapt | Implemented for supported resource types with streaming, 100 MB cap, private storage, retention, and failure notes. |
| `im.message.get` card/quote/merge-forward completion | Adapt | Implemented in the live long-connection path with bounded depth and event-body fallback when REST is unavailable. |
| Settings/admin status and audit | Adapt | Implemented as authenticated CodyWebUI management UI/API with setup history, bindings, redacted passive diagnostics, retry/dead-letter evidence, and an active six-check connectivity probe. Local-only deletion and remote bot disable are explicit separate choices. |
| Botmux CLI worker / PTY / tmux / zellij lifecycle | Intentionally not migrated | CodyWebUI delegates execution to its existing Codex `app-server`; another process owner would split Session truth. |
| Botmux web terminal/transcript copying | Intentionally not migrated | CodyWebUI already has a Web UI and the authoritative Codex thread. |
| Multi-backend agent runners (Claude/Cursor/etc.) | Intentionally not migrated | CodyWebUI currently supports Codex only. |
| Voice, meetings, docs subscriptions, federation/team boards | Intentionally not migrated | Product scope is Feishu IM as a shared Codex client; these are separate products/features. |
| Tunnel/webhook bridge infrastructure | Intentionally not migrated | Long connection removes the public callback endpoint need for this integration. |

## API limits that shape the design

| Constraint | CodyWebUI treatment |
| --- | --- |
| Long connection needs a live client but no public callback URL/token/encrypt key | The CodyWebUI service owns a reconnecting SDK connection for each enabled bot. |
| Card callbacks have a short response deadline | Action handling acknowledges quickly and performs catalog/thread/request work in background, then patches the original card. |
| Feishu resource download is limited to 100 MB by this integration | Resources are streamed to disk with a hard cap; no in-memory buffering. |
| The resource endpoint cannot retrieve stickers, card-embedded resources (`234043`), or merge-forward child resources | Preserve text and append an explicit failure note; never pretend the asset reached Codex. |
| Interactive cards may have different event and REST representations | The inbound resolver unions bounded REST views and falls back visibly to the event body if unavailable. |
| A remote send may succeed just before local process failure | Persisted Feishu `uuid` plus SQLite outbox identity makes retry idempotent at the provider boundary. |

## Reflection checkpoints

The first pass established the shared-thread model. The second added durable
inbox/outbox/card/turn state, local storage protections, multi-bot routing,
commands, and management diagnostics. The third pass compared botmux's
production failure patterns: callback deadline, untrusted card values, remote
send idempotency, topic routing ambiguity, Web/Feishu contention, terminal
card ordering, and retention. Those findings directly define the current
implementation and the real-tenant acceptance gate.

The final stability pass closed the remaining crash and fidelity gaps: bot
mentions delivered as `app_id`, restart-safe project/Session selection,
recovery of an already-created Session without creating a duplicate, SQLite-
leased mutual exclusion across competing Session card options, rich
quoted cards/merge-forwards, explicit dead-letter observability, and accurate
status when the same Session is busy from the Web UI.

A subsequent onboarding pass closed the setup gap found during hands-on use:
the management UI no longer assumes that a person has already created and
configured an Open Platform application. The first implementation ported
botmux's private Web-session workflow. A later reflection replaced that as the
default with Feishu's official SDK device flow, kept the private path only for
recovery, added public configuration readback, separated organization
availability from group-chat allowlists, and propagated the Feishu/Lark brand
into both REST and long-connection clients. Credentials remain write-only and a
partial post-creation failure resumes against the same App ID instead of
creating another app.

The next change should not bypass this boundary. Any new Feishu capability
must either use the same `app-server` thread and server-request paths, or be
explicitly designed as a separate product with its own ownership model.

Source-level adaptations from botmux retain its MIT attribution in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and in the adapted source
header. The audit matrix describes product/architecture decisions; it is not a
replacement for that license notice.
