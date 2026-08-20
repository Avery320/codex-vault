# Contributing

請先閱讀 [README](README.md)、[架構](docs/architecture.md)與
[開發指南](docs/development.md)。新功能應實作在 Codex plugin／MCP App 邊界，
不要重新加入 VS Code extension host 或複製 Codex 私有 UI。

```sh
yarn install
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

提交時請：

- 說明可觀察結果與能力邊界。
- 為 MCP contract、selection、graph 或寫入流程補測試。
- 更新現行文件，不要恢復舊 Foam 文件站。
- 保留上游 copyright、source headers 與第三方授權。
- 不要提交私人 vault、registry、tokens 或 plugin cache。

`@foam/*` 名稱需一次完成跨套件遷移，不要增加局部 aliases。
