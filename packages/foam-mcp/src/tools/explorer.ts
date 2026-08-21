import { z } from 'zod';
import { buildGraphData, resolveNote } from '@foam/core';
import { parseUriInput, uriToOutputString } from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import { FoamMcpWorkspaceProvider, VaultManager } from '../workspace-context';

// MCP App hosts cache UI by URI; bump this path when the bundled UI changes.
export const VAULT_EXPLORER_RESOURCE_URI =
  'ui://codex-vault/v4/vault-explorer.html';

// Stay below the MCP SDK's default 60-second request timeout so the server
// completes each wait cleanly before the host times it out.
const LIVE_UPDATE_WAIT_MS = 50_000;

export function registerExplorerTool(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider,
  vaultManager?: VaultManager
): void {
  register(
    'wait_for_vault_change',
    {
      description:
        'Wait for the active vault to change. Used internally by the Codex Vault UI.',
      inputSchema: {
        vault_id: z.string(),
        since_revision: z.number().int().nonnegative(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ['app'] },
      },
    },
    async (args, extra) => {
      const active = workspaceProvider.getActive();
      if (!active) {
        return json({
          vault_id: null,
          revision: 0,
          changed: true,
          reset: true,
        });
      }
      if (args.vault_id !== active.vault.id) {
        return json({
          vault_id: active.vault.id,
          revision: active.changeFeed.revision,
          changed: true,
          reset: true,
        });
      }
      const change = await active.changeFeed.waitForChange(
        args.since_revision,
        LIVE_UPDATE_WAIT_MS,
        extra.signal
      );
      return json({ vault_id: active.vault.id, ...change });
    }
  );

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
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: VAULT_EXPLORER_RESOURCE_URI },
        'ui/resourceUri': VAULT_EXPLORER_RESOURCE_URI,
        'openai/toolInvocation/invoking': '正在開啟知識庫…',
        'openai/toolInvocation/invoked': '知識庫已開啟',
      },
    },
    async () => {
      const state = await buildExplorerState(
        workspaceProvider,
        vaultManager,
        undefined
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
      revision: 0,
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
    revision: active.changeFeed.revision,
    needs_vault_selection: false,
  };
}
