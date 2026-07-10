# Local Project And Thread Catalog

CodyWebUI treats Codex as the source of truth for thread content and SQLite as
the source of truth for presentation state.

## User Semantics

- Hiding a project only removes it from CodyWebUI's active list.
- Hiding a thread only removes it from CodyWebUI's active list.
- Restoring changes only CodyWebUI presentation state.
- CodyWebUI does not call `thread/archive` or `thread/unarchive` for sidebar
  visibility actions.
- Threads that were already archived in Codex before the first catalog import
  enter CodyWebUI's Hidden view by default.

## Bootstrap And Reconciliation

The same idempotent synchronization handles both an empty database and later
refreshes:

1. Fetch every active and archived `thread/list` page from Codex.
2. Upsert project and thread source metadata into SQLite.
3. Preserve local `hidden`, `display_name`, and `sort_order` values on conflict.
4. Mark rows absent from a complete source scan as missing instead of deleting
   them.

Synchronization runs immediately when the server starts, 750 ms after relevant
Codex thread/turn events, and every 30 seconds as a fallback. Failures back off
to a maximum interval of five minutes. A running synchronization is shared by
all callers and never overlaps itself.

## Storage

The catalog uses `ui_projects` and `ui_threads` in the same SQLite database as
application settings:

```text
~/.cody-web-ui/settings.sqlite3
```

Source metadata may be refreshed by Codex, while presentation columns remain
owned by CodyWebUI.

## HTTP API

- `GET /codex-api/catalog?visibility=visible|hidden`
- `GET /codex-api/catalog/status`
- `POST /codex-api/catalog/sync`
- `POST /codex-api/catalog/projects/visibility`
- `POST /codex-api/catalog/threads/visibility`
- `POST /codex-api/catalog/projects/presentation`
- `POST /codex-api/catalog/projects/order`
