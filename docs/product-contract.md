# 產品契約

本文件是 Codex Vault 的最高產品規格。`AGENTS.md` 定義開發流程，本文件定義
什麼才算完成。兩者衝突時必須停止並請使用者確認，不得自行選擇替代方案。

## 唯一產品目標

Codex Vault 必須成為 **Codex App 原生側邊欄中的 Obsidian 相容筆記介面**。
使用者檢視與操作筆記時，Codex 原生聊天視窗及 composer 必須同時保持可用。

側邊欄至少包含：

- 檔案樹與筆記搜尋。
- Obsidian 相容 Markdown reader。
- frontmatter properties。
- backlinks。
- knowledge graph。
- 選取內容與逐則留言的「加入聊天」流程。

## Codex 整合行為

1. 使用者在筆記中選取一段文字。
2. 使用者可為該段文字輸入個別留言。
3. 選取文字、筆記路徑、行號與留言加入同一個 Codex composer context。
4. 加入 context 不得自動送出訊息。
5. 模型選擇、推理強度、訊息輸入與送出仍由 Codex 原生 UI 管理。

## 不接受的替代方案

下列結果即使功能可用，也不算達成產品目標：

- 聊天訊息中的 inline MCP App iframe。
- fullscreen 或 picture-in-picture Plugin UI。
- 外部瀏覽器、獨立桌面視窗或另一套聊天介面。
- 在 iframe 內仿製 Codex 側邊欄或 composer。
- 重新實作 Codex 已提供的模型選單、推理強度或訊息送出流程。
- 未經使用者明確同意，把上述方案當成 fallback。

## 架構准入條件

任何新的 UI 實作開始前，必須先提交並確認以下證據：

1. **宿主承載證據**：存在可把第三方 UI 掛載到 Codex 原生側邊欄的公開 API，
   或存在具備合法授權、可建置與可維護的 Codex App 宿主原始碼路徑。
2. **Composer 橋接證據**：側邊欄可以把多則選取內容加入同一個原生 composer
   context，且不自動送出。
3. **最小驗證方案**：先只驗證原生側邊欄掛載與 composer bridge，不得同時搬入
   Vault reader、graph 或其他產品功能。
4. **使用者核准**：使用者確認證據、架構、修改範圍與驗收方式後，才可實作。

若任一條件無法證明，狀態必須標記為 `blocked` 或 `infeasible`，停止 UI 開發。
不得以 inline、fullscreen 或仿製 UI 繼續施工。

## 驗收條件

只有同時符合以下條件才算完成整合：

- Vault UI 實際位於 Codex App 原生側邊欄，而不是 iframe 自製版面。
- 開啟、切換與操作筆記時，原生聊天視窗保持可見且可輸入。
- 檔案樹、reader、properties、backlinks 與 graph 依指定 Obsidian 參考畫面驗收。
- 每段選取內容可加入獨立留言，並作為可移除的 composer context 附件。
- 加入附件後不會自動建立或送出聊天訊息。
- Codex 原生模型、推理強度與送出操作沒有被重製或取代。
- 自動測試、實際宿主操作與參考畫面驗收全部通過。

測試通過但宿主位置或互動不符合上述條件，仍然視為未完成。

## 現況

目前 repository 中的 Vault Explorer 是 MCP App iframe 原型。它可驗證 Markdown、
properties、backlinks、graph 與 model-context attachment，但 **不符合原生側邊欄
目標**。

目前安裝的 MCP Apps SDK 僅提供 `inline`、`fullscreen` 與 `pip`，plugin manifest
也沒有原生側邊欄 mount。可施工與阻塞項目以[工程開發規格](engineering-spec.md)的
程式證據為準。

在宿主承載與 composer bridge 證據確認前：

- 凍結新的 Vault UI 功能開發。
- 允許只讀架構調查、文件修正、工程規格已定義的非 UI core 清理，以及既有原型的
  必要維護。
- 不得把 MCP App 原型重新定義為最終產品。

## 變更規則

- 產品目標只能由使用者明確修改。
- 每個實作階段使用獨立分支與獨立 commit。
- `main` 不直接接受未經使用者驗收的架構或 UI 變更。
- 「開始執行」只授權已確認的單一修改，不代表可以變更本產品契約或採用 fallback。
