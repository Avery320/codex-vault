import { withMcpServer } from '../test-setup';

const SEED = {
  'a.md': '---\ntitle: A\ntags: [project, urgent]\n---\n# A',
  'b.md': '---\ntitle: B\ntags: [project]\n---\n# B',
  'c.md': '---\ntitle: C\ntags: [archive]\n---\n# C',
};

describe('tag tools', () => {
  it('list_tags returns counts sorted by frequency', () =>
    withMcpServer(SEED, async ctx => {
      const tags = await ctx.callToolJson<Array<{ tag: string; count: number }>>(
        'list_tags'
      );
      const project = tags.find(t => t.tag === 'project');
      expect(project!.count).toBe(2);
    }));

  it('add_tags appends to frontmatter without duplicating', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{ tags: string[] }>('add_tags', {
        uri: 'a.md',
        tags: ['project', 'new-tag'],
      });
      expect(result.tags.sort()).toEqual(['new-tag', 'project', 'urgent']);
      const resources = await ctx.callToolJson<Array<{ uri: string }>>(
        'list_resources',
        { tag: 'new-tag' }
      );
      expect(resources.map(resource => resource.uri)).toEqual(['a.md']);
    }));

  it('remove_tags strips listed tags', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{ tags: string[] }>('remove_tags', {
        uri: 'a.md',
        tags: ['urgent'],
      });
      expect(result.tags).toEqual(['project']);
      const resources = await ctx.callToolJson<Array<{ uri: string }>>(
        'list_resources',
        { tag: 'urgent' }
      );
      expect(resources).toEqual([]);
    }));

  it('rename_tag renames parent and child tags and refreshes workspace state', () =>
    withMcpServer(
      {
        'parent.md': '---\ntags: [project]\n---\n# Parent',
        'child.md': '---\ntags: [project/active]\n---\n# Child',
      },
      async ctx => {
        const result = await ctx.callToolJson<{
          old_tag: string;
          new_tag: string;
          updated_resources: number;
        }>('rename_tag', {
          old_tag: 'project',
          new_tag: 'initiative',
        });
        expect(result).toEqual({
          old_tag: 'project',
          new_tag: 'initiative',
          updated_resources: 2,
        });

        const tags = await ctx.callToolJson<Array<{ tag: string }>>('list_tags');
        expect(tags.map(tag => tag.tag).sort()).toEqual([
          'initiative',
          'initiative/active',
        ]);
      }
    ));

  it('rename_tag requires force before merging existing tags', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('rename_tag', {
        old_tag: 'urgent',
        new_tag: 'project',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('isMerge');
    }));
});
