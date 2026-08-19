import fs from 'node:fs/promises';
import path from 'node:path';
import { createTmpDir } from '../test/test-utils';
import { VaultRegistry } from './vault-registry';

describe('VaultRegistry', () => {
  it('imports Obsidian vaults and migrates the legacy path without duplicates', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-registry-');
    try {
      const vaultA = path.join(rootDir, 'Alpha');
      const vaultB = path.join(rootDir, 'Beta');
      await fs.mkdir(path.join(vaultA, '.obsidian'), { recursive: true });
      await fs.mkdir(path.join(vaultB, '.obsidian'), { recursive: true });
      const obsidianRegistryPath = path.join(rootDir, 'obsidian.json');
      const legacyVaultPathFile = path.join(rootDir, 'vault-path');
      await fs.writeFile(
        obsidianRegistryPath,
        JSON.stringify({
          vaults: {
            alpha123: { path: vaultA, ts: 20, open: true },
            beta456: { path: vaultB, ts: 10 },
          },
        })
      );
      await fs.writeFile(legacyVaultPathFile, `${vaultA}\n`);

      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'codex-vault', 'vaults.json'),
        obsidianRegistryPath,
        legacyVaultPathFile,
        now: () => 100,
        createId: () => 'generated',
      });
      await registry.initialize();
      const canonicalVaultA = await fs.realpath(vaultA);
      const canonicalVaultB = await fs.realpath(vaultB);

      expect(registry.list()).toEqual([
        {
          id: 'alpha123',
          name: 'Alpha',
          path: canonicalVaultA,
          last_opened_at: 20,
        },
        {
          id: 'beta456',
          name: 'Beta',
          path: canonicalVaultB,
          last_opened_at: 10,
        },
      ]);
      expect(registry.getActive()?.id).toBe('alpha123');
    } finally {
      cleanup();
    }
  });

  it('creates, selects, maps, and forgets vaults without deleting folders', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-registry-');
    try {
      let id = 0;
      let now = 100;
      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        now: () => ++now,
        createId: () => `vault-${++id}`,
      });
      await registry.initialize();

      const created = await registry.create(rootDir, 'Knowledge');
      expect(created.id).toBe('vault-1');
      expect(registry.getActive()?.id).toBe('vault-1');
      await expect(
        fs.stat(path.join(created.path, '.obsidian'))
      ).resolves.toMatchObject({});

      const secondPath = path.join(rootDir, 'Second');
      const projectPath = path.join(rootDir, 'project');
      await fs.mkdir(secondPath);
      await fs.mkdir(projectPath);
      const second = await registry.register({
        vaultPath: secondPath,
        select: true,
      });
      await registry.bindProject(projectPath, created.id);

      expect((await registry.resolveProject(projectPath))?.id).toBe(created.id);
      expect(registry.getActive()?.id).toBe(second.id);

      await registry.forget(created.id);
      expect(await registry.resolveProject(projectPath)).toBeNull();
      await expect(fs.stat(created.path)).resolves.toMatchObject({});
    } finally {
      cleanup();
    }
  });

  it('resolves the most specific registered vault containing a project', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-registry-');
    try {
      const nested = path.join(rootDir, 'notes');
      const project = path.join(nested, 'projects', 'robot');
      await fs.mkdir(project, { recursive: true });
      let id = 0;
      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => `vault-${++id}`,
      });
      await registry.initialize();
      await registry.register({ vaultPath: rootDir });
      const nestedVault = await registry.register({ vaultPath: nested });

      expect((await registry.resolveProject(project))?.id).toBe(nestedVault.id);
    } finally {
      cleanup();
    }
  });

  it('rejects invalid vault folder names', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-registry-');
    try {
      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
      });
      await registry.initialize();
      await expect(registry.create(rootDir, '../escape')).rejects.toThrow(
        'single non-empty folder name'
      );
    } finally {
      cleanup();
    }
  });
});
