import { z } from 'zod';
import { searchWorkspace } from '@foam/core';
import { serializeSearchMatch } from '../serializers';
import type { ToolRegistrar } from '../server';
import {
  FoamMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
});

export function registerSearchTools(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider
): void {
  register(
    'search_resources',
    {
      description:
        'Full-text search across Markdown bodies, titles, aliases, tags, and properties. Supports Traditional Chinese text.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().optional(),
      },
    },
    async args => {
      const { foam, rootUri, searchIndex } =
        requireWorkspace(workspaceProvider);
      const limit = args.limit ?? 20;
      const metadataMatches = searchWorkspace(foam.workspace, {
        query: args.query,
        limit,
      });
      const contentMatches = await searchIndex.search(args.query, limit);
      const seen = new Set<string>();
      const matches = [...metadataMatches, ...contentMatches]
        .filter(match => {
          const id = match.uri.toString();
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .slice(0, limit);
      return json(matches.map(m => serializeSearchMatch(m, rootUri)));
    }
  );

  register(
    'search_by_property',
    {
      description:
        'Find resources by frontmatter property. Omit `value` to match any value.',
      inputSchema: {
        property: z.string(),
        value: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const matches = searchWorkspace(foam.workspace, {
        properties: [{ key: args.property, value: args.value }],
        limit: args.limit,
      });
      return json(matches.map(m => serializeSearchMatch(m, rootUri)));
    }
  );

}
