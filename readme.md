# Codex Vault

Codex Vault 是 Codex 桌面 App 的本機插件，可閱讀 Obsidian 相容的 Markdown
vault、搜尋筆記、查看 backlinks 與知識圖譜，並把選取內容加入聊天上下文。

> [!IMPORTANT]
> 專案仍在早期開發，目前只透過 personal marketplace 測試，尚未公開發布。

## 功能

- 瀏覽與搜尋 Markdown、wikilinks、tags 和 frontmatter。
- 顯示 backlinks、孤立筆記、失效連結與知識圖譜。
- 選取文字並加入留言，附加到 Codex composer；不會自動送出。
- 累積多則註解，每則保留筆記路徑、文字與行號。
- 透過 MCP tools 安全地讀寫筆記；寫入預設關閉。

## 使用

安裝後建立新的 Codex task，選擇 `@Codex Vault`，再輸入「開啟 Vault
Explorer」。插件更新後也必須使用新 task，既有 task 不會熱重載 MCP tools。

加入註解：

1. 在 Markdown reader 選取文字並按「加入聊天」。
2. 視需要輸入留言，再次按「加入聊天」。
3. 回到 composer 輸入問題，送出時才會連同註解交給模型。

註解只存在於聊天上下文，不會寫回 Markdown。

## 能力邊界

- 這是 Codex plugin 與 MCP App，不是 Codex App 的 fork。
- 不能安裝成 Codex 私有 UI 的固定側邊欄或控制模型選單。
- 註解使用公開的 `updateModelContext()`，不是 Codex 私有註解資料模型。
- 目前主要在 macOS 驗證；其他平台尚未完整測試。

## 開發

需求：Node.js 22+、Yarn Classic 1.x，以及支援 Plugins/MCP Apps 的 Codex App。

```sh
git clone https://github.com/Avery320/codex-vault.git
cd codex-vault
yarn install
yarn build
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view test:unit
```

已設定 personal marketplace 的環境可執行：

```sh
codex plugin add codex-vault@personal
codex plugin list
```

直接執行 `./scripts/launch_codex_vault_mcp` 只會啟動 stdio server，不會顯示
Codex UI。完整更新流程見[開發指南](docs/development.md)。

## 寫入

設定 `CODEX_VAULT_ALLOW_WRITES=true`，或讓
`~/.config/codex-vault/allow-writes` 內容為 `true`，才會啟用寫入 tools。

修改既有筆記必須先呼叫 `preview_resource_update`，再以回傳的 SHA-256 呼叫
`update_resource`；檔案已改變時會回傳 `conflict`，不會覆寫新內容。

## 文件

- [使用指南](docs/usage.md)
- [架構與能力邊界](docs/architecture.md)
- [開發指南](docs/development.md)
- [安全性與本機資料](docs/security-and-data.md)
- [Fork 與授權](docs/fork-and-license.md)

## Fork 與授權

Codex Vault 衍生自 [Foam](https://github.com/foambubble/foam)，沿用其 Markdown、
wikilink 與 graph 核心，並新增 Codex plugin、MCP App、多 vault 管理和聊天註解。

本專案採 [MIT License](LICENSE)。上游、Microsoft-derived source 與第三方依賴
歸屬見 [NOTICE.md](NOTICE.md)。Codex Vault 並非 OpenAI、Obsidian 或 Foam 官方產品。
