import { createHash } from 'node:crypto';
import { withMcpServer } from '../test-setup';

const SEED = {
  'a.md': '---\ntitle: Note A\ntags: [foo, bar]\n---\n# A\n\nLinks to [[b]].',
  'b.md': '---\ntitle: Note B\n---\n# B\n\nReferences [[c]].',
  'subdir/c.md': '# C\n\nLeaf note.',
};

const sha256 = (content: string) =>
  createHash('sha256').update(content, 'utf8').digest('hex');

describe('resource tools', () => {
  it('list_resources returns all notes by default', () =>
    withMcpServer(SEED, async ctx => {
      const items = await ctx.callToolJson<
        Array<{ uri: string; title: string }>
      >('list_resources');
      expect(items.map(i => i.uri).sort()).toEqual([
        'a.md',
        'b.md',
        'subdir/c.md',
      ]);
    }));

  it('list_resources filters by tag', () =>
    withMcpServer(SEED, async ctx => {
      const items = await ctx.callToolJson<
        Array<{ uri: string; tags: string[] }>
      >('list_resources', { tag: 'foo' });
      expect(items.map(i => i.uri)).toEqual(['a.md']);
    }));

  it('get_resource returns metadata + link identifiers', () =>
    withMcpServer(SEED, async ctx => {
      const detail = await ctx.callToolJson<{
        uri: string;
        title: string;
        tags: string[];
        links?: { outgoing: string[]; incoming: string[] };
      }>('get_resource', { uri: 'a.md' });
      expect(detail.title).toBe('Note A');
      expect(detail.tags.sort()).toEqual(['bar', 'foo']);
      expect(detail.links?.outgoing).toContain('b');
    }));

  it('read_resource returns the raw markdown content', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{
        content: string;
        content_sha256: string;
      }>('read_resource', { uri: 'a.md' });
      expect(result.content).toBe(SEED['a.md']);
      expect(result.content_sha256).toBe(sha256(SEED['a.md']));
    }));

  it('read_resource on a missing file returns a structured error', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('read_resource', { uri: 'missing.md' });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('resource_not_found');
    }));

  it('preview_resource_update returns a diff without changing the file', () =>
    withMcpServer(SEED, async ctx => {
      const preview = await ctx.callToolJson<{
        changed: boolean;
        expected_content_sha256: string;
        next_content_sha256: string;
        diff: string;
      }>('preview_resource_update', {
        uri: 'a.md',
        content: '# A — updated',
      });

      expect(preview.changed).toBe(true);
      expect(preview.expected_content_sha256).toBe(sha256(SEED['a.md']));
      expect(preview.next_content_sha256).toBe(sha256('# A — updated'));
      expect(preview.diff).toContain('-# A');
      expect(preview.diff).toContain('+# A — updated');

      const unchanged = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: 'a.md' }
      );
      expect(unchanged.content).toBe(SEED['a.md']);
    }));

  it('preview_resource_update emits separate hunks for distant changes', () =>
    withMcpServer(
      {
        'long.md': Array.from(
          { length: 20 },
          (_, index) => `line ${index + 1}`
        ).join('\n'),
      },
      async ctx => {
        const content = Array.from({ length: 20 }, (_, index) =>
          index === 1 || index === 18
            ? `changed ${index + 1}`
            : `line ${index + 1}`
        ).join('\n');
        const preview = await ctx.callToolJson<{ diff: string }>(
          'preview_resource_update',
          { uri: 'long.md', content }
        );

        expect(preview.diff.match(/^@@/gm)).toHaveLength(2);
      }
    ));

  it('update_resource applies content only with the previewed hash', () =>
    withMcpServer(SEED, async ctx => {
      const preview = await ctx.callToolJson<{
        expected_content_sha256: string;
      }>('preview_resource_update', {
        uri: 'a.md',
        content: '# A — updated',
      });
      await ctx.callToolJson('update_resource', {
        uri: 'a.md',
        content: '# A — updated',
        expected_content_sha256: preview.expected_content_sha256,
      });
      const after = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: 'a.md' }
      );
      expect(after.content).toBe('# A — updated');
    }));

  it('update_resource with properties merges frontmatter after preview', () =>
    withMcpServer(SEED, async ctx => {
      const preview = await ctx.callToolJson<{
        expected_content_sha256: string;
      }>('preview_resource_update', {
        uri: 'a.md',
        properties: { status: 'active' },
      });
      await ctx.callToolJson('update_resource', {
        uri: 'a.md',
        properties: { status: 'active' },
        expected_content_sha256: preview.expected_content_sha256,
      });
      const after = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: 'a.md' }
      );
      expect(after.content).toContain('status: active');
      expect(after.content).toContain('title: Note A');
    }));

  it('update_resource rejects a missing preview hash', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('update_resource', {
        uri: 'a.md',
        content: '# unsafe overwrite',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('expected_content_sha256');
    }));

  it('update_resource rejects a stale preview and preserves newer content', () =>
    withMcpServer(SEED, async ctx => {
      const preview = await ctx.callToolJson<{
        expected_content_sha256: string;
      }>('preview_resource_update', {
        uri: 'a.md',
        content: '# proposed',
      });

      await ctx.dataStore.write(ctx.rootUri.joinPath('a.md'), '# changed');
      const result = await ctx.callTool('update_resource', {
        uri: 'a.md',
        content: '# proposed',
        expected_content_sha256: preview.expected_content_sha256,
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse(result.content[0].text!);
      expect(error.code).toBe('conflict');
      expect(error.data.current_content_sha256).toBe(sha256('# changed'));
      expect(await ctx.dataStore.read(ctx.rootUri.joinPath('a.md'))).toBe(
        '# changed'
      );
    }));

  it('create_resource accepts an explicit Unicode path and Markdown content', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{ uri: string }>(
        'create_resource',
        {
          path: '專案/會議筆記.md',
          title: '會議筆記',
          content: '# 會議筆記\n\n- 決議',
        }
      );
      expect(result.uri).toBe('專案/會議筆記.md');
      const created = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: result.uri }
      );
      expect(created.content).toBe('# 會議筆記\n\n- 決議');
    }));

  it('delete_resource without confirm returns invalid_input', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('delete_resource', { uri: 'a.md' });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('delete_resource removes the file after confirmation', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{
        deleted: boolean;
        trashed: boolean;
      }>('delete_resource', {
        uri: 'subdir/c.md',
        confirm: true,
      });
      expect(result.deleted).toBe(true);
      expect(result.trashed).toBe(true);
      const read = await ctx.callTool('read_resource', { uri: 'subdir/c.md' });
      expect(read.isError).toBe(true);
    }));
});

describe('resource tools — path traversal containment', () => {
  it('read_resource rejects absolute paths outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('read_resource', {
        uri: '/etc/passwd',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('read_resource rejects file:// URIs outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('read_resource', {
        uri: 'file:///etc/passwd',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('read_resource rejects relative paths that escape the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('read_resource', {
        uri: '../../etc/passwd',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('read_resource still accepts absolute paths inside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: '/workspace/a.md' }
      );
      expect(result.content).toBe(SEED['a.md']);
    }));

  it('update_resource rejects absolute paths outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('update_resource', {
        uri: '/tmp/path-traversal-write.txt',
        content: 'pwned',
        expected_content_sha256: sha256('irrelevant'),
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('delete_resource rejects absolute paths outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('delete_resource', {
        uri: '/etc/passwd',
        confirm: true,
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('move_resource rejects uri outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('move_resource', {
        uri: '/etc/passwd',
        new_path: 'renamed.md',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('move_resource rejects new_path outside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callTool('move_resource', {
        uri: 'a.md',
        new_path: '/etc/escaped.md',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));
});

describe('resource tools — JS template execution', () => {
  // A `.foam/templates/new-note.js` would otherwise be picked up and
  // executed by `noteCreate`. The MCP server is agent-driven and never
  // trusted, so the JS template must be refused.
  const JS_TEMPLATE_SEED = {
    'existing.md': '# existing',
    '.foam/templates/new-note.js': `
      module.exports = async () => ({
        filepath: 'pwned.md',
        content: 'should not appear',
      });
    `,
  };

  it('create_resource refuses to execute JS templates', () =>
    withMcpServer(JS_TEMPLATE_SEED, async ctx => {
      const result = await ctx.callTool('create_resource', { title: 'hello' });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('untrusted_workspace');
      expect(err.data?.templatePath).toBe(
        '/workspace/.foam/templates/new-note.js'
      );
    }));

  it('create_resource rejects absolute dir outside the workspace', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callTool('create_resource', {
        title: 'shell',
        dir: '/etc/cron.hourly',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('create_resource rejects relative dir that escapes the workspace', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callTool('create_resource', {
        title: 'shell',
        dir: '../../etc',
      });
      expect(result.isError).toBe(true);
      const err = JSON.parse(result.content[0].text!);
      expect(err.code).toBe('invalid_input');
    }));

  it('create_resource accepts a relative dir inside the workspace', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callToolJson<{ uri: string }>(
        'create_resource',
        { title: 'hello', dir: 'subdir' }
      );
      expect(result.uri).toBe('subdir/hello.md');
    }));

  it('create_resource still works when no JS template is present', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callToolJson<{ uri: string; title: string }>(
        'create_resource',
        { title: 'hello' }
      );
      expect(result.uri).toBe('hello.md');
      expect(result.title).toBe('hello');
    }));
});

describe('resource tools (read-only mode)', () => {
  it('write tools are not registered in read-only mode', () =>
    withMcpServer(SEED, { mode: 'read' }, async ctx => {
      const list = await ctx.client.listTools();
      const names = list.tools.map(t => t.name);
      expect(names).not.toContain('update_resource');
      expect(names).not.toContain('create_resource');
      expect(names).not.toContain('delete_resource');
      expect(names).not.toContain('move_resource');
      expect(names).toContain('preview_resource_update');
    }));

  it('read tools still work in read-only mode', () =>
    withMcpServer(SEED, { mode: 'read' }, async ctx => {
      const items = await ctx.callToolJson<Array<unknown>>('list_resources');
      expect(items.length).toBe(3);
    }));
});
