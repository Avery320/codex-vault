# 架構與能力邊界

```text
Codex App
└─ Codex Vault plugin
   └─ MCP server
      ├─ @foam/cli：Node.js 與檔案系統入口
      ├─ @foam/mcp：tools、vault 管理與 MCP App
      ├─ @foam/core：Markdown 與 link graph
      └─ @foam/graph-view：知識圖譜元件
```

Codex host 管理 task、composer、模型與訊息送出；Codex Vault 只提供 vault UI、
MCP tools 與 model-context attachment。

## 註解

Reader 將選取範圍轉成 Markdown 行號，再用 `updateModelContext()` 傳入完整註解
陣列。這只更新 composer context，不會送出訊息。

## 寫入

Read mode 不註冊 mutation tools。Read-write mode 使用 preview + SHA-256 commit
避免覆寫 preview 後已變更的檔案。

## 不支援

- 修改 Codex 私有 UI 或建立固定側邊欄。
- 控制模型、推理強度或自動送出訊息。
- 使用 Codex 私有註解資料模型。
- 在既有 task 熱重載新版插件。

`packages/foam-vscode` 是待移除的 legacy package；`@foam/*` 名稱暫時保留以避免
不完整的跨套件改名。
