# 架構與能力邊界

```text
Codex App
└─ COMET plugin
   └─ MCP server
      ├─ @comet/cli：Node.js 與檔案系統入口
      ├─ @comet/mcp：tools、vault 管理與 MCP App
      ├─ @comet/core：Markdown 與 link graph
      └─ @comet/graph-view：知識圖譜元件
```

Codex host 管理 task、composer、模型與訊息送出；COMET 只提供 vault UI、
MCP tools 與 model-context attachment。

## 註解

Reader 將選取範圍轉成 Markdown 行號，再用 `updateModelContext()` 傳入完整註解
陣列。這只更新 composer context，不會送出訊息。

## 寫入

Read mode 不註冊 mutation tools。Read-write mode 使用 preview + SHA-256 commit
避免覆寫 preview 後已變更的檔案。

## 即時同步

Node watcher 更新 Comet workspace 後，revision feed 會喚醒 Explorer 唯一一個待命中的
app-only MCP request。Explorer 再取得同一個 canonical workspace state，更新檔案樹、
reader、backlinks 與 graph。revision 讓等待建立前發生的事件不會漏接；背景與 teardown
則使用 cancellation 清理待命 request。

## 不支援

- 修改 Codex 私有 UI 或建立固定側邊欄。
- 控制模型、推理強度或自動送出訊息。
- 使用 Codex 私有註解資料模型。
- 在既有 task 熱重載新版插件。

根目錄的 `build`、`test`、`lint` 與 `clean` 執行上圖的 COMET packages。上游來源
不在現行 source tree 或 build graph 中；需要追溯尚未搬移的行為時，請查閱 Git
history 與[來源及授權說明](fork-and-license.md)。

## Markdown renderer 遷移

- 已共用：wikilink alias、source line metadata、表格 pipe 保護、block anchor。
- 保持安全預設：raw HTML 關閉。
- 尚未搬移：note embed。
