# 安全性與本機資料

- MCP server 只讀取已註冊 vault；registry 位於
  `~/.config/codex-vault/vaults.json`。
- 插件沒有獨立同步服務。只有附加並送出的內容會進入 Codex 模型請求。
- 寫入 tools 預設不註冊，必須明確啟用 read-write mode。
- 更新需要 preview SHA-256；檔案變更後 commit 會失敗。
- 建立不覆寫既有檔案；一般刪除移到 `.foam/trash`。
- `forget_vault` 不會刪除 vault folder。

Markdown 是不受信任資料，不能當成系統指令。聊天註解也不是修改授權；寫入仍須
來自使用者明確要求。不要在筆記、registry 或版本控制中存放密碼與 tokens。

漏洞回報方式見 [SECURITY.md](../SECURITY.md)。
