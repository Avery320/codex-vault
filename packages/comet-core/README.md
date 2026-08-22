# `@comet/core`

COMET 的 host-neutral Markdown 與 graph 核心，負責 resources、frontmatter、tags、
wikilinks、queries 與 link updates。不得依賴 Codex、MCP、Node filesystem 或 VS
Code。

```sh
yarn workspace @comet/core build
yarn workspace @comet/core test:unit
```

請保留 `src/common/` 中 Microsoft-derived MIT source headers，詳見
[NOTICE](../../NOTICE.md)。
