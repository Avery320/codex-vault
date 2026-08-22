import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VAULT_EXPLORER_RESOURCE_URI } from './tools/explorer';

const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
const RESOURCE_META = { ui: { prefersBorder: false } };

export function registerVaultExplorerResource(server: McpServer): void {
  server.registerResource(
    'COMET Explorer',
    VAULT_EXPLORER_RESOURCE_URI,
    {
      description:
        'Interactive Markdown explorer and Comet knowledge graph for Codex.',
      mimeType: RESOURCE_MIME_TYPE,
      _meta: RESOURCE_META,
    },
    async () => {
      const html = await readFile(
        path.join(__dirname, 'ui', 'vault-explorer.html'),
        'utf8'
      );
      return {
        contents: [
          {
            uri: VAULT_EXPLORER_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: RESOURCE_META,
          },
        ],
      };
    }
  );
}
