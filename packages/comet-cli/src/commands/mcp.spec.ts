/**
 * End-to-end test for `comet mcp`. Spawns the built CLI as a child process,
 * speaks JSON-RPC over its stdio, and asserts on the responses.
 *
 * Requires `yarn build` to have produced `out/index.js`. The harness in
 * `vitest.e2e.config.ts` runs the build before the test suite.
 *
 * This is a `.spec.ts` (rather than `.test.ts`) because it shells out to
 * a built binary — it covers integration that the in-process unit tests
 * cannot: argv parsing, transport wiring, log routing to stderr, watcher
 * integration, and the `out/` bundle being self-contained.
 */
import { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { withTmpDir } from '../test/test-utils';

const CLI_PATH = path.resolve(__dirname, '../../out/index.js');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CliMcpContext {
  client: Client;
  child: ChildProcess;
  workspaceDir: string;
  /** Concatenated stderr output collected during the session. */
  stderr: () => string;
}

/**
 * Spawns the built CLI's `mcp` subcommand against `workspaceDir`, runs
 * `fn` with a connected `Client`, and tears down the child process.
 */
async function withCliMcpServer<T>(
  workspaceDir: string,
  extraArgs: string[],
  fn: (ctx: CliMcpContext) => Promise<T>
): Promise<T> {
  return withCliMcpArgs(
    ['--workspace', workspaceDir, ...extraArgs],
    workspaceDir,
    fn
  );
}

async function withCliMcpArgs<T>(
  mcpArgs: string[],
  workspaceDir: string,
  fn: (ctx: CliMcpContext) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, 'mcp', ...mcpArgs],
    stderr: 'pipe',
  });

  const stderrChunks: string[] = [];
  const client = new Client(
    { name: 'comet-cli-e2e', version: '0.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);

  const stderrStream = (
    transport as unknown as { stderr?: NodeJS.ReadableStream }
  ).stderr;
  stderrStream?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  const ctx: CliMcpContext = {
    client,
    child: (transport as unknown as { _process: ChildProcess })._process,
    workspaceDir,
    stderr: () => stderrChunks.join(''),
  };

  try {
    return await fn(ctx);
  } finally {
    await client.close();
  }
}

describe('comet mcp (CLI e2e)', () => {
  it(
    'serves per-selection comments without legacy selection actions',
    () =>
      withTmpDir({ 'a.md': '# A\n' }, workspaceDir =>
        withCliMcpServer(workspaceDir, [], async ctx => {
          const list = await ctx.client.listTools();
          const explorer = list.tools.find(
            tool => tool.name === 'show_vault_explorer'
          );
          const resourceUri = 'ui://codex-vault/v7/vault-explorer.html';

          expect(explorer?._meta).toMatchObject({
            ui: { resourceUri },
          });
          expect(explorer?.annotations).toMatchObject({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          });

          const resource = await ctx.client.readResource({ uri: resourceUri });
          const html = resource.contents.find(
            content => 'text' in content
          )?.text;

          expect(html).toContain('id="markdown"');
          expect(html).not.toContain('id="selection-bar"');
          expect(html).toContain('id="selection-menu"');
          expect(html).toContain('id="add-selection"');
          expect(html).toContain('id="annotation-comment"');
          expect(html).toContain('新增選填留言');
          expect(html).not.toContain('id="context-attachment"');
          expect(html).not.toContain('composerAttachmentLayout');
          expect(html).toContain(String.raw`\u5247\u8A3B\u89E3`);
          expect(html).toContain(String.raw`\u4F7F\u7528\u8005\u7559\u8A00`);
          expect(html).not.toContain('openai/modelContext');
          expect(html).not.toContain('source_excerpt');
          expect(html).not.toContain('詢問 Codex');
          expect(html).not.toContain('改善這段');
          expect(html).not.toContain('建立相關筆記');
        })
      ),
    30000
  );

  it(
    'lists tools and calls list_resources against a real workspace',
    () =>
      withTmpDir(
        {
          'a.md': '# Note A\n\nLinks to [[b]].\n',
          'b.md': '# Note B\n',
        },
        workspaceDir =>
          withCliMcpServer(workspaceDir, [], async ctx => {
            const list = await ctx.client.listTools();
            const names = list.tools.map(t => t.name);
            expect(names).toContain('list_resources');
            expect(names).toContain('get_workspace_info');

            const result = (await ctx.client.callTool({
              name: 'list_resources',
              arguments: {},
            })) as { content: Array<{ text: string }> };
            const items = JSON.parse(result.content[0].text) as Array<{
              uri: string;
            }>;
            expect(items.map(i => i.uri).sort()).toEqual(['a.md', 'b.md']);
          })
      ),
    30000
  );

  it(
    'detects newly-created files via the watcher (long-running session)',
    () =>
      withTmpDir({ 'existing.md': '# Existing\n' }, workspaceDir =>
        withCliMcpServer(workspaceDir, [], async ctx => {
          const before = (await ctx.client.callTool({
            name: 'get_workspace_info',
            arguments: {},
          })) as { content: Array<{ text: string }> };
          expect(JSON.parse(before.content[0].text).note_count).toBe(1);

          // Add a file mid-session; chokidar should pick it up and the
          // graph should reflect it on the next tool call.
          writeFileSync(path.join(workspaceDir, 'fresh.md'), '# Fresh\n');

          // Wait for the watcher debounce (100ms) plus chokidar's
          // awaitWriteFinish (50ms) plus filesystem latency. Poll up to 3s
          // rather than guessing one fixed delay.
          let after: { note_count: number } | null = null;
          const deadline = Date.now() + 3000;
          while (Date.now() < deadline) {
            await wait(150);
            const result = (await ctx.client.callTool({
              name: 'get_workspace_info',
              arguments: {},
            })) as { content: Array<{ text: string }> };
            const parsed = JSON.parse(result.content[0].text);
            if (parsed.note_count === 2) {
              after = parsed;
              break;
            }
          }
          expect(after?.note_count).toBe(2);
        })
      ),
    30000
  );

  it(
    'routes its own logs to stderr (stdout reserved for the MCP transport)',
    () =>
      withTmpDir({ 'a.md': '# A\n' }, workspaceDir =>
        withCliMcpServer(workspaceDir, [], async ctx => {
          // Round-trip a request to be sure the server printed startup logs.
          await ctx.client.listTools();
          await wait(100);
          const combined = ctx.stderr();
          expect(combined).toContain('[comet-mcp]');
          expect(combined).toContain('Loading workspace');
        })
      ),
    30000
  );

  it(
    'loads and switches vaults through the persistent registry mode',
    () =>
      withTmpDir(
        {
          'Alpha/alpha.md': '# Alpha\n',
          'Alpha/.obsidian/app.json': '{}',
          'Beta/beta.md': '# Beta\n',
          'Beta/.obsidian/app.json': '{}',
        },
        async rootDir => {
          const obsidianRegistry = path.join(rootDir, 'obsidian.json');
          const registryPath = path.join(rootDir, 'config', 'vaults.json');
          writeFileSync(
            obsidianRegistry,
            JSON.stringify({
              vaults: {
                alpha: {
                  path: path.join(rootDir, 'Alpha'),
                  ts: 20,
                  open: true,
                },
                beta: { path: path.join(rootDir, 'Beta'), ts: 10 },
              },
            })
          );

          await withCliMcpArgs(
            [
              '--vault-registry',
              registryPath,
              '--obsidian-registry',
              obsidianRegistry,
            ],
            rootDir,
            async ctx => {
              expect(await listResourceUris(ctx.client)).toEqual(['alpha.md']);
              await ctx.client.callTool({
                name: 'select_vault',
                arguments: { vault_id: 'beta' },
              });
              expect(await listResourceUris(ctx.client)).toEqual(['beta.md']);
            }
          );
        }
      ),
    30000
  );
});

async function listResourceUris(client: Client): Promise<string[]> {
  const result = (await client.callTool({
    name: 'list_resources',
    arguments: {},
  })) as { content: Array<{ text: string }> };
  const items = JSON.parse(result.content[0].text) as Array<{ uri: string }>;
  return items.map(item => item.uri);
}
