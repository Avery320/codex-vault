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

  it('move_resource moves a note and updates inbound wikilinks', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{
        old_uri: string;
        new_uri: string;
        updated_links: number;
      }>('move_resource', {
        uri: 'b.md',
        new_path: 'renamed.md',
      });

      expect(result.old_uri).toBe('b.md');
      expect(result.new_uri).toBe('renamed.md');
      expect(result.updated_links).toBe(1);
      expect(
        (await ctx.callToolJson<{ content: string }>('read_resource', {
          uri: 'a.md',
        })).content
      ).toContain('[[renamed]]');
      const resources = await ctx.callToolJson<Array<{ uri: string }>>(
        'list_resources'
      );
      expect(resources.map(resource => resource.uri).sort()).toEqual([
        'a.md',
        'renamed.md',
        'subdir/c.md',
      ]);
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
      const resources = await ctx.callToolJson<Array<{ uri: string }>>(
        'list_resources'
      );
      expect(resources.map(resource => resource.uri)).not.toContain(
        'subdir/c.md'
      );
    }));
});

describe('resource tools — path traversal containment', () => {
  it('rejects outside paths for every read and write operation', () =>
    withMcpServer(SEED, async ctx => {
      const attempts: Array<[string, Record<string, unknown>]> = [
        ['read_resource', { uri: '/etc/passwd' }],
        ['read_resource', { uri: 'file:///etc/passwd' }],
        ['read_resource', { uri: '../../etc/passwd' }],
        [
          'update_resource',
          {
            uri: '/tmp/path-traversal-write.txt',
            content: 'pwned',
            expected_content_sha256: sha256('irrelevant'),
          },
        ],
        ['delete_resource', { uri: '/etc/passwd', confirm: true }],
        [
          'move_resource',
          { uri: '/etc/passwd', new_path: 'renamed.md' },
        ],
        [
          'move_resource',
          { uri: 'a.md', new_path: '/etc/escaped.md' },
        ],
        ['create_resource', { title: 'shell', dir: '/etc/cron.hourly' }],
        ['create_resource', { title: 'shell', dir: '../../etc' }],
      ];

      for (const [tool, args] of attempts) {
        const result = await ctx.callTool(tool, args);
        expect(result.isError, tool).toBe(true);
        expect(JSON.parse(result.content[0].text!).code, tool).toBe(
          'invalid_input'
        );
      }
    }));

  it('read_resource still accepts absolute paths inside the workspace', () =>
    withMcpServer(SEED, async ctx => {
      const result = await ctx.callToolJson<{ content: string }>(
        'read_resource',
        { uri: '/workspace/a.md' }
      );
      expect(result.content).toBe(SEED['a.md']);
    }));
});

describe('resource tools — note creation', () => {
  it('create_resource applies Markdown template variables and filepath metadata', () =>
    withMcpServer(
      {
        'existing.md': '# existing',
        '.comet/templates/new-note.md': `---
comet_template:
  filepath: notes/\${COMET_DATE_FORMAT:[dated]}/$COMET_SLUG.md
---
# $COMET_TITLE (\${COMET_DATE_FORMAT:[created]})
`,
      },
      async ctx => {
        const result = await ctx.callToolJson<{ uri: string }>(
          'create_resource',
          { title: 'Hello Note' }
        );
        expect(result.uri).toBe('notes/dated/hello-note.md');
        expect(
          (
            await ctx.callToolJson<{ content: string }>('read_resource', {
              uri: result.uri,
            })
          ).content
        ).toBe('# Hello Note (created)\n');
      }
    ));

  it('create_resource rejects legacy transforms before writing a note', () =>
    withMcpServer(
      {
        '.comet/templates/new-note.md': '# ${COMET_TITLE/(.*)/<$1>/}\n',
      },
      async ctx => {
        const expression = '${COMET_TITLE/(.*)/<$1>/}';
        const result = await ctx.callTool('create_resource', {
          title: 'hello',
        });
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text!)).toMatchObject({
          code: 'invalid_input',
          data: {
            expression,
            template: '.comet/templates/new-note.md',
          },
        });
        expect(await ctx.dataStore.exists(ctx.rootUri.joinPath('hello.md'))).toBe(
          false
        );
      }
    ));

  it('create_resource rejects a Markdown template path outside the vault', () =>
    withMcpServer(
      {
        '.comet/templates/new-note.md': `---
comet_template:
  filepath: ../../outside.md
---
# unsafe
`,
      },
      async ctx => {
        const result = await ctx.callTool('create_resource', {
          title: 'hello',
        });
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text!).code).toBe('invalid_input');
      }
    ));

  it('create_resource accepts a relative dir inside the workspace', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callToolJson<{ uri: string }>(
        'create_resource',
        { title: 'hello', dir: 'subdir' }
      );
      expect(result.uri).toBe('subdir/hello.md');
    }));

  it('create_resource works without a Markdown template', () =>
    withMcpServer({ 'existing.md': '# existing' }, async ctx => {
      const result = await ctx.callToolJson<{ uri: string; title: string }>(
        'create_resource',
        { title: 'hello' }
      );
      expect(result.uri).toBe('hello.md');
      expect(result.title).toBe('hello');
    }));
});
