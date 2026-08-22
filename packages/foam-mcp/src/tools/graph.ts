import { z } from 'zod';
import {
  linksData,
  listOrphans,
  listDeadends,
  listPlaceholders,
  listTags,
  resolveNote,
  traverseGraph,
} from '@foam/core';
import {
  parseUriInput,
  serializeLinkEntry,
  serializeNoteSummary,
  serializePlaceholderItem,
  serializeTraversalResult,
  uriToOutputString,
} from '../serializers';
import type { ToolRegistrar } from '../server';
import { json } from '../tool-result';
import {
  FoamMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

const MAX_TRAVERSAL_DEPTH = 5;

export function registerGraphTools(
  register: ToolRegistrar,
  workspaceProvider: FoamMcpWorkspaceProvider,
  readOnly: boolean
) {
  // ─── get_connections ───────────────────────────────────────────────────────
  register(
    'get_connections',
    {
      description:
        'Get outgoing links and/or incoming backlinks for a resource.',
      inputSchema: {
        uri: z.string(),
        direction: z.enum(['links', 'backlinks', 'both']).optional(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const resource = resolveNote(foam.workspace, { uri });
      const data = linksData(foam.workspace, foam.graph, resource);
      const direction = args.direction ?? 'both';
      return json({
        links:
          direction === 'backlinks'
            ? []
            : data.outgoing.map(l => serializeLinkEntry(l, rootUri)),
        backlinks:
          direction === 'links'
            ? []
            : data.incoming.map(l => serializeLinkEntry(l, rootUri)),
      });
    }
  );

  // ─── get_orphans ───────────────────────────────────────────────────────────
  register(
    'get_orphans',
    {
      description:
        'List notes with no incoming or outgoing links. Attachments and images are excluded by default.',
      inputSchema: {
        exclude_types: z.array(z.string()).optional(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const items = listOrphans(foam.workspace, foam.graph, {
        excludeTypes: args.exclude_types,
      });
      return json(items.map(i => serializeNoteSummary(i, rootUri)));
    }
  );

  // ─── get_deadends ──────────────────────────────────────────────────────────
  register(
    'get_deadends',
    {
      description: 'List notes with incoming links but no outgoing links.',
      inputSchema: {
        exclude_types: z.array(z.string()).optional(),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const items = listDeadends(foam.workspace, foam.graph, {
        excludeTypes: args.exclude_types,
      });
      return json(items.map(i => serializeNoteSummary(i, rootUri)));
    }
  );

  // ─── get_placeholders ──────────────────────────────────────────────────────
  register(
    'get_placeholders',
    {
      description:
        'List placeholder URIs (broken wikilinks pointing at nonexistent notes) and the notes that reference each one.',
      inputSchema: {},
    },
    async () => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const items = listPlaceholders(foam.workspace, foam.graph);
      return json(items.map(i => serializePlaceholderItem(i, rootUri)));
    }
  );

  // ─── traverse_graph ────────────────────────────────────────────────────────
  register(
    'traverse_graph',
    {
      description:
        'BFS over the link graph from a starting note. Returns visited nodes (with hop distance) and the edges traversed.',
      inputSchema: {
        uri: z.string(),
        depth: z.number().int().min(0).max(MAX_TRAVERSAL_DEPTH),
        direction: z.enum(['links', 'backlinks', 'both']),
      },
    },
    async args => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const start = parseUriInput(args.uri, rootUri);
      const result = traverseGraph(
        foam.workspace,
        foam.graph,
        start,
        args.depth,
        args.direction
      );
      return json(serializeTraversalResult(result, rootUri));
    }
  );

  // ─── get_workspace_info ────────────────────────────────────────────────────
  register(
    'get_workspace_info',
    {
      description: 'High-level counts for the workspace.',
      inputSchema: {},
    },
    async () => {
      const { foam, rootUri } = requireWorkspace(workspaceProvider);
      const all = foam.workspace.list();
      const noteCount = all.filter(r => r.type === 'note').length;
      const mostConnected = all
        .map(resource => ({
          uri: uriToOutputString(resource.uri, rootUri),
          title: resource.title,
          link_count: foam.graph.getConnections(resource.uri).length,
        }))
        .filter(resource => resource.link_count > 0)
        .sort((a, b) => b.link_count - a.link_count)
        .slice(0, 10);
      return json({
        root_dir: rootUri.path,
        note_count: noteCount,
        attachment_count: all.length - noteCount,
        tag_count: foam.tags.tags.size,
        orphan_count: listOrphans(foam.workspace, foam.graph).length,
        placeholder_count: foam.graph.placeholders.size,
        connection_count: foam.graph.getAllConnections().length,
        resource_count: all.length,
        most_connected: mostConnected,
        most_used_tags: listTags(foam.tags, { limit: 10 }),
        read_only: readOnly,
      });
    }
  );
}
