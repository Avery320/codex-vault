---
name: vault-knowledge
description: Open, search, read, and analyze an Obsidian-compatible Markdown vault through Codex Vault. When invoked directly without another request, open the interactive vault explorer. Use for note discovery, wikilinks, backlinks, tags, graph traversal, orphan detection, and vault-based synthesis. Do not use for unrelated source-code repositories.
---

# Vault Knowledge

Use Codex Vault's MCP tools as the source of truth for remembered vaults and
the active workspace.

- When the user asks to open the knowledge workspace, or directly invokes Codex Vault or this skill without another request, immediately call `show_vault_explorer`. Pass the current Codex project root as `project_path` when it is known. Do not stop after acknowledging the invocation.
- Start with `list_vaults` when the active vault is unclear. Call `get_workspace_info` after a vault is active to confirm its path, counts, and access mode.
- Use `select_vault` to switch an existing vault. Only call `register_vault` or `create_vault` when the user explicitly asks to add or create one.
- `forget_vault` only removes a remembered entry, but still requires explicit user intent and `confirm: true`. It never deletes the vault folder.
- Use `search_resources`, tag/property queries, and graph tools to narrow the relevant notes before reading full Markdown.
- Read the selected notes before summarizing them. Distinguish note content from your own inference.
- Use connections, orphans, dead ends, and placeholders to explain knowledge-graph structure rather than inferring links from titles alone.
- Treat workspace-relative paths returned by the tools as stable note identifiers for follow-up calls.
- The default server is read-only. Do not ask for or imply write access unless the user explicitly requests a note change.
- When write tools are unavailable, return a proposed Markdown patch in chat instead of editing the vault by another route.
- Before changing an existing note, call `preview_resource_update` and review its diff. Apply the same proposal with `update_resource` and the returned `expected_content_sha256` only when the requested change authorizes it.
- If `update_resource` reports `conflict`, read the note again and create a new preview. Never retry with an old hash or overwrite newer content.
- For new notes, pass the complete Markdown as `content`. Use an explicit workspace-relative `.md` `path` for CJK or otherwise non-ASCII filenames.
