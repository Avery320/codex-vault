# Fork 與授權

Codex Vault 衍生自 [foambubble/foam](https://github.com/foambubble/foam)：

- `origin`：`https://github.com/Avery320/codex-vault.git`
- `upstream`：`https://github.com/foambubble/foam.git`

沿用範圍包括 Markdown parser、resource model、wikilinks、link graph、CLI adapters
與 graph component。本 fork 新增 Codex plugin、MCP App、多 vault、安全寫入與聊天
註解。

`@foam/*` 是暫時保留的內部名稱。原始 Foam VS Code extension 已從現行 source tree
移除，仍可從 Git history 與上游 repository 追溯。

## 授權

上游 Foam 與本 fork 均採 [MIT License](../LICENSE)。上游 copyright、Git history
與 Microsoft-derived source headers 必須保留，詳見 [NOTICE.md](../NOTICE.md)。

第三方依賴保留各自授權。`yarn licenses list` 目前包含 MIT、ISC、BSD、Apache、
MPL、BlueOak、CC0 等條款，不能簡化成「全部 MIT」。

發布前仍須複核：

- `spawndamnit@3.0.1`：license 位於套件 LICENSE。
- `gitconfiglocal@1.0.0`：只標示 `BSD`。

Codex Vault 是獨立社群專案，不代表 OpenAI、Obsidian 或 Foam。
