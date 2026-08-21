export { FoamMcpServer } from './server';
export type { FoamMcpServerOptions, FoamMcpServerMode } from './server';
export {
  createWorkspaceContext,
  requireWorkspace,
  StaticWorkspaceProvider,
} from './workspace-context';
export type {
  FoamMcpWorkspaceContext,
  FoamMcpWorkspaceProvider,
  VaultManager,
  VaultSummary,
} from './workspace-context';

// Re-export the transports consumers are likely to need so they don't have
// to take a direct dependency on @modelcontextprotocol/sdk (which would
// require keeping versions in lockstep with this package's pinned SDK).
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export {
  VAULT_DEFAULT_NOTE_EXTENSION,
  VAULT_NOTE_EXTENSIONS,
  VaultFilePolicy,
} from './node/vault-file-policy';
