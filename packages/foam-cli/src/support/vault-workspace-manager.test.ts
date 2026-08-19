import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FoamMcpServer } from '@foam/mcp';
import { createTmpDir } from '../test/test-utils';
import { VaultRegistry } from './vault-registry';
import { NodeVaultWorkspaceManager } from './vault-workspace-manager';

describe('NodeVaultWorkspaceManager', () => {
  it('switches the workspace used by existing MCP tool handlers', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    let client: Client | undefined;
    let server: FoamMcpServer | undefined;
    try {
      const vaultA = path.join(rootDir, 'Alpha');
      const vaultB = path.join(rootDir, 'Beta');
      await fs.mkdir(vaultA);
      await fs.mkdir(vaultB);
      await fs.writeFile(path.join(vaultA, 'alpha.md'), '# Alpha');
      await fs.writeFile(path.join(vaultB, 'beta.md'), '# Beta');

      let id = 0;
      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => `vault-${++id}`,
      });
      const manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();
      const alpha = await manager.registerVault({ path: vaultA });
      const beta = await manager.registerVault({ path: vaultB });
      await manager.openVault({ vaultId: alpha.vault.id });

      server = new FoamMcpServer({
        workspaceProvider: manager,
        vaultManager: manager,
        mode: 'read',
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      client = new Client(
        { name: 'vault-manager-test', version: '0.0.0' },
        { capabilities: {} }
      );
      await client.connect(clientTransport);

      const toolNames = (await client.listTools()).tools.map(tool => tool.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'list_vaults',
          'register_vault',
          'create_vault',
          'select_vault',
          'forget_vault',
        ])
      );
      expect(await listResourceUris(client)).toEqual(['alpha.md']);
      await client.callTool({
        name: 'show_vault_explorer',
        arguments: { vault_id: beta.vault.id },
      });
      expect(await listResourceUris(client)).toEqual(['beta.md']);

      const rejectedForget = await client.callTool({
        name: 'forget_vault',
        arguments: { vault_id: beta.vault.id },
      });
      expect(rejectedForget.isError).toBe(true);
      await expect(fs.stat(vaultB)).resolves.toMatchObject({});
    } finally {
      await client?.close();
      await server?.close();
      cleanup();
    }
  });

  it('recognizes an Obsidian vault containing the current Codex project', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    let manager: NodeVaultWorkspaceManager | undefined;
    try {
      const vaultPath = path.join(rootDir, 'Knowledge');
      const projectPath = path.join(vaultPath, 'projects', 'robot');
      await fs.mkdir(path.join(vaultPath, '.obsidian'), { recursive: true });
      await fs.mkdir(projectPath, { recursive: true });
      await fs.writeFile(path.join(vaultPath, 'home.md'), '# Home');

      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => 'knowledge-vault',
      });
      manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();

      const active = await manager.openVault({ projectPath });
      expect(active?.vault).toMatchObject({
        id: 'knowledge-vault',
        name: 'Knowledge',
      });
      expect((await manager.listVaults()).filter(vault => vault.active)).toHaveLength(
        1
      );
    } finally {
      await manager?.close();
      cleanup();
    }
  });
});

async function listResourceUris(client: Client): Promise<string[]> {
  const result = (await client.callTool({
    name: 'list_resources',
    arguments: {},
  })) as { content: Array<{ type: string; text?: string }> };
  const items = JSON.parse(result.content[0].text ?? '[]') as Array<{
    uri: string;
  }>;
  return items.map(item => item.uri);
}
