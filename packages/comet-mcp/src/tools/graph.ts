import { z } from 'zod';
import {
  linksData,
  listOrphans,
  listDeadends,
  listPlaceholders,
  listTags,
  resolveNote,
  traverseGraph,
} from '@comet/core';
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
  CometMcpWorkspaceProvider,
  requireWorkspace,
} from '../workspace-context';

const MAX_TRAVERSAL_DEPTH = 5;

export function registerGraphTools(
  register: ToolRegistrar,
  workspaceProvider: CometMcpWorkspaceProvider,
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const uri = parseUriInput(args.uri, rootUri);
      const resource = resolveNote(comet.workspace, { uri });
      const data = linksData(comet.workspace, comet.graph, resource);
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const items = listOrphans(comet.workspace, comet.graph, {
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const items = listDeadends(comet.workspace, comet.graph, {
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const items = listPlaceholders(comet.workspace, comet.graph);
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const start = parseUriInput(args.uri, rootUri);
      const result = traverseGraph(
        comet.workspace,
        comet.graph,
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
      const { comet, rootUri } = requireWorkspace(workspaceProvider);
      const all = comet.workspace.list();
      const noteCount = all.filter(r => r.type === 'note').length;
      const mostConnected = all
        .map(resource => ({
          uri: uriToOutputString(resource.uri, rootUri),
          title: resource.title,
          link_count: comet.graph.getConnections(resource.uri).length,
        }))
        .filter(resource => resource.link_count > 0)
        .sort((a, b) => b.link_count - a.link_count)
        .slice(0, 10);
      return json({
        root_dir: rootUri.path,
        note_count: noteCount,
        attachment_count: all.length - noteCount,
        tag_count: comet.tags.tags.size,
        orphan_count: listOrphans(comet.workspace, comet.graph).length,
        placeholder_count: comet.graph.placeholders.size,
        connection_count: comet.graph.getAllConnections().length,
        resource_count: all.length,
        most_connected: mostConnected,
        most_used_tags: listTags(comet.tags, { limit: 10 }),
        read_only: readOnly,
      });
    }
  );
}
