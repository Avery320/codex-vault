# Codex Vault plugin

Codex Vault packages Foam's Markdown workspace, graph, and MCP server as a
local Codex plugin.

## Vault management

Codex Vault remembers multiple folders in
`~/.config/codex-vault/vaults.json`. Each entry has a stable ID, display name,
canonical filesystem path, and last-opened timestamp. The registry also keeps
an optional Codex-project-to-vault mapping.

On first launch the plugin imports existing entries from Obsidian's local vault
registry without modifying it. It also migrates the previous
`~/.config/codex-vault/vault-path` setting once. There is no demo-vault
fallback.

Available operations:

- `list_vaults`: list remembered vaults and the active selection.
- `register_vault`: remember and open an existing folder.
- `create_vault`: create a folder with `.obsidian`, remember it, and open it.
- `select_vault`: switch without restarting the MCP server.
- `forget_vault`: forget a registry entry after confirmation; never delete the
  folder or notes.

`show_vault_explorer` accepts `project_path`. A registered project mapping wins;
otherwise the most specific containing vault is selected. If the project is
inside an unregistered folder containing `.obsidian`, that vault is remembered
automatically.

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
