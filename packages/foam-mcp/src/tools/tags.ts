import { z } from 'zod';
import {
  FoamError,
  addTagsToFrontmatter,
  removeTagsFromFrontmatter,
  listNotes,
  listTags,
  renameTag,
} from '@foam/core';
import {
  parseUriInput,
  serializeNoteItem,
  uriToOutputString,
} from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import {
  FoamMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

export function registerTagTools(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider,
  readOnly: boolean
) {
  // ─── list_tags ─────────────────────────────────────────────────────────────
  register(
    'list_tags',
    {
      description: 'List all tags with usage counts.',
      inputSchema: {
        prefix: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async args => {
      const { foam } = requireWorkspace(workspaceProvider);
      const tags = listTags(foam.tags, {
        prefix: args.prefix,
        limit: args.limit,
      });
      return json(tags);
    }
  );

  // ─── search_by_tag ─────────────────────────────────────────────────────────
  register(
    'search_by_tag',
    {
      description: 'Find resources tagged with the given tag.',
      inputSchema: {
        tag: z.string(),
        limit: z.number().int().positive().optional(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const cleanTag = args.tag.startsWith('#') ? args.tag.slice(1) : args.tag;
      const matches = listNotes(foam.workspace, {
        tag: cleanTag,
        limit: args.limit,
      });
      return json(matches.map(match => serializeNoteItem(match, rootUri)));
    }
  );

  if (readOnly) {
    return;
  }

  // ─── add_tags ──────────────────────────────────────────────────────────────
  register(
    'add_tags',
    {
      description:
        "Add tags to a note's frontmatter (deduplicating). Returns the resulting tag list.",
      inputSchema: {
        uri: z.string(),
        tags: z.array(z.string()).min(1),
      },
    },
    async args => {
      const { dataStore, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const existing = await dataStore.read(uri);
      if (existing === null) {
        throw new FoamError(
          'resource_not_found',
          `Resource not found: ${args.uri}`,
          { uri: args.uri }
        );
      }
      const { content, tags } = addTagsToFrontmatter(existing, args.tags);
      await dataStore.write(uri, content);
      return json({ uri: uriToOutputString(uri, rootUri), tags });
    }
  );

  // ─── remove_tags ───────────────────────────────────────────────────────────
  register(
    'remove_tags',
    {
      description: "Remove tags from a note's frontmatter.",
      inputSchema: {
        uri: z.string(),
        tags: z.array(z.string()).min(1),
      },
    },
    async args => {
      const { dataStore, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const existing = await dataStore.read(uri);
      if (existing === null) {
        throw new FoamError(
          'resource_not_found',
          `Resource not found: ${args.uri}`,
          { uri: args.uri }
        );
      }
      const { content, tags } = removeTagsFromFrontmatter(existing, args.tags);
      await dataStore.write(uri, content);
      return json({ uri: uriToOutputString(uri, rootUri), tags });
    }
  );

  // ─── rename_tag ────────────────────────────────────────────────────────────
  register(
    'rename_tag',
    {
      description:
        'Rename a tag across the entire workspace. Pass `force: true` to merge into an existing target tag.',
      inputSchema: {
        old_tag: z.string(),
        new_tag: z.string(),
        force: z.boolean().optional(),
      },
    },
    async args => {
      const { foam, dataStore } = requireWorkspace(workspaceProvider);
      const result = await renameTag(
        foam.tags,
        dataStore,
        args.old_tag,
        args.new_tag,
        args.force === true
      );
      return json({
        old_tag: result.old_tag,
        new_tag: result.new_tag,
        updated_resources: result.updated_notes,
      });
    }
  );
}
