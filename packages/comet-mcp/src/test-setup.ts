import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  bootstrap,
  createMarkdownParser,
  Comet,
  IDataStore,
  MarkdownResourceProvider,
  URI,
} from '@comet/core';
import { InMemoryDataStore } from '@comet/core/test';
import { CometMcpServer, CometMcpServerMode } from './server';
import {
  createWorkspaceContext,
  StaticWorkspaceProvider,
} from './workspace-context';
import { VaultChangeFeed } from './vault-change-feed';

export interface McpTestContext {
  client: Client;
  server: CometMcpServer;
  comet: Comet;
  dataStore: InMemoryDataStore;
  rootUri: URI;
  changeFeed: VaultChangeFeed;
  callTool: (
    name: string,
    args?: Record<string, unknown>
  ) => Promise<{
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
  }>;
  /** Parses the JSON in the first text content of a tool response. */
  callToolJson: <T = unknown>(
    name: string,
    args?: Record<string, unknown>
  ) => Promise<T>;
}

export interface McpTestOptions {
  rootPath?: string;
  /** Server mode. Defaults to `'read-write'` so existing tests exercise the
   *  full tool surface without opting in. */
  mode?: CometMcpServerMode;
}

/**
 * Builds an in-memory `Comet` + `CometMcpServer` + `Client` triple wired over
 * `InMemoryTransport`, runs `fn`, and tears the whole thing down — even if
 * `fn` throws.
 *
 * Tests should always go through this helper rather than constructing a
 * server by hand: it owns the lifecycle and guarantees `client.close()` /
 * `server.close()` run on every code path.
 *
 * Usage:
 *   await withMcpServer(SEED, async ctx => {
 *     const items = await ctx.callToolJson('list_resources');
 *     // ...
 *   });
 */
export async function withMcpServer<T>(
  seed: Record<string, string>,
  fn: (ctx: McpTestContext) => Promise<T>
): Promise<T>;
export async function withMcpServer<T>(
  seed: Record<string, string>,
  opts: McpTestOptions,
  fn: (ctx: McpTestContext) => Promise<T>
): Promise<T>;
export async function withMcpServer<T>(
  seed: Record<string, string>,
  optsOrFn: McpTestOptions | ((ctx: McpTestContext) => Promise<T>),
  maybeFn?: (ctx: McpTestContext) => Promise<T>
): Promise<T> {
  const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn!;
  const opts = typeof optsOrFn === 'function' ? {} : optsOrFn;

  const rootPath = opts.rootPath ?? '/workspace';
  const rootUri = URI.file(rootPath);
  const dataStore = new InMemoryDataStore();

  for (const [relative, content] of Object.entries(seed)) {
    dataStore.set(rootUri.joinPath(relative), content);
  }

  const parser = createMarkdownParser();
  const provider = new MarkdownResourceProvider(
    dataStore as IDataStore,
    parser,
    ['.md']
  );

  const comet = await bootstrap(
    [rootUri],
    { isMatch: () => true },
    undefined,
    dataStore as IDataStore,
    parser,
    [provider],
    '.md',
    'off'
  );

  const workspaceContext = createWorkspaceContext({
    comet,
    rootUri,
  });
  const workspaceProvider = new StaticWorkspaceProvider(workspaceContext);
  const server = new CometMcpServer({
    workspaceProvider,
    mode: opts.mode ?? 'read-write',
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'comet-mcp-test', version: '0.0.0' },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  const callTool = (name: string, args?: Record<string, unknown>) =>
    client.callTool({ name, arguments: args ?? {} }) as Promise<{
      isError?: boolean;
      content: Array<{ type: string; text?: string }>;
    }>;

  const callToolJson = async <U = unknown>(
    name: string,
    args?: Record<string, unknown>
  ): Promise<U> => {
    const result = await callTool(name, args);
    if (result.isError) {
      throw new Error(
        `Tool ${name} returned error: ${result.content[0]?.text ?? '<no text>'}`
      );
    }
    const text = result.content[0]?.text;
    if (!text) throw new Error(`Tool ${name} returned no text content`);
    return JSON.parse(text) as U;
  };

  const ctx: McpTestContext = {
    client,
    server,
    comet,
    dataStore,
    rootUri,
    changeFeed: workspaceContext.changeFeed,
    callTool,
    callToolJson,
  };

  try {
    return await fn(ctx);
  } finally {
    await client.close();
    await server.close();
  }
}
