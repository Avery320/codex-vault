import { z } from 'zod';
import { buildGraphData, resolveNote } from '@foam/core';
import { parseUriInput, uriToOutputString } from '../serializers';
import type { ToolRegistrar } from '../server';
import { FoamMcpWorkspaceProvider, VaultManager } from '../workspace-context';

export const VAULT_EXPLORER_RESOURCE_URI =
  'ui://codex-vault/vault-explorer.html';

export function registerExplorerTool(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider,
  vaultManager?: VaultManager
): void {
  register(
    'get_vault_explorer_state',
    {
      description:
        'Return the current vault, file tree, and graph data without opening another UI.',
      inputSchema: {
        focus_uri: z.string().optional(),
      },
    },
    async args => {
      const state = await buildExplorerState(
        workspaceProvider,
        vaultManager,
        args.focus_uri
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(state) }],
        structuredContent: state,
      };
    }
  );

  register(
    'show_vault_explorer',
    {
      title: '開啟知識庫',
      description:
        'Open the interactive Codex Vault explorer with file navigation, Markdown reading, search, backlinks, and a knowledge graph.',
      inputSchema: {
        focus_uri: z.string().optional(),
        project_path: z.string().optional(),
        vault_id: z.string().optional(),
      },
      _meta: {
        ui: { resourceUri: VAULT_EXPLORER_RESOURCE_URI },
        'ui/resourceUri': VAULT_EXPLORER_RESOURCE_URI,
        'openai/toolInvocation/invoking': '正在開啟知識庫…',
        'openai/toolInvocation/invoked': '知識庫已開啟',
      },
    },
    async args => {
      if (vaultManager) {
        await vaultManager.openVault({
          vaultId: args.vault_id,
          projectPath: args.project_path,
        });
      }
      const state = await buildExplorerState(
        workspaceProvider,
        vaultManager,
        args.focus_uri
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: state.active_vault
              ? `Opened ${state.active_vault.name} with ${state.summary.note_count} notes and ${state.summary.connection_count} connections.`
              : 'Opened Codex Vault Explorer. Select or create a vault to continue.',
          },
        ],
        structuredContent: state,
      };
    }
  );
}

async function buildExplorerState(
  workspaceProvider: FoamMcpWorkspaceProvider,
  vaultManager: VaultManager | undefined,
  focusUriInput: string | undefined
) {
  const active = workspaceProvider.getActive();
  const vaults = vaultManager
    ? await vaultManager.listVaults()
    : active
    ? [{ ...active.vault, active: true }]
    : [];

  if (!active) {
    return {
      focus_uri: undefined,
      active_vault: null,
      vaults,
      files: [],
      graph: { nodeInfo: {}, links: [] },
      summary: { note_count: 0, connection_count: 0 },
      needs_vault_selection: true,
    };
  }

  const { foam, rootUri } = active;
  let focusUri: string | undefined;
  if (focusUriInput) {
    const uri = parseUriInput(focusUriInput, rootUri);
    resolveNote(foam.workspace, { uri });
    focusUri = uriToOutputString(uri, rootUri);
  }

  const resources = foam.workspace.list();
  const graph = buildGraphData(resources, foam.graph.getAllConnections(), {
    resourceToId: uri => uriToOutputString(uri, rootUri),
    includePlaceholders: true,
  });
  for (const resource of resources) {
    if (resource.type !== 'note') continue;
    const id = uriToOutputString(resource.uri, rootUri);
    if (graph.nodeInfo[id]) graph.nodeInfo[id].type = 'note';
  }
  const files = resources
    .filter(resource => resource.type === 'note')
    .map(resource => ({
      uri: uriToOutputString(resource.uri, rootUri),
      title: resource.title,
      type: resource.type,
      tags: resource.tags.map(tag => tag.label),
    }))
    .sort((left, right) => left.uri.localeCompare(right.uri));
  return {
    focus_uri: focusUri,
    active_vault: { ...active.vault, active: true },
    vaults,
    files,
    graph,
    summary: {
      note_count: files.length,
      connection_count: graph.links.length,
    },
    needs_vault_selection: false,
  };
}
