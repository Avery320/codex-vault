import { withMcpServer } from '../test-setup';

const SEED = {
  'meeting-notes.md':
    '---\ntitle: Meeting Notes\nstatus: active\n---\n# Meeting Notes',
  'project-plan.md':
    '---\ntitle: Project Plan\nstatus: archived\n---\n# Project Plan',
  'todo.md': '---\ntitle: TODO\nstatus: active\n---\n# TODO',
};

describe('search tools', () => {
  it('search_resources matches by title substring', () =>
    withMcpServer(SEED, async ctx => {
      const matches = await ctx.callToolJson<Array<{ uri: string }>>(
        'search_resources',
        { query: 'project' }
      );
      expect(matches.map(m => m.uri)).toEqual(['project-plan.md']);
    }));

  it('search_resources matches text in the markdown body', () =>
    withMcpServer(
      {
        'body-search.md':
          '# Searchable Note\n\nThe launch checklist contains a quokka mascot.',
        'other.md': '# Other Note\n\nNothing relevant here.',
      },
      async ctx => {
        const matches = await ctx.callToolJson<
          Array<{ uri: string; line: number; text: string }>
        >('search_resources', { query: 'quokka' });

        expect(matches).toEqual([
          expect.objectContaining({
            uri: 'body-search.md',
            line: 3,
            text: 'The launch checklist contains a quokka mascot.',
          }),
        ]);
      }
    ));

  it('search_resources tokenizes Traditional Chinese body text', () =>
    withMcpServer(
      {
        '繁中筆記.md':
          '# 繁中筆記\n\n這份文件說明如何建立可搜尋的知識圖譜與雙向連結。',
      },
      async ctx => {
        const matches = await ctx.callToolJson<Array<{ uri: string }>>(
          'search_resources',
          { query: '知識圖譜' }
        );

        expect(matches.map(m => m.uri)).toEqual(['繁中筆記.md']);
      }
    ));

  it('search_resources refreshes body text after a resource update', () =>
    withMcpServer(
      { 'changing.md': '# Changing\n\nThe original marker is cedar.' },
      async ctx => {
        expect(
          (
            await ctx.callToolJson<Array<{ uri: string }>>('search_resources', {
              query: 'cedar',
            })
          ).map(m => m.uri)
        ).toEqual(['changing.md']);

        await ctx.callToolJson('update_resource', {
          uri: 'changing.md',
          content: '# Changing\n\n更新後的標記是海棠。',
        });

        const oldMatches = await ctx.callToolJson<Array<{ uri: string }>>(
          'search_resources',
          { query: 'cedar' }
        );
        const newMatches = await ctx.callToolJson<Array<{ uri: string }>>(
          'search_resources',
          { query: '海棠' }
        );
        expect(oldMatches).toEqual([]);
        expect(newMatches.map(m => m.uri)).toEqual(['changing.md']);
      }
    ));

  it('search_by_property finds notes with a given property value', () =>
    withMcpServer(SEED, async ctx => {
      const matches = await ctx.callToolJson<Array<{ uri: string }>>(
        'search_by_property',
        { property: 'status', value: 'active' }
      );
      expect(matches.map(m => m.uri).sort()).toEqual([
        'meeting-notes.md',
        'todo.md',
      ]);
    }));

  it('search_by_property without value matches any value', () =>
    withMcpServer(SEED, async ctx => {
      const matches = await ctx.callToolJson<Array<{ uri: string }>>(
        'search_by_property',
        { property: 'status' }
      );
      expect(matches.length).toBe(3);
    }));
});
