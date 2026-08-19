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

## Build and validate

```sh
yarn install
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

Plugin schema validation is performed with the bundled Codex Plugin Creator
validator during the packaging step.
