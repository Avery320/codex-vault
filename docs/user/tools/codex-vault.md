# Codex Vault plugin

Codex Vault packages Foam's Markdown workspace, graph, and MCP server as a
local Codex plugin. The initial development profile is deliberately read-only.

## Development vault

The launcher selects a vault in this order:

1. `CODEX_VAULT_PATH`, when set to an absolute directory.
2. The first line of `~/.config/codex-vault/vault-path` (or the file selected by
   `CODEX_VAULT_CONFIG_PATH`).
3. `fixtures/demo-vault` as a safe development fallback.

The config file keeps a personal vault path outside the plugin repository and
continues to work when Codex installs a new cached copy of the plugin.

## Safe write mode

The server remains read-only unless `CODEX_VAULT_ALLOW_WRITES=true` is set or
`~/.config/codex-vault/allow-writes` contains `true`. In write mode, note-body
updates use an optimistic-concurrency workflow:

1. Call `preview_resource_update` to review the unified Markdown diff.
2. Pass its `expected_content_sha256` to `update_resource`.
3. If the note changed after preview, the update fails with `conflict` instead
   of overwriting the newer content.

New notes fail when their destination already exists. Pass an explicit `path`
ending in `.md` when creating notes with CJK filenames.

## Build and validate

```sh
yarn install
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

Plugin schema validation is performed with the bundled Codex Plugin Creator
validator during the packaging step.
