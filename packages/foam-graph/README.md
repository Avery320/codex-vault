# `@foam/graph-view`

Vault Explorer 使用的 Foam-derived Lit graph component。它只負責呈現 graph data，
不管理 vault、Markdown、model context 或寫入。

```sh
yarn workspace @foam/graph-view build
yarn workspace @foam/graph-view test:unit
```

VS Code bundle target 暫時保留供 legacy 相容；新 graph 邏輯應維持 host-neutral。
