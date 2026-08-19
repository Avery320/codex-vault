# Codex Vault plugin

Codex Vault packages Foam's Markdown workspace, graph, and MCP server as a
local Codex plugin. The initial development profile is deliberately read-only.

## Development vault

Without configuration, the MCP launcher opens `fixtures/demo-vault`. To point a
development session at another vault, set `CODEX_VAULT_PATH` to an absolute
directory before starting Codex.

## Build and validate

```sh
yarn install
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

Plugin schema validation is performed with the bundled Codex Plugin Creator
validator during the packaging step.
