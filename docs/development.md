# 開發指南

## 建置與測試

```sh
yarn install
yarn build
yarn workspace @foam/mcp lint
yarn workspace @foam/mcp test
yarn workspace @foam/graph-view lint
yarn workspace @foam/graph-view test:unit
```

需求為 Node.js 22+ 與 Yarn Classic 1.x。根目錄 build、lint 與 test 只涵蓋
Codex Vault 的 core、graph、MCP 與 CLI；legacy `foam-vscode` 不在預設開發流程內。

## 更新本機插件

1. 使用 Plugin Creator 的 `update_plugin_cachebuster.py` 更新 manifest 版本後綴。
2. 執行 `yarn build`。
3. 執行 `codex plugin add codex-vault@personal`。
4. 用 `codex plugin list` 確認版本。
5. 建立新 Codex task 測試。

```sh
python3 <plugin-creator-skill>/scripts/update_plugin_cachebuster.py .
yarn build
codex plugin add codex-vault@personal
codex plugin list
```

不要手動修改日常更新使用的 marketplace entry，也不要堆疊多個
`+codex.<token>` 後綴。

## 文件原則

- 現行文件只描述 Codex Vault。
- Foam／VS Code 只用於 fork 歸屬、內部名稱或 legacy 邊界。
- 功能改變時同步更新 README、使用指南與能力邊界。
- 來源或授權改變時同步更新 NOTICE 與授權文件。
