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
          'show_vault_explorer',
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
        ui: { resourceUri: 'ui://codex-vault/vault-explorer.html' },
      });
      const resources = await ctx.client.listResources();
      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'ui://codex-vault/vault-explorer.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
        ])
      );

      const result = (await ctx.client.callTool({
        name: 'show_vault_explorer',
        arguments: { focus_uri: 'a.md' },
      })) as {
        structuredContent: {
          focus_uri: string;
          files: Array<{ uri: string; title: string }>;
          graph: {
            nodeInfo: Record<string, { title: string }>;
            links: Array<{ source: string; target: string }>;
          };
        };
      };

      expect(result.structuredContent.focus_uri).toBe('a.md');
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
    }));

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
