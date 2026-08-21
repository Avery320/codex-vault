import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withMcpServer } from './test-setup';

const SEED = {
  'a.md': '# A\n\n[[b]]',
  'b.md': '# B',
};

/**
 * Full server lifecycle: bootstrap → register tools → connect transport →
 * client lists/calls tools → close. Distinct from the per-module tool
 * tests in tools/*.test.ts which exercise individual tools; this one
 * verifies the tool catalogue and lifecycle as observable to a real MCP
 * client.
 */
describe('FoamMcpServer lifecycle', () => {
  it('exposes the expected catalogue of tools after connect', () =>
    withMcpServer(SEED, async ctx => {
      const list = await ctx.client.listTools();
      const names = list.tools.map(t => t.name).sort();
      // Spot-check one tool from each module rather than asserting the
      // entire list verbatim — that would couple this test to every
      // future tool addition. Module coverage is what we care about here.
      expect(names).toEqual(
        expect.arrayContaining([
          // resources
          'list_resources',
          'get_resource',
          'read_resource',
          'preview_resource_update',
          'create_resource',
          'update_resource',
          'delete_resource',
          'move_resource',
          // graph
          'get_connections',
          'get_orphans',
          'get_deadends',
          'get_placeholders',
          'traverse_graph',
          'get_graph_summary',
          'get_workspace_info',
          'get_vault_explorer_state',
          'show_vault_explorer',
          'wait_for_vault_change',
          // tags
          'list_tags',
          'search_by_tag',
          'add_tags',
          'remove_tags',
          'rename_tag',
          // search
          'search_resources',
          'search_by_property',
          // structure
          'get_outline',
        ])
      );
    }));

  it('show_vault_explorer advertises and returns an MCP App graph payload', () =>
    withMcpServer(SEED, async ctx => {
      const list = await ctx.client.listTools();
      const tool = list.tools.find(item => item.name === 'show_vault_explorer');

      expect(tool?._meta).toMatchObject({
        ui: { resourceUri: 'ui://codex-vault/v4/vault-explorer.html' },
      });
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      const resources = await ctx.client.listResources();
      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'ui://codex-vault/v4/vault-explorer.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
        ])
      );
      const html = await readFile(
        path.join(__dirname, '..', 'ui', 'vault-explorer.html'),
        'utf8'
      );
      expect(html).toEqual(expect.stringContaining('id="vault-switcher"'));
      expect(html).toEqual(expect.stringContaining('id="markdown"'));
      expect(html).toEqual(expect.stringContaining('id="graph"'));
      expect(html).toEqual(expect.stringContaining('id="graph-settings"'));
      expect(html).toEqual(
        expect.stringContaining('id="graph-settings-toggle"')
      );
      expect(html).not.toEqual(
        expect.stringContaining('id="selection-dialog"')
      );
      expect(html).not.toEqual(expect.stringContaining('id="analyze"'));

      const result = (await ctx.client.callTool({
        name: 'show_vault_explorer',
        arguments: {},
      })) as {
        structuredContent: {
          focus_uri: string;
          active_vault: { active: boolean };
          revision: number;
          needs_vault_selection: boolean;
          files: Array<{ uri: string; title: string }>;
          graph: {
            nodeInfo: Record<string, { title: string }>;
            links: Array<{ source: string; target: string }>;
          };
        };
      };

      expect(result.structuredContent.focus_uri).toBeUndefined();
      expect(result.structuredContent.active_vault).toMatchObject({
        active: true,
      });
      expect(result.structuredContent.revision).toBe(0);
      expect(result.structuredContent.needs_vault_selection).toBe(false);
      expect(result.structuredContent.files.map(file => file.uri)).toEqual([
        'a.md',
        'b.md',
      ]);
      expect(
        Object.keys(result.structuredContent.graph.nodeInfo).sort()
      ).toEqual(['a.md', 'b.md']);
      expect(result.structuredContent.graph.links).toEqual([
        { source: 'a.md', target: 'b.md' },
      ]);

      const state = (await ctx.client.callTool({
        name: 'get_vault_explorer_state',
        arguments: {},
      })) as { structuredContent: typeof result.structuredContent };
      expect(state.structuredContent.files).toEqual(
        result.structuredContent.files
      );
    }));

  it('exposes an app-only change wait that resolves after a workspace update', () =>
    withMcpServer(SEED, async ctx => {
      const list = await ctx.client.listTools();
      const tool = list.tools.find(
        item => item.name === 'wait_for_vault_change'
      );
      expect(tool?._meta).toMatchObject({
        ui: { visibility: ['app'] },
      });

      const before = (await ctx.client.callTool({
        name: 'get_vault_explorer_state',
        arguments: {},
      })) as {
        structuredContent: {
          active_vault: { id: string };
          revision: number;
        };
      };
      const wait = ctx.callToolJson<{
        vault_id: string;
        revision: number;
        changed: boolean;
        reset: boolean;
      }>('wait_for_vault_change', {
        vault_id: before.structuredContent.active_vault.id,
        since_revision: before.structuredContent.revision,
      });

      const uri = ctx.rootUri.joinPath('a.md');
      ctx.dataStore.set(uri, '# Updated A\n\n[[b]]');
      await ctx.foam.workspace.fetchAndSet(uri);

      await expect(wait).resolves.toMatchObject({
        vault_id: before.structuredContent.active_vault.id,
        revision: before.structuredContent.revision + 1,
        changed: true,
        reset: false,
      });
    }));

  it('treats frontmatter types as note metadata in the explorer graph', () =>
    withMcpServer(
      {
        'typed.md': '---\ntype: moc\ntags:\n  - topic\n---\n# Typed',
      },
      async ctx => {
        const result = (await ctx.client.callTool({
          name: 'get_vault_explorer_state',
          arguments: {},
        })) as {
          structuredContent: {
            graph: {
              nodeInfo: Record<
                string,
                { type: string; properties: Record<string, unknown> }
              >;
            };
          };
        };

        expect(
          result.structuredContent.graph.nodeInfo['typed.md']
        ).toMatchObject({
          type: 'note',
          properties: { type: 'moc' },
        });
      }
    ));

  it('every registered tool advertises a description', () =>
    withMcpServer(SEED, async ctx => {
      const list = await ctx.client.listTools();
      for (const tool of list.tools) {
        expect(
          tool.description,
          `tool ${tool.name} missing description`
        ).toBeDefined();
      }
    }));

  it('read mode does not register write tools', () =>
    withMcpServer(SEED, { mode: 'read' }, async ctx => {
      const list = await ctx.client.listTools();
      const names = list.tools.map(t => t.name);
      const writeTools = [
        'create_resource',
        'update_resource',
        'delete_resource',
        'move_resource',
        'add_tags',
        'remove_tags',
        'rename_tag',
      ];
      for (const writer of writeTools) {
        expect(names).not.toContain(writer);
      }
      expect(names).toContain('list_resources');
      expect(names).toContain('preview_resource_update');
      expect(names).toContain('list_tags');
    }));

  it('advertises read-only mode in initialize.instructions and get_workspace_info', () =>
    withMcpServer(SEED, { mode: 'read' }, async ctx => {
      expect(ctx.client.getInstructions()).toContain('read-only');

      const result = (await ctx.client.callTool({
        name: 'get_workspace_info',
        arguments: {},
      })) as { content: Array<{ text: string }> };
      const info = JSON.parse(result.content[0].text);
      expect(info.read_only).toBe(true);
    }));

  it('read-write mode reports read_only=false and no instructions', () =>
    withMcpServer(SEED, async ctx => {
      expect(ctx.client.getInstructions()).toBeUndefined();
      const result = (await ctx.client.callTool({
        name: 'get_workspace_info',
        arguments: {},
      })) as { content: Array<{ text: string }> };
      const info = JSON.parse(result.content[0].text);
      expect(info.read_only).toBe(false);
    }));

  it('close() stops the transport so subsequent calls reject', async () => {
    // Special case: this test asserts behavior *after* withMcpServer
    // tears down. We capture the client before close and then assert.
    const captured = await withMcpServer(SEED, async ctx => ctx.client);
    await expect(captured.listTools()).rejects.toThrow();
  });
});
