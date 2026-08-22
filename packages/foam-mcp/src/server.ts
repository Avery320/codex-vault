import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import pkg from '../package.json';
import { withToolErrorHandling } from './errors';
import { registerResourceTools } from './tools/resources';
import { registerGraphTools } from './tools/graph';
import { registerTagTools } from './tools/tags';
import { registerSearchTools } from './tools/search';
import { registerStructureTools } from './tools/structure';
import { registerVaultTools } from './tools/vaults';
import { registerExplorerTool } from './tools/explorer';
import { registerVaultExplorerResource } from './ui-resource';
import { FoamMcpWorkspaceProvider, VaultManager } from './workspace-context';

/**
 * Pre-bound `registerTool` helper handed to tool modules. Has the same
 * signature as {@link McpServer.registerTool} (so zod-shape inference on
 * handler args still works at the call site), with centralized error handling.
 */
export type ToolRegistrar = McpServer['registerTool'];

/**
 * Server access mode. `'read'` exposes only read tools; `'read-write'`
 * additionally registers write tools (create/update/delete/move resource
 * and add/remove/rename tags). Required — consumers must make an explicit
 * choice rather than rely on a default.
 */
export type FoamMcpServerMode = 'read' | 'read-write';

export interface FoamMcpServerOptions {
  /** Supplies the workspace used by each tool invocation. */
  workspaceProvider: FoamMcpWorkspaceProvider;
  /** Access mode. See {@link FoamMcpServerMode}. */
  mode: FoamMcpServerMode;
  /** Optional multi-vault operations exposed by Codex Vault. */
  vaultManager?: VaultManager;
  /** Optional native folder picker supplied by the Node runtime. */
  pickVaultFolder?: () => Promise<string | null>;
}

const READ_ONLY_INSTRUCTIONS =
  'This Foam MCP server is running in read-only mode. ' +
  'Write tools (create_resource, update_resource, delete_resource, ' +
  'move_resource, add_tags, remove_tags, rename_tag) are not available. ' +
  'Call get_workspace_info to confirm the mode programmatically (read_only=true).';

/**
 * MCP server that exposes a Foam workspace's knowledge graph and content
 * to AI agents. Construct, then `connect(transport)` to start listening.
 *
 * The Foam instance is injected — this library does not pick a filesystem
 * or watcher implementation. The CLI uses `NodeFileDataStore` + `NodeWatcher`;
 * another host integration would use its own equivalents.
 */
export class FoamMcpServer {
  private readonly mcp: McpServer;
  private readonly workspaceProvider: FoamMcpWorkspaceProvider;

  constructor(opts: FoamMcpServerOptions) {
    const readOnly = opts.mode === 'read';
    this.mcp = new McpServer(
      { name: pkg.name, version: pkg.version },
      {
        capabilities: { tools: {} },
        instructions: readOnly ? READ_ONLY_INSTRUCTIONS : undefined,
      }
    );

    this.workspaceProvider = opts.workspaceProvider;

    const register = this.makeRegisterTool();

    // Read-only tools always registered.
    registerStructureTools(register, opts.workspaceProvider);
    registerGraphTools(register, opts.workspaceProvider, readOnly);
    registerExplorerTool(register, opts.workspaceProvider, opts.vaultManager);
    registerSearchTools(register, opts.workspaceProvider);

    // Modules that mix read and write tools accept a `readOnly` flag and
    // skip registering the writers entirely. Clients that list tools see
    // the actual capability surface.
    registerResourceTools(register, opts.workspaceProvider, readOnly);
    registerTagTools(register, opts.workspaceProvider, readOnly);
    if (opts.vaultManager) {
      registerVaultTools(register, opts.vaultManager, opts.pickVaultFolder);
    }
    registerVaultExplorerResource(this.mcp);
  }

  /**
   * Returns a `registerTool` helper bound to this server. Tool modules use
   * it to register tools without knowing about the SDK call or error wrapper.
   */
  private makeRegisterTool(): ToolRegistrar {
    const fn = (
      name: string,
      config: Parameters<ToolRegistrar>[1],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: any
    ): ReturnType<ToolRegistrar> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.mcp.registerTool as any)(
        name,
        config,
        withToolErrorHandling(handler)
      );
    };
    return fn as ToolRegistrar;
  }

  /** The underlying low-level MCP Server, exposed for advanced use cases. */
  get server() {
    return this.mcp.server;
  }

  async connect(transport: Transport): Promise<void> {
    await this.mcp.connect(transport);
  }

  async close(): Promise<void> {
    await this.workspaceProvider.close();
    await this.mcp.close();
  }
}
