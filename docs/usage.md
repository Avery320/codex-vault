# 使用指南

## 啟動

安裝或更新插件後，建立新的 Codex task，選擇 `@Codex Vault`，再要求開啟
Vault Explorer。舊 task 不會重新載入新版 MCP tools。

## Vault 管理

Vault registry 位於 `~/.config/codex-vault/vaults.json`。

- `register_vault`：註冊既有資料夾，不改寫內容。
- `create_vault`：建立新 vault。
- `select_vault`：切換 vault。
- `forget_vault`：只移除註冊資料，不刪除筆記。

macOS 首次啟動會嘗試匯入 Obsidian registry，但不會修改 Obsidian 設定。

Explorer 開啟且可見時，外部新增、修改或刪除 Markdown 檔案會自動同步檔案樹、
reader、backlinks 與知識圖譜，不需要手動重新整理。切到背景時會暫停等待，恢復可見
後再接續同步。

## 註解

1. 在 reader 選取文字。
2. 按「加入聊天」，輸入選填留言，再次確認。
3. 繼續選取可累積多則註解。
4. 回到 composer 輸入問題並送出。

每則註解包含 vault、筆記路徑、選取文字、行號與留言。加入註解不會送出聊天，
也不會修改筆記。

## 修改筆記

寫入預設關閉。啟用後仍須先 `preview_resource_update`，再以相同 SHA-256 呼叫
`update_resource`。若回傳 `conflict`，必須重新讀取與預覽。

一般刪除移到 `.foam/trash`；永久刪除需要額外指定與確認。

## 常見問題

- 終端機啟動沒有 UI：stdio server 必須由 Codex host 才能呈現 MCP App。
- 更新後仍是舊版：確認 `codex plugin list`，再建立新 task。
- 註解是否永久保存：否，註解只是 composer 的暫時上下文。
