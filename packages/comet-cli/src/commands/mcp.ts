import path from 'node:path';
import {
  createWorkspaceContext,
  CometMcpWorkspaceProvider,
  CometMcpServer,
  StaticWorkspaceProvider,
  StdioServerTransport,
  VaultManager,
  VaultFilePolicy,
} from '@comet/mcp';
import { type ILogger, Logger } from '@comet/core';
import { loadWorkspaceFromDirectory } from '../support/filesystem';
import { pickVaultFolder } from '../support/folder-picker';
import { NodeWatcher } from '../support/watcher';
import {
  parseArgs,
  getFlag,
  getString,
  resolveWorkspaceDir,
} from '../support/args';
import { VaultRegistry } from '../support/vault-registry';
import { NodeVaultWorkspaceManager } from '../support/vault-workspace-manager';

export const MCP_HELP = `Usage: comet mcp [options]

Starts an MCP (Model Context Protocol) server over stdio. The server
exposes the workspace's knowledge graph and note content to AI agents
(Claude Desktop, Cursor, Zed, etc.).

The server is long-running: it loads the workspace once at startup and
watches the filesystem for changes so subsequent tool calls reflect the
latest state.

By default the server is read-only — pass --allow-writes to expose write
tools (create/update/delete/move resources and tag mutations).

Options:
  --workspace <dir>   Workspace root (default: COMET_WORKSPACE env var, then cwd)
  --vault-registry <file>
                      Use the persistent multi-vault registry instead of one workspace
  --obsidian-registry <file>
                      Import known Obsidian vaults (read-only)
  --allow-writes      Register write tools. Off by default.
  --help              Show this help

Claude Desktop / mcp.json config:

  {
    "mcpServers": {
      "comet": {
        "command": "npx",
        "args": ["comet-cli", "mcp", "--workspace", "/path/to/workspace"]
      }
    }
  }

Logging:
  All log output goes to stderr (stdio is reserved for the MCP transport
  itself). Comet logs are silenced by default — set COMET_LOG_LEVEL=info or
  =debug for diagnostic output.
`;

export interface McpArgs {
  workspaceDir?: string;
  vaultRegistryPath?: string;
  obsidianRegistryPath?: string;
  allowWrites: boolean;
}

export function parseMcpArgs(argv: string[]): McpArgs {
  const args = parseArgs(argv);
  const vaultRegistryPath = getString(args, 'vault-registry');
  return {
    workspaceDir: vaultRegistryPath ? undefined : resolveWorkspaceDir(args),
    vaultRegistryPath,
    obsidianRegistryPath: getString(args, 'obsidian-registry'),
    allowWrites: getFlag(args, 'allow-writes'),
  };
}

export async function runMcpCommand(
  args: McpArgs,
  logger: ILogger
): Promise<number> {
  // The MCP transport owns stdout — anything written there is interpreted
  // as protocol messages. Send our own logs to stderr only.
  const logLevel =
    (process.env.COMET_LOG_LEVEL as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error'
      | undefined) ?? 'error';
  Logger.setLevel(logLevel);

  let workspaceProvider: CometMcpWorkspaceProvider;
  let vaultManager: VaultManager | undefined;
  let staticWatcher: NodeWatcher | undefined;

  if (args.vaultRegistryPath) {
    const registry = new VaultRegistry({
      registryPath: path.resolve(args.vaultRegistryPath),
      obsidianRegistryPath: args.obsidianRegistryPath
        ? path.resolve(args.obsidianRegistryPath)
        : undefined,
    });
    const manager = new NodeVaultWorkspaceManager(registry);
    await manager.initialize();
    workspaceProvider = manager;
    vaultManager = manager;
    const active = manager.getActive();
    logger.error(
      active
        ? `[comet-mcp] Active vault: ${active.vault.path} (${
            active.comet.workspace.list().length
          } resources)`
        : '[comet-mcp] No active vault. Waiting for vault selection.'
    );
  } else {
    const rootDir = path.resolve(args.workspaceDir ?? process.cwd());
    logger.error(`[comet-mcp] Loading workspace: ${rootDir}`);
    const filePolicy = new VaultFilePolicy();
    staticWatcher = new NodeWatcher(rootDir, {
      ignored: filePath => filePolicy.isIgnored(filePath),
    });
    const { comet, rootUri } = await loadWorkspaceFromDirectory(rootDir, {
      watcher: staticWatcher,
      filePolicy,
    });
    logger.error(
      `[comet-mcp] Workspace loaded: ${
        comet.workspace.list().length
      } resources, ${comet.graph.getAllConnections().length} connections`
    );
    workspaceProvider = new StaticWorkspaceProvider(
      createWorkspaceContext({
        comet,
        rootUri,
      })
    );
  }

  const server = new CometMcpServer({
    workspaceProvider,
    vaultManager,
    pickVaultFolder: vaultManager ? pickVaultFolder : undefined,
    mode: args.allowWrites ? 'read-write' : 'read',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.error('[comet-mcp] Listening on stdio.');

  // Block until the transport closes (client disconnects) or we get a signal.
  const shutdown = new Promise<void>(resolve => {
    const onSignal = () => resolve();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    transport.onclose = () => resolve();
  });

  await shutdown;

  logger.error('[comet-mcp] Shutting down.');
  await server.close();
  await staticWatcher?.dispose();
  return 0;
}
