# App Server Schema Usage Guide

This guide explains how CodyWebUI should consume the local Codex app-server
schemas under `documentation/app-server-schemas`. Treat these schemas as the
source of truth whenever frontend state is translated into app-server RPC
params or app-server events are translated back into UI state.

## Source Of Truth

The materialized schemas live in two equivalent forms:

- `documentation/app-server-schemas/typescript`
- `documentation/app-server-schemas/json`

Prefer the TypeScript files for day-to-day implementation because they are
easier to read with imports and comments. Use the JSON schemas when validating
wire payload shape, required fields, nullable fields, or `$ref` expansion.

Important entry points:

- Client requests: `documentation/app-server-schemas/typescript/ClientRequest.ts`
- Server notifications: `documentation/app-server-schemas/typescript/ServerNotification.ts`
- Server requests: `documentation/app-server-schemas/typescript/ServerRequest.ts`
- Bundled JSON schema: `documentation/app-server-schemas/json/codex_app_server_protocol.schemas.json`
- Method-specific v2 schemas: `documentation/app-server-schemas/typescript/v2`

Generated schema files must not be edited by hand. If a schema looks wrong,
update the materialization process or document the compatibility gap in adapter
code.

## Implementation Rule

Before adding or changing any app-server RPC payload, read the method schema
and every imported type it references.

For example, `turn/start` is not fully described by
`v2/TurnStartParams.ts` alone. If it imports `CollaborationMode`, also read:

- `CollaborationMode.ts`
- `Settings.ts`
- `ModeKind.ts`
- `ReasoningEffort.ts`

Do not infer payload shape from UI labels, old code, screenshots, or a partial
response object. The app-server may ignore malformed optional fields without
making the UI error obvious.

## Request Flow

For a client-to-server method:

1. Find the method in `ClientRequest.ts`.
2. Open its params schema.
3. Follow imported types until primitive fields are visible.
4. Check whether each field is required, optional, nullable, or both.
5. Build a small local adapter type in `src/api` or `src/composables` that
   mirrors the schema exactly at the boundary.
6. Add tests that assert the exact RPC params sent to `callRpc`.

Example:

```ts
// Schema:
// TurnStartParams.collaborationMode?: CollaborationMode | null
// CollaborationMode = { mode: ModeKind, settings: Settings }
// Settings = {
//   model: string
//   reasoning_effort: ReasoningEffort | null
//   developer_instructions: string | null
// }

const collaborationMode = {
  mode: 'default',
  settings: {
    model: 'gpt-5',
    reasoning_effort: 'medium',
    developer_instructions: null,
  },
}
```

The important detail is that `collaborationMode` is optional, but if it is
present, `settings` is required. Sending `{ mode: 'default' }` is not a valid
`CollaborationMode`.

## Response And Notification Flow

For app-server output:

1. Find the response or notification schema.
2. Normalize raw app-server objects into UI domain objects at the API boundary.
3. Keep UI components away from raw app-server quirks.
4. Preserve unknown fields only when they are explicitly needed for forward
   compatibility.
5. Add tests with minimal fixture payloads plus one realistic payload when the
   object is large or nested.

Examples of boundary files in this project:

- `src/api/codexThreadClient.ts`
- `src/api/codexModelClient.ts`
- `src/api/appServerDtos.ts`
- `src/composables/useDesktopState.ts`

If the UI needs a friendlier shape, create a named adapter function rather than
spreading raw schema objects through components.

## Optional Versus Nullable

Read optionality and nullability literally:

- `field?: T` means the field may be omitted.
- `field: T | null` means the field is required, but the value may be `null`.
- `field?: T | null` means the field may be omitted, or present with `null`.

Do not collapse these cases casually. In app-server payloads, omitted and
`null` can have different meanings.

Concrete rule:

- Use `undefined` or omit a field only when the schema marks the field optional.
- Use `null` only when the schema explicitly allows it and the app-server
  comment says what `null` means.
- Do not use `{}` as a placeholder for a nested object unless the nested schema
  allows an empty object.

## Experimental Fields

Some schema comments mark fields or methods as experimental. Experimental still
means schema-bound.

When using an experimental field:

1. Check whether the method is available in the current app-server version.
2. Keep the feature behind a narrow adapter, not scattered UI code.
3. Make fallback behavior explicit.
4. Add a regression test for both enabled and missing/empty responses.
5. Leave a short code comment only if the schema semantics are surprising.

`collaborationMode` is a good example: it is experimental, but its schema is
strict enough that sending a partial object can leave the UI and backend in
different states.

## Collaboration Mode Example

The app-server schema says:

```ts
export type TurnStartParams = {
  threadId: string
  input: Array<UserInput>
  model?: string | null
  effort?: ReasoningEffort | null
  collaborationMode?: CollaborationMode | null
}

export type CollaborationMode = {
  mode: ModeKind
  settings: Settings
}

export type Settings = {
  model: string
  reasoning_effort: ReasoningEffort | null
  developer_instructions: string | null
}
```

For `collaborationMode.settings.developer_instructions`, the schema comment
states that `null` means "use the built-in instructions for the selected mode".

Correct default mode payload:

```ts
{
  mode: 'default',
  settings: {
    model: selectedModel || fallbackModel,
    reasoning_effort: selectedEffort || null,
    developer_instructions: null,
  },
}
```

Correct plan mode payload:

```ts
{
  mode: 'plan',
  settings: {
    model: selectedModel || fallbackModel,
    reasoning_effort: selectedEffort || null,
    developer_instructions: null,
  },
}
```

Incorrect payload:

```ts
{
  mode: 'default',
}
```

That object may look reasonable from the UI point of view, but it is not a
valid `CollaborationMode` because `settings` is required.

## Testing Checklist

For every schema-facing change, add or update tests that prove:

- The exact RPC method name is correct.
- Required fields are present.
- Optional fields are omitted only intentionally.
- Nullable fields use `null` only when the schema allows it.
- Nested objects include their required fields.
- Fallback values are applied before crossing the app-server boundary.
- UI state changes actually affect the next app-server payload.
- The regression case that motivated the change is covered.

Recommended commands:

```bash
npm test -- <changed test files>
git diff --check
npm run build
```

Use targeted tests while iterating, then run the full build before committing
schema-bound behavior.

## Debugging Checklist

When the UI looks right but app-server behavior is wrong:

1. Inspect the actual RPC payload in tests or browser devtools.
2. Compare that payload against the generated schema, not against UI state.
3. Check optional nested objects for missing required children.
4. Check whether `null` has a documented semantic meaning.
5. Check whether the field takes precedence over sibling fields.
6. Add a regression test that would have failed with the bad wire payload.

For example, if the UI says `Default` but the model behaves like `Plan`, inspect
the `turn/start` payload. If it sends `{ mode: 'default' }`, the UI selection
changed but the app-server protocol contract was not satisfied.

## Adapter Design Guidelines

Keep schema coupling in a small number of places:

- API clients should know RPC names and wire payloads.
- Composables may build domain-specific payloads before sending them.
- Components should work with UI options and events, not raw app-server schema
  objects.

Good pattern:

```ts
const payload = buildTurnCollaborationMode(selectedMode, modelId, effort)
await startThreadTurn(threadId, text, images, skills, modelId, effort, payload)
```

Avoid:

```ts
await callRpc('turn/start', {
  threadId,
  input,
  collaborationMode: { mode: selectedModeName },
})
```

The first pattern gives one place to enforce the schema and one place to test
the regression. The second pattern invites partial objects to leak from UI state
into the app-server boundary.

## Review Checklist

When reviewing a PR that touches app-server integration, ask:

- Which generated schema file proves this payload shape?
- Did the code follow all imported schema types?
- Is every present nested object complete?
- Are omitted fields and `null` fields intentional?
- Does the test assert the actual RPC payload?
- Could app-server silently ignore this if malformed?
- Is the UI showing local state while the backend receives a different state?

If any answer is unclear, pause and inspect the schema before approving the
change.

