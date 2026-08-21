import { Foam, FoamError, IDataStore, URI } from '@foam/core';
import { VaultFullTextIndex } from './full-text-index';
import { VaultChangeFeed } from './vault-change-feed';

export interface VaultSummary {
  id: string;
  name: string;
  path: string;
  last_opened_at: number;
  active: boolean;
}

export interface FoamMcpWorkspaceContext {
  foam: Foam;
  rootUri: URI;
  dataStore: IDataStore;
  searchIndex: VaultFullTextIndex;
  changeFeed: VaultChangeFeed;
  vault: Omit<VaultSummary, 'active'>;
}

export interface FoamMcpWorkspaceProvider {
  getActive(): FoamMcpWorkspaceContext | null;
  close(): Promise<void>;
}

export interface VaultManager extends FoamMcpWorkspaceProvider {
  listVaults(): Promise<VaultSummary[]>;
  openVault(options: {
    vaultId?: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext | null>;
  registerVault(options: {
    path: string;
    name?: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext>;
  createVault(options: {
    parentPath: string;
    name: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext>;
  forgetVault(vaultId: string): Promise<void>;
}

export function createWorkspaceContext(options: {
  foam: Foam;
  rootUri: URI;
  vault?: Partial<Omit<VaultSummary, 'active'>>;
}): FoamMcpWorkspaceContext {
  const dataStore = options.foam.services.dataStore;
  const path = options.rootUri.toFsPath();
  const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const searchIndex = new VaultFullTextIndex(options.foam.workspace, dataStore);
  const changeFeed = new VaultChangeFeed(options.foam.workspace);
  return {
    foam: options.foam,
    rootUri: options.rootUri,
    dataStore,
    searchIndex,
    changeFeed,
    vault: {
      id: options.vault?.id ?? path,
      name: options.vault?.name ?? name,
      path: options.vault?.path ?? path,
      last_opened_at: options.vault?.last_opened_at ?? Date.now(),
    },
  };
}

export class StaticWorkspaceProvider implements FoamMcpWorkspaceProvider {
  constructor(private readonly context: FoamMcpWorkspaceContext) {}

  getActive(): FoamMcpWorkspaceContext {
    return this.context;
  }

  async close(): Promise<void> {
    this.context.changeFeed.dispose();
    this.context.searchIndex.dispose();
  }
}

export function requireWorkspace(
  provider: FoamMcpWorkspaceProvider
): FoamMcpWorkspaceContext {
  const workspace = provider.getActive();
  if (!workspace) {
    throw new FoamError(
      'invalid_input',
      'No active vault. Register or select a vault before using note tools.'
    );
  }
  return workspace;
}
