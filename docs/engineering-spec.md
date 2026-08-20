# 工程開發規格

本文件把[產品契約](product-contract.md)轉成可直接實作與驗收的工程工作。
規格依據為目前 repository、安裝中的 MCP Apps SDK `1.1.2`、本機 Codex App
`26.814.41407`，以及 commit `18230e76` 的測試與 bundle 分析結果。

## 已確認的能力邊界

| 能力                     | 程式證據                                               | 工程結論                                               |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| 加入下一次模型上下文     | `App.updateModelContext()`                             | 可開發；每次更新覆蓋前一次，Vault 必須傳送完整註解陣列 |
| 不送出聊天               | `ui/update-model-context` 不觸發 follow-up             | 可開發；不得呼叫 `sendMessage()`                       |
| 多段選取與個別留言       | `structuredContent.annotations[]`                      | 可開發；由 Vault 維護有順序的快照                      |
| 原生側邊欄               | SDK 的 display mode 只有 `inline`、`fullscreen`、`pip` | 目前阻塞；MCP App 不能掛載成原生側邊欄                 |
| Plugin sidebar extension | `.codex-plugin/plugin.json` 沒有 UI mount 宣告         | 目前阻塞；不得虛構 manifest 欄位                       |
| 修改 Codex 宿主          | 本機 App 為簽名、proprietary 的 `app.asar` 發行物      | 不列入可維護方案；除非取得合法且可建置的宿主原始碼     |

現有 MCP App 可以繼續作為資料模型與互動演算法的驗證宿主，但不是產品契約要求的
最終承載位置。

## 現況量測

- Node MCP minified bundle 約 `1,317,774` bytes，包含 83 個 workspace modules。
- UI minified bundle 約 `840,302` bytes，包含 13 個 workspace modules；其中 graph
  component 是主要體積來源。
- `@foam/core` 由 CommonJS aggregate entry 匯入，導致未使用的 export 也進入 Node
  bundle。
- `yarn test:unit` 目前通過；`.vscode/settings.json` 已不影響 runtime，後續切片仍須
  移除 `.foam/templates` 與 `.foam/trash` 行為。
- 本機仍有舊 task 啟動的歷史 MCP process，其中部分入口是已刪除的
  `packages/foam-cli/out/index.js`；目前 repository 的正式入口是
  `packages/foam-mcp/out/node.js`。

這些數字只作為刪除驗證基線，不設定任意的體積 KPI。完成清理的判準是舊模組不再
出現在 bundle metafile，而不是只讓輸出檔變小。

## 驗證環境隔離

Codex task 不會熱重載 plugin。任何 UI 或宿主驗收開始前必須同時記錄：

1. `.codex-plugin/plugin.json` 的版本。
2. `codex plugin list` 顯示的安裝版本。
3. 驗收使用全新 Codex task。
4. 該 task 的 MCP process 入口是同版本 cache 下的
   `packages/foam-mcp/out/node.js`，不是歷史 `foam-cli` 入口。
5. `show_vault_explorer` 宣告的 resource URI 與本次 build 一致。

缺少任一證據時，畫面只能標記為「版本未知」，不得用來判定程式修改成功或失敗。
不得為了驗收自行終止其他 task 的 process；需要清理時先取得使用者授權。

## 目標模組邊界

```text
Codex host
└─ Host context bridge
   └─ Vault application
      ├─ annotation snapshot
      ├─ note reader/search
      └─ graph queries
         └─ Vault core
            ├─ filesystem + watcher
            ├─ Markdown index
            ├─ links/tags/properties
            └─ safe note writes
```

規則：

- `Vault core` 不得依賴 Codex UI、MCP App DOM 或 Foam／VS Code 設定。
- UI 不得重新解析 frontmatter；properties 只來自 core 的 canonical note model。
- HTML renderer 與 note index parser可以分開，因為前者產生安全 HTML、後者建立
  links/tags/properties；兩者不得各自建立第二份業務狀態。
- Host-specific 欄位只能存在於 context bridge，不得散落在 reader 與 annotation
  演算法中。

## 演算法決策

### 保留

| 演算法                          | 位置                                  | 決策                                                      |
| ------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Workspace／graph／tags 增量模型 | `foam-core/src/model`                 | 保留；這是 fork 中仍有產品價值的核心                      |
| Watcher debounce                | `foam-mcp/src/node/watcher.ts`        | 保留 100 ms per-path debounce；演算法簡單且已有事件測試   |
| Full-text index                 | `foam-mcp/src/full-text-index.ts`     | 保留 MiniSearch、CJK character/bigram token；維持增量更新 |
| File tree                       | `foam-mcp/ui/vault-explorer-model.ts` | 保留 O(路徑片段總數) 的單次建樹，不增加第二個索引         |
| Wiki target resolution          | 同上                                  | 先保留 O(n) 搜尋；在真實效能證據出現前不增加 cache        |
| SHA-256 preview/commit          | `foam-mcp/src/tools/resources.ts`     | 保留；避免 preview 後的並行覆寫                           |
| Source-line selection           | `foam-mcp/ui/note-selection.ts`       | 保留行級唯讀錨點；不得用不可靠的 inline offset 修改檔案   |
| Context snapshot replacement    | `foam-mcp/ui/note-chat-context.ts`    | 保留完整陣列覆蓋，符合 host API 語意                      |

### 替換

| 現有實作                                        | 問題                                            | 替換方式                                    |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `.vscode/settings.json` + `IFoamConfig` cascade | 與 Obsidian 無關，大部分 getter 未被 Vault 使用 | 改為固定、最小的 `VaultFilePolicy`          |
| `noteCreate()` 的 ASCII slug                    | 中文標題可能產生空檔名                          | 使用保留 Unicode 的跨平台檔名正規化         |
| `.foam/trash`                                   | 不符合 Obsidian                                 | 改為 vault root 下的 `.trash`               |
| `gray-matter` 寫入 + `yaml` 讀取                | frontmatter 有兩套語意                          | 使用同一個 YAML document helper 讀寫        |
| `@foam/core` aggregate entry                    | CommonJS 將未使用 export 一起打包               | 建立只供 Vault runtime 使用的 focused entry |
| UI 直接存取 OpenAI host key                     | host extension 與業務邏輯耦合                   | 收斂成一個薄的 model-context bridge         |

### 刪除

下列程式只有 Foam／VS Code／CLI 行為，移除前仍須用 bundle metafile 與 `rg` 再驗證
沒有 production import：

- `foam-core/src/templates/**`。
- `foam-core/src/common/snippetParser.ts`。
- `foam-core/src/utils/template-frontmatter-parser.ts`。
- Foam daily note、template trigger、JavaScript VM sandbox。
- `foam-mcp/src/node/config.ts` 與對應測試。
- 未被 MCP tools 使用的 `LoadProfiler`、host metrics、task deduplicator 與 rename
  section/block/note 路徑。
- 移除上述路徑後不再使用的 `dayjs`、`gray-matter` 等 dependencies。

不得依照檔名批次刪除。每個切片都必須先讓 production entry 的 metafile 不包含該
模組，再刪 source 與測試。

## 核心資料契約

### 選取內容

```ts
interface NoteSelection {
  vaultId?: string;
  vaultName: string;
  noteUri: string;
  quote: string;
  startLine: number;
  endLine: number;
}

interface NoteAnnotation extends NoteSelection {
  comment?: string;
}
```

不加入 character offset、DOM path 或自製 range ID。這些值在 Markdown 重新 render
後不穩定，也不是目前「加入聊天上下文」所需資料。

### Selection 演算法

1. Markdown renderer 只在具有 `token.map` 的 block element 寫入 one-based
   `data-source-line-start/end`。
2. DOM selection 必須非 collapsed，且 start/end 都位於 reader。
3. start/end container 分別往上找最近的 source-line element。
4. 取最小 start、最大 end，並限制在目前筆記行數內。
5. `window.getSelection().toString()` 只做 CRLF 正規化與首尾空白移除。
6. 找不到可靠 block line 時回傳 `null`，不得猜測。

目前 `createNoteSelection()` 每次都 split 完整 source 只為取得行數。實作時改傳
預先計算的 `lineCount`，讓每次選取不必重新掃描整份筆記。

### Annotation snapshot 演算法

```text
next = current + pendingAnnotation
await host.replaceModelContext(serialize(next))
成功：current = next
失敗：current 不變
```

必要不變條件：

- `updateModelContext()` 每次傳完整陣列，不傳增量 patch。
- 每段 quote 只配對自己的 comment。
- 加入 context 不呼叫 `sendMessage()`，不自動建立新 task。
- host context changed 是同步來源；host 清除附件時，本地陣列也清空。
- 標準正確性只依賴 `content` 與 `structuredContent`。`presentation` 和
  `openai/modelContext` 是 Codex host extension，必須封裝並允許 host 不支援。
- 呼叫前檢查 `hostCapabilities.updateModelContext`；不支援時顯示明確錯誤。

送給模型的 text 也必須包含 vault、note URI、line range、quote 與 comment，不能只
把來源資訊放在 structured data。Host 如何顯示 pill 由 Codex 控制，Vault 不仿製。

### Note creation 演算法

1. 有 `path` 時要求 `.md`，解析後驗證仍在 vault root。
2. 沒有 `path` 時，使用 `title.trim().normalize('NFC')`。
3. 只替換跨平台不合法字元與 path separator；保留中文、大小寫與一般空白。
4. 正規化後為空時使用 `未命名`。
5. 接上 `.md`，再次驗證 containment。
6. 目的檔存在即失敗，不自動產生 `-1` 或覆寫。
7. 內容只由明確傳入的 content/properties 或最小 `# title` 產生；不搜尋 template。

### Frontmatter 演算法

1. 只把文件第一行的 `---` 視為可能 frontmatter 起點。
2. 找不到關閉 delimiter 時，整份內容視為 body，不吞掉文字。
3. 使用 YAML document API 解析與修改指定 key；未修改的 body 完整保留。
4. properties、tag mutation 與 reader model 共用同一 helper。
5. raw HTML 維持關閉；這與 frontmatter 顯示無關。

## 實作順序

每個項目是一個獨立 branch、commit 與驗收單位；不得合併施工。

### CV-CORE-01：移除 VS Code／Foam config runtime

狀態：已實作，等待使用者驗收與 commit。初始掃描與 watcher 共用
`VaultFilePolicy`；舊 config cascade、glob matcher 與 `jsonc-parser` 已移除。

修改：

- `packages/foam-mcp/src/node/filesystem.ts`
- 新增最小 `vault-file-policy.ts`
- 刪除 `packages/foam-mcp/src/node/config.ts` 與測試
- 縮減 `foam-core/src/config.ts`；沒有 production import 後刪除

固定 policy：note extension `.md`；排除 `.git`、`.obsidian`、`.trash`、
`node_modules`；attachment extension 沿用目前已驗證清單。此階段不新增設定 UI。

驗收：

- Vault 中的 `.vscode/settings.json` 不改變索引結果。
- `.obsidian`、`.trash` 不進入 workspace。
- watcher 與 initial scan 使用同一套 policy。
- Node bundle metafile 不含 `node/config` 與 `foam-core/config`。

### CV-CORE-02：移除 Foam template note creation

修改：

- 將簡單 note creation 收斂在 `foam-mcp/src/tools/resources.ts` 或一個單一 helper。
- 刪除 `foam-core/src/templates/**`、snippet/template utilities 與 exports。

驗收：

- 純中文標題建立 `中文標題.md`。
- path traversal、空標題、既有檔案都有明確測試。
- `.foam/templates` 的任何檔案都不會被讀取或執行。
- bundle metafile 不含 `templates/`、`snippetParser`、`dayjs`。

### CV-CORE-03：Obsidian trash

只將一般刪除目的地改為 `.trash/<relative path>`；永久刪除流程不變。

驗收：同名衝突不得覆寫；workspace 與 watcher 不重新索引 trash 中的檔案。

### CV-CORE-04：focused core entry 與死碼刪除

建立只匯出 MCP production 所需型別與函式的 entry，更新 MCP imports。以 Node/UI
兩份 esbuild metafile 建立保留集合；刪除集合外且沒有測試契約需求的 Foam 模組。

驗收：

- production bundle 不再經過 `foam-core/src/index.ts` 的全量 export。
- 所有 MCP tools、watcher、search、graph 與 write tests 通過。
- 沒有只為已刪功能存在的 dependency。

### CV-DATA-01：統一 frontmatter

以 YAML document helper 取代 `gray-matter`，讓 index、properties 與 writes 共用
語意。需測試 scalar、array、nested value、中文、空 frontmatter、註解、CRLF 與
未關閉 delimiter。

### CV-CHAT-01：收斂 model-context bridge

只移動 host-specific 行為，不改 UI 版面：

- capability check。
- 完整來源 text format。
- snapshot replace 與 host clear 同步。
- 兩段選取、不同留言、移除其中一段、失敗不改本地狀態的測試。

`sendMessage()` 明確禁止出現在 production code。

### CV-MD-01：Obsidian 相容矩陣

現有支援：frontmatter 隱藏、properties、task list、callout、wikilink、block ID、
backlinks。新增 Markdown 行為前，先提供 Obsidian 參考輸入與預期畫面；一次只補一
項，不引入第二套 renderer。

### CV-HOST-01：原生側邊欄 spike（目前 blocked）

只有下列任一證據出現後才能規劃程式碼：

- 公開 Codex plugin API 明確提供 native sidebar mount；或
- 支援 sidebar 的正式 SDK／manifest schema；或
- 取得合法授權、可建置且可維護的 Codex host source。

解除阻塞後的第一個 spike 只能完成兩件事：在真實原生側邊欄顯示靜態內容，以及把
一段固定文字加入原生 composer context。不得同時搬 reader、graph 或 vault state。

## 每個切片的完成條件

- 先附 production import／bundle 證據，再刪除程式。
- 列出 changed files、deleted files、資料契約與 non-goals。
- unit tests、MCP process e2e、`git diff --check` 全部通過。
- 涉及 UI 時，還要通過使用者指定的 Obsidian／Codex 參考畫面驗收。
- 未完成或 blocked 項目必須明列，不得用替代 UI 宣稱完成。

## 下一個唯一工作

下一個已定義但尚未授權的工作是 **CV-CORE-02：移除 Foam template note
creation**。它必須等待 `CV-CORE-01` 驗收與獨立 commit 完成；不得與本切片合併
施工。
