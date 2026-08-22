import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CometMcpServer } from '@comet/mcp';
import { createTmpDir } from '../test/test-utils';
import { VaultRegistry } from './vault-registry';
import { NodeVaultWorkspaceManager } from './vault-workspace-manager';

describe('NodeVaultWorkspaceManager', () => {
  it('switches the workspace used by existing MCP tool handlers', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    let client: Client | undefined;
    let server: CometMcpServer | undefined;
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

      server = new CometMcpServer({
        workspaceProvider: manager,
        vaultManager: manager,
        pickVaultFolder: async () => vaultB,
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
          'pick_vault_folder',
        ])
      );
      const picked = await client.callTool({
        name: 'pick_vault_folder',
        arguments: {},
      });
      expect(picked.content).toEqual([
        { type: 'text', text: JSON.stringify({ path: vaultB }) },
      ]);
      expect(await listResourceUris(client)).toEqual(['alpha.md']);
      await client.callTool({
        name: 'select_vault',
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

  it('declares project_path and opens the vault bound to that project', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    try {
      const vaultA = path.join(rootDir, 'Alpha');
      const vaultB = path.join(rootDir, 'Beta');
      const projectPath = path.join(rootDir, 'current-project');
      await fs.mkdir(vaultA);
      await fs.mkdir(vaultB);
      await fs.mkdir(projectPath);
      await fs.writeFile(path.join(vaultA, 'alpha.md'), '# Alpha');
      await fs.writeFile(path.join(vaultB, 'beta.md'), '# Beta');

      let id = 0;
      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => `vault-${++id}`,
      });
      const manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();
      const alpha = await manager.registerVault({
        path: vaultA,
        projectPath,
      });
      await manager.registerVault({ path: vaultB });

      await withVaultManagerMcp(manager, async client => {
        const explorer = (await client.listTools()).tools.find(
          tool => tool.name === 'show_vault_explorer'
        );
        expect(explorer?.inputSchema).toMatchObject({
          type: 'object',
          properties: { project_path: { type: 'string' } },
        });

        const result = await showVaultExplorer(client, {
          project_path: projectPath,
        });
        expect(result.structuredContent.active_vault).toMatchObject({
          id: alpha.vault.id,
          name: 'Alpha',
        });
        expect(result.structuredContent.needs_vault_selection).toBe(false);
        expect(result.structuredContent.files.map(file => file.uri)).toEqual([
          'alpha.md',
        ]);
      });
    } finally {
      cleanup();
    }
  });

  it('recognizes an unregistered Obsidian vault containing the project', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
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
      const manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();

      await withVaultManagerMcp(manager, async client => {
        const result = await showVaultExplorer(client, {
          project_path: projectPath,
        });
        expect(result.structuredContent.active_vault).toMatchObject({
          id: 'knowledge-vault',
          name: 'Knowledge',
        });
        expect(result.structuredContent.needs_vault_selection).toBe(false);
        expect(
          (await manager.listVaults()).filter(vault => vault.active)
        ).toHaveLength(1);
      });
    } finally {
      cleanup();
    }
  });

  it('requests vault selection when the project is outside every vault', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    try {
      const vaultPath = path.join(rootDir, 'Knowledge');
      const projectPath = path.join(rootDir, 'unrelated-project');
      await fs.mkdir(vaultPath);
      await fs.mkdir(projectPath);
      await fs.writeFile(path.join(vaultPath, 'home.md'), '# Home');

      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => 'knowledge-vault',
      });
      const manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();
      const active = await manager.registerVault({ path: vaultPath });

      await withVaultManagerMcp(manager, async client => {
        const result = await showVaultExplorer(client, {
          project_path: projectPath,
        });
        expect(result.structuredContent).toMatchObject({
          active_vault: null,
          needs_vault_selection: true,
          files: [],
          vaults: [
            {
              id: active.vault.id,
              name: 'Knowledge',
              active: false,
            },
          ],
        });
        expect(manager.getActive()?.vault.id).toBe(active.vault.id);
      });
    } finally {
      cleanup();
    }
  });

  it('keeps the active vault when project_path is omitted', async () => {
    const { rootDir, cleanup } = createTmpDir({}, 'codex-vault-manager-');
    try {
      const vaultPath = path.join(rootDir, 'Knowledge');
      await fs.mkdir(vaultPath);
      await fs.writeFile(path.join(vaultPath, 'home.md'), '# Home');

      const registry = new VaultRegistry({
        registryPath: path.join(rootDir, 'config', 'vaults.json'),
        createId: () => 'knowledge-vault',
      });
      const manager = new NodeVaultWorkspaceManager(registry);
      await manager.initialize();
      const active = await manager.registerVault({ path: vaultPath });

      await withVaultManagerMcp(manager, async client => {
        const result = await showVaultExplorer(client);
        expect(result.structuredContent.active_vault).toMatchObject({
          id: active.vault.id,
          name: 'Knowledge',
        });
        expect(result.structuredContent.needs_vault_selection).toBe(false);
      });
    } finally {
      cleanup();
    }
  });
});

interface ExplorerResult {
  structuredContent: {
    active_vault: { id: string; name: string } | null;
    vaults: Array<{ id: string; name: string; active: boolean }>;
    files: Array<{ uri: string }>;
    needs_vault_selection: boolean;
  };
}

async function withVaultManagerMcp<T>(
  manager: NodeVaultWorkspaceManager,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const server = new CometMcpServer({
    workspaceProvider: manager,
    vaultManager: manager,
    mode: 'read',
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client(
    { name: 'vault-manager-test', version: '0.0.0' },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

async function showVaultExplorer(
  client: Client,
  args: Record<string, unknown> = {}
): Promise<ExplorerResult> {
  return client.callTool({
    name: 'show_vault_explorer',
    arguments: args,
  }) as unknown as Promise<ExplorerResult>;
}

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
