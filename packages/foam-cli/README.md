# `@foam/cli`

Codex Vault 的 Node.js、filesystem 與 stdio MCP 入口。名稱沿用自 Foam，並非使用者
介面。Codex 透過 `scripts/launch_codex_vault_mcp` 啟動它。

```sh
yarn workspace @foam/cli build
./scripts/launch_codex_vault_mcp
```

直接啟動只提供 stdio protocol，不會顯示 Codex UI。新功能應優先放在
`@foam/mcp`，CLI 只保留薄型 runtime adapter。
