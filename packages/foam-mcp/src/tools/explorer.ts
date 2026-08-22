import { z } from 'zod';
import { buildGraphData, resolveNote } from '@foam/core';
import { parseUriInput, uriToOutputString } from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import { FoamMcpWorkspaceProvider, VaultManager } from '../workspace-context';

// MCP App hosts cache UI by URI; bump this path when the bundled UI changes.
export const VAULT_EXPLORER_RESOURCE_URI =
  'ui://codex-vault/v7/vault-explorer.html';

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
          revision: 0,
          reset: true,
        });
      }
      if (args.vault_id !== active.vault.id) {
        return json({
          revision: active.changeFeed.revision,
          reset: true,
        });
      }
      const change = await active.changeFeed.waitForChange(
        args.since_revision,
        LIVE_UPDATE_WAIT_MS,
        extra.signal
      );
      return json(change);
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
      inputSchema: {
        project_path: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Absolute path of the current Codex project. Used to select its containing vault.'
          ),
      },
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
    async args => {
      const projectWorkspace =
        args.project_path && vaultManager
          ? await vaultManager.openVault({ projectPath: args.project_path })
          : undefined;
      const projectNeedsSelection =
        args.project_path !== undefined &&
        vaultManager !== undefined &&
        projectWorkspace === null;
      const state = projectNeedsSelection
        ? await buildVaultSelectionState(vaultManager)
        : await buildExplorerState(workspaceProvider, vaultManager, undefined);

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
  if (!active) return buildVaultSelectionState(vaultManager);

  const vaults = vaultManager
    ? await vaultManager.listVaults()
    : [{ ...active.vault, active: true }];

  const { foam, rootUri } = active;
  let focusUri: string | undefined;
  if (focusUriInput) {
    const uri = parseUriInput(focusUriInput, rootUri);
    resolveNote(foam.workspace, { uri });
    focusUri = uriToOutputString(uri, rootUri);
  }

  const resources = foam.workspace.list();
  const graph = buildGraphData(
    resources,
    foam.graph.getAllConnections(),
    uri => uriToOutputString(uri, rootUri)
  );
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

async function buildVaultSelectionState(
  vaultManager: VaultManager | undefined
) {
  const vaults = vaultManager
    ? (await vaultManager.listVaults()).map(vault => ({
        ...vault,
        active: false,
      }))
    : [];
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
