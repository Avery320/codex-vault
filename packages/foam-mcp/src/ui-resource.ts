import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VAULT_EXPLORER_RESOURCE_URI } from './tools/explorer';

const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

export function registerVaultExplorerResource(server: McpServer): void {
  server.registerResource(
    'Codex Vault Explorer',
    VAULT_EXPLORER_RESOURCE_URI,
    {
      description:
        'Interactive Markdown explorer and Foam knowledge graph for Codex.',
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: false,
        },
      },
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
            _meta: {
              ui: {
                prefersBorder: false,
              },
            },
          },
        ],
      };
    }
  );
}
