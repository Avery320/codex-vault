# `@foam/mcp`

Codex Vault 的主要整合層，提供 MCP tools、multi-vault 管理、安全寫入與 Vault
Explorer MCP App。

- `@foam/cli`：filesystem 與 process adapter。
- `@foam/core`：Markdown 與 graph algorithms。
- `@foam/graph-view`：graph rendering。

Read mode 不註冊 mutation tools。Read-write mode 更新既有筆記時，必須先
`preview_resource_update`，再用其 SHA-256 呼叫 `update_resource`。

Explorer 以 `updateModelContext()` 附加多則選取註解，不會送出聊天訊息。

```sh
yarn workspace @foam/mcp build
yarn workspace @foam/mcp test
```
