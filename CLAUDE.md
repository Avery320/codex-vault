# Codex Vault context

Codex Vault 是 Obsidian-compatible Markdown vault 的本機 Codex plugin。現行介面位於
`packages/foam-mcp/ui`，不是 `foam-vscode`。

- `foam-mcp`：MCP tools、vault、安全寫入與 Explorer。
- `foam-core`：host-neutral Markdown 與 graph。
- `foam-graph`：graph component。
- `foam-cli`：Node.js／stdio adapter。
- `foam-vscode`：legacy；不要加入新功能。

核心規則：寫入預設關閉；更新需 preview + SHA-256；selection 只呼叫
`updateModelContext()`，不送出訊息；插件更新後使用新 task。

```sh
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

詳見 `README.md`、`docs/architecture.md` 與 `docs/development.md`。保留 Foam、
Microsoft-derived source 與第三方授權，見 `NOTICE.md`。
