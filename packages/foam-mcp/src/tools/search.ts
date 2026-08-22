import { z } from 'zod';
import { searchByProperty } from '@foam/core';
import { serializeSearchMatch } from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import {
  FoamMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

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
      const { rootUri, searchIndex } = requireWorkspace(workspaceProvider);
      const limit = args.limit ?? 20;
      const matches = await searchIndex.search(args.query, limit);
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
      const matches = searchByProperty(
        foam.workspace,
        args.property,
        args.value,
        args.limit
      );
      return json(matches.map(m => serializeSearchMatch(m, rootUri)));
    }
  );
}
