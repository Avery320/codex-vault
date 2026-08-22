# `@comet/mcp`

COMET 的主要整合層，提供 MCP tools、multi-vault 管理、安全寫入與 Vault
Explorer MCP App。

- `@comet/cli`：filesystem 與 process adapter。
- `@comet/core`：Markdown 與 graph algorithms。
- `@comet/graph-view`：graph rendering。

Read mode 不註冊 mutation tools。Read-write mode 更新既有筆記時，必須先
`preview_resource_update`，再用其 SHA-256 呼叫 `update_resource`。

Explorer 以 `updateModelContext()` 附加多則選取註解，不會送出聊天訊息。
可見的 Explorer 會以 workspace 事件喚醒一個長等待 MCP request，再同步檔案樹、
reader、backlinks 與 graph；不使用固定頻率重新掃描 vault。

```sh
yarn workspace @comet/mcp build
yarn workspace @comet/mcp test
```
