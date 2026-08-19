import { z } from 'zod';
import { Foam, URI, buildGraphData, resolveNote } from '@foam/core';
import { parseUriInput, uriToOutputString } from '../serializers';
import type { ToolRegistrar } from '../server';

export const VAULT_EXPLORER_RESOURCE_URI =
  'ui://codex-vault/vault-explorer.html';

export function registerExplorerTool(
  register: ToolRegistrar,
  foam: Foam,
  rootUri: URI
): void {
  register(
    'show_vault_explorer',
    {
      title: '開啟知識庫',
      description:
        'Open the interactive Codex Vault explorer with file navigation, Markdown reading, search, backlinks, and a knowledge graph.',
      inputSchema: {
        focus_uri: z.string().optional(),
      },
      _meta: {
        ui: { resourceUri: VAULT_EXPLORER_RESOURCE_URI },
        'ui/resourceUri': VAULT_EXPLORER_RESOURCE_URI,
        'openai/toolInvocation/invoking': '正在開啟知識庫…',
        'openai/toolInvocation/invoked': '知識庫已開啟',
      },
    },
    async args => {
      let focusUri: string | undefined;
      if (args.focus_uri) {
        const uri = parseUriInput(args.focus_uri, rootUri);
        resolveNote(foam.workspace, { uri });
        focusUri = uriToOutputString(uri, rootUri);
      }

      const graph = buildGraphData(
        foam.workspace.list(),
        foam.graph.getAllConnections(),
        {
          resourceToId: uri => uriToOutputString(uri, rootUri),
          includePlaceholders: true,
        }
      );
      const files = foam.workspace
        .list()
        .filter(resource => resource.type === 'note')
        .map(resource => ({
          uri: uriToOutputString(resource.uri, rootUri),
          title: resource.title,
          type: resource.type,
          tags: resource.tags.map(tag => tag.label),
        }))
        .sort((left, right) => left.uri.localeCompare(right.uri));

      return {
        content: [
          {
            type: 'text' as const,
            text: `Opened Codex Vault Explorer with ${files.length} notes and ${graph.links.length} connections.`,
          },
        ],
        structuredContent: {
          focus_uri: focusUri,
          files,
          graph,
          summary: {
            note_count: files.length,
            connection_count: graph.links.length,
          },
        },
      };
    }
  );
}
