import { Comet, CometError, IDataStore, URI } from '@comet/core';
import { VaultFullTextIndex } from './full-text-index';
import { VaultChangeFeed } from './vault-change-feed';

export interface VaultSummary {
  id: string;
  name: string;
  path: string;
  last_opened_at: number;
  active: boolean;
}

export interface CometMcpWorkspaceContext {
  comet: Comet;
  rootUri: URI;
  dataStore: IDataStore;
  searchIndex: VaultFullTextIndex;
  changeFeed: VaultChangeFeed;
  vault: Omit<VaultSummary, 'active'>;
  dispose(): void;
}

export interface CometMcpWorkspaceProvider {
  getActive(): CometMcpWorkspaceContext | null;
  close(): Promise<void>;
}

export interface VaultManager extends CometMcpWorkspaceProvider {
  listVaults(): Promise<VaultSummary[]>;
  openVault(options: {
    vaultId?: string;
    projectPath?: string;
  }): Promise<CometMcpWorkspaceContext | null>;
  registerVault(options: {
    path: string;
    name?: string;
    projectPath?: string;
  }): Promise<CometMcpWorkspaceContext>;
  createVault(options: {
    parentPath: string;
    name: string;
    projectPath?: string;
  }): Promise<CometMcpWorkspaceContext>;
  forgetVault(vaultId: string): Promise<void>;
}

export function createWorkspaceContext(options: {
  comet: Comet;
  rootUri: URI;
  vault?: Partial<Omit<VaultSummary, 'active'>>;
}): CometMcpWorkspaceContext {
  const dataStore = options.comet.services.dataStore;
  const path = options.rootUri.toFsPath();
  const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  const searchIndex = new VaultFullTextIndex(options.comet.workspace, dataStore);
  const changeFeed = new VaultChangeFeed(options.comet.workspace);
  return {
    comet: options.comet,
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
    dispose: () => {
      changeFeed.dispose();
      searchIndex.dispose();
      options.comet.dispose();
    },
  };
}

export class StaticWorkspaceProvider implements CometMcpWorkspaceProvider {
  constructor(private readonly context: CometMcpWorkspaceContext) {}

  getActive(): CometMcpWorkspaceContext {
    return this.context;
  }

  async close(): Promise<void> {
    this.context.dispose();
  }
}

export function requireWorkspace(
  provider: CometMcpWorkspaceProvider
): CometMcpWorkspaceContext {
  const workspace = provider.getActive();
  if (!workspace) {
    throw new CometError(
      'invalid_input',
      'No active vault. Register or select a vault before using note tools.'
    );
  }
  return workspace;
}
