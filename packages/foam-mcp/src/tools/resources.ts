import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  Foam,
  FoamError,
  IDataStore,
  URI,
  listNotes,
  noteShowData,
  noteCreate,
  noteDelete,
  noteMove,
  resolveNote,
  mergeFrontmatter,
} from '@foam/core';
import {
  parseUriInput,
  uriToOutputString,
  serializeNoteItem,
  serializeNoteDetail,
} from '../serializers';
import type { ToolRegistrar } from '../server';

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
});

const sha256 = (content: string) =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const splitLines = (content: string) => content.split('\n');

function createUnifiedDiff(
  uri: string,
  currentContent: string,
  nextContent: string
): string {
  if (currentContent === nextContent) return '';

  const current = splitLines(currentContent);
  const next = splitLines(nextContent);
  let prefix = 0;
  while (
    prefix < current.length &&
    prefix < next.length &&
    current[prefix] === next[prefix]
  ) {
    prefix += 1;
  }

  let currentSuffix = current.length;
  let nextSuffix = next.length;
  while (
    currentSuffix > prefix &&
    nextSuffix > prefix &&
    current[currentSuffix - 1] === next[nextSuffix - 1]
  ) {
    currentSuffix -= 1;
    nextSuffix -= 1;
  }

  const contextStart = Math.max(0, prefix - 3);
  const currentContextEnd = Math.min(current.length, currentSuffix + 3);
  const nextContextEnd = Math.min(next.length, nextSuffix + 3);
  const oldCount = currentContextEnd - contextStart;
  const newCount = nextContextEnd - contextStart;
  const lines = [
    `--- a/${uri}`,
    `+++ b/${uri}`,
    `@@ -${contextStart + 1},${oldCount} +${contextStart + 1},${newCount} @@`,
    ...current.slice(contextStart, prefix).map(line => ` ${line}`),
    ...current.slice(prefix, currentSuffix).map(line => `-${line}`),
    ...next.slice(prefix, nextSuffix).map(line => `+${line}`),
    ...next.slice(nextSuffix, nextContextEnd).map(line => ` ${line}`),
  ];
  return `${lines.join('\n')}\n`;
}

function buildNextContent(
  currentContent: string,
  args: {
    content?: string;
    properties?: Record<string, unknown>;
    merge_properties?: boolean;
  }
): string {
  const base = args.content ?? currentContent;
  return args.properties
    ? mergeFrontmatter(
        base,
        args.properties,
        args.merge_properties === false ? 'replace' : 'merge'
      )
    : base;
}

export function registerResourceTools(
  register: ToolRegistrar,
  foam: Foam,
  dataStore: IDataStore,
  rootUri: URI,
  opts: { readOnly?: boolean } = {}
) {
  const { readOnly = false } = opts;
  // ─── list_resources ────────────────────────────────────────────────────────
  register(
    'list_resources',
    {
      description:
        'List notes in the workspace, optionally filtered by type and/or tag.',
      inputSchema: {
        type: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async args => {
      const items = listNotes(foam.workspace, {
        type: args.type,
        tags: args.tag ? [args.tag] : undefined,
        limit: args.limit,
      });
      return json(items.map(i => serializeNoteItem(i, rootUri)));
    }
  );

  // ─── get_resource ──────────────────────────────────────────────────────────
  register(
    'get_resource',
    {
      description:
        'Get full metadata for a single resource, including outgoing/incoming link identifiers. Provide either `uri` or `identifier`.',
      inputSchema: {
        uri: z.string().optional(),
        identifier: z.string().optional(),
      },
    },
    async args => {
      if (!args.uri && !args.identifier) {
        throw new FoamError(
          'invalid_input',
          'Provide either `uri` or `identifier`.'
        );
      }
      const ref = args.uri
        ? { uri: parseUriInput(args.uri, rootUri) }
        : { identifier: args.identifier! };
      const resource = resolveNote(foam.workspace, ref);
      const detail = noteShowData(foam.workspace, foam.graph, resource, {
        includeLinks: true,
      });
      return json(serializeNoteDetail(detail, rootUri));
    }
  );

  // ─── read_resource ─────────────────────────────────────────────────────────
  register(
    'read_resource',
    {
      description: 'Read the raw markdown content of a resource.',
      inputSchema: {
        uri: z.string(),
      },
    },
    async args => {
      const uri = parseUriInput(args.uri, rootUri);
      const content = await dataStore.read(uri);
      if (content === null) {
        throw new FoamError(
          'resource_not_found',
          `Resource not found: ${args.uri}`,
          { uri: args.uri }
        );
      }
      return json({
        uri: uriToOutputString(uri, rootUri),
        content,
        content_sha256: sha256(content),
      });
    }
  );

  // ─── preview_resource_update ──────────────────────────────────────────────
  register(
    'preview_resource_update',
    {
      description:
        'Preview a Markdown update without writing it. Returns a unified diff and the SHA-256 hash required by update_resource.',
      inputSchema: {
        uri: z.string(),
        content: z.string().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        merge_properties: z.boolean().optional(),
      },
    },
    async args => {
      if (args.content === undefined && args.properties === undefined) {
        throw new FoamError(
          'invalid_input',
          'Provide `content` and/or `properties`.'
        );
      }
      const uri = parseUriInput(args.uri, rootUri);
      const currentContent = await dataStore.read(uri);
      if (currentContent === null) {
        throw new FoamError(
          'resource_not_found',
          `Resource not found: ${args.uri}`,
          { uri: args.uri }
        );
      }
      const nextContent = buildNextContent(currentContent, args);
      const outputUri = uriToOutputString(uri, rootUri);
      return json({
        uri: outputUri,
        changed: currentContent !== nextContent,
        expected_content_sha256: sha256(currentContent),
        next_content_sha256: sha256(nextContent),
        diff: createUnifiedDiff(outputUri, currentContent, nextContent),
      });
    }
  );

  if (readOnly) {
    return;
  }

  // ─── create_resource ───────────────────────────────────────────────────────
  register(
    'create_resource',
    {
      description:
        'Create a new note. Errors if the destination already exists.',
      inputSchema: {
        title: z.string().optional(),
        dir: z.string().optional(),
        path: z.string().optional(),
        content: z.string().optional(),
        properties: z.record(z.string(), z.string()).optional(),
      },
    },
    async args => {
      if (args.path) {
        const uri = parseUriInput(args.path, rootUri);
        if (!uri.path.toLocaleLowerCase().endsWith('.md')) {
          throw new FoamError('invalid_input', '`path` must end with `.md`.');
        }
        if ((await dataStore.read(uri)) !== null) {
          throw new FoamError('resource_exists', `Resource already exists.`, {
            uri: args.path,
          });
        }
        const filename = uri.path.split('/').at(-1) ?? 'untitled.md';
        const title = args.title ?? filename.replace(/\.md$/i, '');
        const base = args.content ?? `# ${title}\n`;
        const content = args.properties
          ? mergeFrontmatter(base, args.properties, 'merge')
          : base;
        await dataStore.write(uri, content);
        await foam.workspace.fetchAndSet(uri);
        return json({
          uri: uriToOutputString(uri, rootUri),
          id: foam.workspace.getIdentifier(uri),
          title,
          content_sha256: sha256(content),
        });
      }

      // MCP is agent-driven; never grant JS-template execution rights.
      const result = await noteCreate(
        foam,
        dataStore,
        {
          title: args.title,
          dir: args.dir,
          properties: args.properties,
        },
        false
      );
      if (args.content !== undefined) {
        const content = args.properties
          ? mergeFrontmatter(args.content, args.properties, 'merge')
          : args.content;
        await dataStore.write(result.uri, content);
        await foam.workspace.fetchAndSet(result.uri);
      }
      const resource = foam.workspace.find(result.uri);
      const content = await dataStore.read(result.uri);
      return json({
        uri: uriToOutputString(result.uri, rootUri),
        id: result.id,
        title: resource?.title ?? args.title ?? '',
        content_sha256: content === null ? undefined : sha256(content),
      });
    }
  );

  // ─── update_resource ───────────────────────────────────────────────────────
  register(
    'update_resource',
    {
      description:
        'Apply a note update after preview_resource_update. The write is rejected if the note has changed since the preview.',
      inputSchema: {
        uri: z.string(),
        content: z.string().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        merge_properties: z.boolean().optional(),
        expected_content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      },
    },
    async args => {
      const uri = parseUriInput(args.uri, rootUri);
      if (args.content === undefined && args.properties === undefined) {
        throw new FoamError(
          'invalid_input',
          'Provide `content` and/or `properties`.'
        );
      }
      const currentContent = await dataStore.read(uri);
      if (currentContent === null) {
        throw new FoamError(
          'resource_not_found',
          `Resource not found: ${args.uri}`,
          { uri: args.uri }
        );
      }
      const currentHash = sha256(currentContent);
      if (currentHash !== args.expected_content_sha256) {
        throw new FoamError(
          'conflict',
          'The note changed after it was previewed. Preview the update again before applying it.',
          {
            uri: args.uri,
            expected_content_sha256: args.expected_content_sha256,
            current_content_sha256: currentHash,
          }
        );
      }
      const nextContent = buildNextContent(currentContent, args);
      await dataStore.write(uri, nextContent);
      await foam.workspace.fetchAndSet(uri);
      return json({
        uri: uriToOutputString(uri, rootUri),
        previous_content_sha256: currentHash,
        content_sha256: sha256(nextContent),
      });
    }
  );

  // ─── delete_resource ───────────────────────────────────────────────────────
  register(
    'delete_resource',
    {
      description:
        'Delete a note. Set `confirm: true` to proceed. By default the note is moved to .foam/trash; pass `permanent: true` to hard-delete.',
      inputSchema: {
        uri: z.string(),
        confirm: z.boolean().optional(),
        permanent: z.boolean().optional(),
      },
    },
    async args => {
      if (args.confirm !== true) {
        throw new FoamError(
          'invalid_input',
          'Pass `confirm: true` to delete the resource.'
        );
      }
      const uri = parseUriInput(args.uri, rootUri);
      const resource = resolveNote(foam.workspace, { uri });
      const result = await noteDelete(foam.workspace, dataStore, resource, {
        permanent: args.permanent === true,
      });
      return json({
        deleted: true,
        trashed: result.trashed,
        location: uriToOutputString(result.uri, rootUri),
      });
    }
  );

  // ─── move_resource ─────────────────────────────────────────────────────────
  register(
    'move_resource',
    {
      description:
        'Move/rename a note. Updates inbound wikilinks across the workspace.',
      inputSchema: {
        uri: z.string(),
        new_path: z.string(),
      },
    },
    async args => {
      const oldUri = parseUriInput(args.uri, rootUri);
      const newUri = parseUriInput(args.new_path, rootUri);
      const resource = resolveNote(foam.workspace, { uri: oldUri });
      const result = await noteMove(
        foam.workspace,
        foam.graph,
        dataStore,
        resource,
        newUri
      );
      return json({
        old_uri: uriToOutputString(result.old_uri, rootUri),
        new_uri: uriToOutputString(result.new_uri, rootUri),
        updated_links: result.updated_links,
      });
    }
  );
}
