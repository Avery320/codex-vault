import { FoamError } from '@foam/core';
import { z } from 'zod';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import { VaultManager } from '../workspace-context';

export function registerVaultTools(
  register: ToolRegistrar,
  vaultManager: VaultManager
): void {
  register(
    'list_vaults',
    {
      description:
        'List remembered Markdown vaults and identify the active vault.',
      inputSchema: {},
    },
    async () => json(await vaultManager.listVaults())
  );

  register(
    'register_vault',
    {
      description:
        'Remember an existing folder as a vault and make it active. This does not move or rewrite its files.',
      inputSchema: {
        path: z.string(),
        name: z.string().optional(),
        project_path: z.string().optional(),
      },
    },
    async args => {
      const active = await vaultManager.registerVault({
        path: args.path,
        name: args.name,
        projectPath: args.project_path,
      });
      return json({
        active_vault: { ...active.vault, active: true },
        vaults: await vaultManager.listVaults(),
      });
    }
  );

  register(
    'create_vault',
    {
      description:
        'Create a new Obsidian-compatible vault folder, remember it, and make it active.',
      inputSchema: {
        parent_path: z.string(),
        name: z.string(),
        project_path: z.string().optional(),
      },
    },
    async args => {
      const active = await vaultManager.createVault({
        parentPath: args.parent_path,
        name: args.name,
        projectPath: args.project_path,
      });
      return json({
        active_vault: { ...active.vault, active: true },
        vaults: await vaultManager.listVaults(),
      });
    }
  );

  register(
    'select_vault',
    {
      description:
        'Switch the active vault. Optionally remember the selection for a Codex project path.',
      inputSchema: {
        vault_id: z.string(),
        project_path: z.string().optional(),
      },
    },
    async args => {
      const active = await vaultManager.openVault({
        vaultId: args.vault_id,
        projectPath: args.project_path,
      });
      if (!active) {
        throw new FoamError('resource_not_found', 'Vault could not be opened.');
      }
      return json({
        active_vault: { ...active.vault, active: true },
        vaults: await vaultManager.listVaults(),
      });
    }
  );

  register(
    'forget_vault',
    {
      description:
        'Remove a vault from the remembered list without deleting its folder or notes. Requires confirm=true.',
      inputSchema: {
        vault_id: z.string(),
        confirm: z.boolean().optional(),
      },
    },
    async args => {
      if (args.confirm !== true) {
        throw new FoamError(
          'invalid_input',
          'Pass `confirm: true` to forget the vault. No files will be deleted.'
        );
      }
      await vaultManager.forgetVault(args.vault_id);
      return json({
        forgotten: true,
        deleted_files: false,
        vaults: await vaultManager.listVaults(),
      });
    }
  );
}
