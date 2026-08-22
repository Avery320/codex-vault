import type { Resource } from '../model/note';
import type { Connection } from '../model/graph';
import type { URI } from '../model/uri';

export interface GraphNodeData {
  id: string;
  type: string;
  title: string;
  properties: { color?: string; [key: string]: unknown };
  tags: Array<{ label: string }>;
}

export interface BuiltGraphData {
  nodeInfo: Record<string, GraphNodeData>;
  links: Array<{ source: string; target: string }>;
}

export function buildGraphData(
  resources: Resource[],
  connections: Connection[],
  resourceToId: (uri: URI) => string
): BuiltGraphData {
  const nodeInfo: Record<string, GraphNodeData> = {};
  const links = new Map<string, { source: string; target: string }>();

  for (const resource of resources) {
    const id = resourceToId(resource.uri);
    nodeInfo[id] = {
      id,
      type: resource.type,
      title:
        resource.type === 'note'
          ? resource.title
          : resource.uri.getBasename(),
      properties: resource.properties ?? {},
      tags: resource.tags.map(tag => ({ label: tag.label })),
    };
  }

  for (const connection of connections) {
    const sourceId = resourceToId(connection.source);
    const isPlaceholder = connection.target.isPlaceholder();
    const targetId = resourceToId(connection.target);

    if (isPlaceholder) {
      if (!(targetId in nodeInfo)) {
        nodeInfo[targetId] = {
          id: targetId,
          type: 'placeholder',
          title: targetId,
          properties: {},
          tags: [],
        };
      }
    }

    links.set(`${sourceId}->${targetId}`, { source: sourceId, target: targetId });
  }

  return { nodeInfo, links: Array.from(links.values()) };
}
