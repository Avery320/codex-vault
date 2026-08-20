# Security Policy

Codex Vault 仍在 pre-release，只維護 `main` 最新版本。

請勿在公開 issue 提交私人筆記、credentials、tokens 或個人路徑。一般問題可用
合成 Markdown 範例回報；可能讀取 vault 外檔案、繞過唯讀模式、覆寫資料或洩漏
內容的漏洞，請優先使用 GitHub private vulnerability reporting（若已啟用）。

高風險範圍包括 path traversal、未授權寫入、preview/hash 繞過、任意 HTML/script
執行，以及 model context 或 logs 的內容外洩。

更多安全設計見 [安全性與本機資料](docs/security-and-data.md)。
