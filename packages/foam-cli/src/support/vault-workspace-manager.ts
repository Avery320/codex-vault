import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createWorkspaceContext,
  FoamMcpWorkspaceContext,
  VaultManager,
  VaultSummary,
} from '@foam/mcp';
import { loadWorkspaceFromDirectory } from './filesystem';
import { createNodeQueryStore } from './node-query-store';
import { VaultRecord, VaultRegistry } from './vault-registry';
import { NodeWatcher } from './watcher';

interface ActiveWorkspace {
  context: FoamMcpWorkspaceContext;
  watcher: NodeWatcher;
}

export class NodeVaultWorkspaceManager implements VaultManager {
  private active: ActiveWorkspace | null = null;
  private transition: Promise<void> = Promise.resolve();

  constructor(private readonly registry: VaultRegistry) {}

  async initialize(): Promise<void> {
    await this.registry.initialize();
    const active = this.registry.getActive();
    if (active) {
      try {
        await this.activate(active);
      } catch {
        // Keep the registry entry when a cloud/removable vault is temporarily
        // unavailable. The explorer can still offer the remaining vaults.
      }
    }
  }

  getActive(): FoamMcpWorkspaceContext | null {
    return this.active?.context ?? null;
  }

  async listVaults(): Promise<VaultSummary[]> {
    const activeId = this.active?.context.vault.id;
    return this.registry.list().map(vault => ({
      ...vault,
      active: vault.id === activeId,
    }));
  }

  openVault(options: {
    vaultId?: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext | null> {
    return this.enqueue(async () => {
      let vault = options.vaultId
        ? this.registry.get(options.vaultId)
        : null;
      if (options.vaultId && !vault) {
        throw new Error(`Unknown vault: ${options.vaultId}`);
      }

      if (!vault && options.projectPath) {
        vault = await this.registry.resolveProject(options.projectPath);
        if (!vault) {
          const vaultRoot = await findObsidianVaultRoot(options.projectPath);
          if (vaultRoot) {
            vault = await this.registry.register({ vaultPath: vaultRoot });
          }
        }
      }
      vault ??= this.registry.getActive();
      if (!vault) return null;

      await this.activate(vault);
      const selected = await this.registry.select(vault.id);
      this.active!.context.vault.last_opened_at = selected.last_opened_at;
      if (options.projectPath) {
        await this.registry.bindProject(options.projectPath, vault.id);
      }
      return this.active!.context;
    });
  }

  registerVault(options: {
    path: string;
    name?: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext> {
    return this.enqueue(async () => {
      const vault = await this.registry.register({
        vaultPath: options.path,
        name: options.name,
      });
      await this.activate(vault);
      const selected = await this.registry.select(vault.id);
      this.active!.context.vault.last_opened_at = selected.last_opened_at;
      if (options.projectPath) {
        await this.registry.bindProject(options.projectPath, vault.id);
      }
      return this.active!.context;
    });
  }

  createVault(options: {
    parentPath: string;
    name: string;
    projectPath?: string;
  }): Promise<FoamMcpWorkspaceContext> {
    return this.enqueue(async () => {
      const vault = await this.registry.create(options.parentPath, options.name);
      await this.activate(vault);
      if (options.projectPath) {
        await this.registry.bindProject(options.projectPath, vault.id);
      }
      return this.active!.context;
    });
  }

  forgetVault(vaultId: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.active?.context.vault.id === vaultId) {
        await this.disposeActive();
      }
      await this.registry.forget(vaultId);
      const next = this.registry.getActive();
      if (next) await this.activate(next);
    });
  }

  async close(): Promise<void> {
    await this.transition;
    await this.disposeActive();
  }

  private async activate(vault: VaultRecord): Promise<void> {
    if (
      this.active?.context.vault.id === vault.id &&
      this.active.context.vault.path === vault.path
    ) {
      return;
    }

    const watcher = new NodeWatcher(vault.path, {
      ignored: [/(^|[\\/])\../, /node_modules/],
    });
    try {
      const { foam, rootUri } = await loadWorkspaceFromDirectory(vault.path, {
        watcher,
      });
      const next: ActiveWorkspace = {
        context: createWorkspaceContext({
          foam,
          rootUri,
          queryStore: createNodeQueryStore(rootUri),
          vault,
        }),
        watcher,
      };
      const previous = this.active;
      this.active = next;
      if (previous) await disposeWorkspace(previous);
    } catch (error) {
      await watcher.dispose();
      throw error;
    }
  }

  private async disposeActive(): Promise<void> {
    const active = this.active;
    this.active = null;
    if (active) await disposeWorkspace(active);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.then(operation, operation);
    this.transition = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

async function disposeWorkspace(workspace: ActiveWorkspace): Promise<void> {
  workspace.context.searchIndex.dispose();
  await workspace.watcher.dispose();
}

async function findObsidianVaultRoot(
  projectPath: string
): Promise<string | null> {
  let current = await fs.realpath(path.resolve(projectPath));
  const stat = await fs.stat(current);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${projectPath}`);

  while (true) {
    try {
      if ((await fs.stat(path.join(current, '.obsidian'))).isDirectory()) {
        return current;
      }
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
