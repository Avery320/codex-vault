---
name: vault-knowledge
description: Search, read, and analyze an Obsidian-compatible Markdown vault through Codex Vault. Use for note discovery, wikilinks, backlinks, tags, graph traversal, orphan detection, and vault-based synthesis. Do not use for unrelated source-code repositories.
---

# Vault Knowledge

Use Codex Vault's MCP tools as the source of truth for the configured vault.

- Start with `get_workspace_info` when the active vault or access mode is unclear.
- Use `search_resources`, tag/property queries, and graph tools to narrow the relevant notes before reading full Markdown.
- Read the selected notes before summarizing them. Distinguish note content from your own inference.
- Use connections, orphans, dead ends, and placeholders to explain knowledge-graph structure rather than inferring links from titles alone.
- Treat workspace-relative paths returned by the tools as stable note identifiers for follow-up calls.
- The default server is read-only. Do not ask for or imply write access unless the user explicitly requests a note change.
- When write tools are unavailable, return a proposed Markdown patch in chat instead of editing the vault by another route.
- Before changing an existing note, call `preview_resource_update` and review its diff. Apply the same proposal with `update_resource` and the returned `expected_content_sha256` only when the requested change authorizes it.
- If `update_resource` reports `conflict`, read the note again and create a new preview. Never retry with an old hash or overwrite newer content.
- For new notes, pass the complete Markdown as `content`. Use an explicit workspace-relative `.md` `path` for CJK or otherwise non-ASCII filenames.
