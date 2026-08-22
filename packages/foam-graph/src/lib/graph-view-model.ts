import { GraphModelLink } from './types';
import type {
  GraphModel,
  GraphModelNode,
  ResolvedStyle,
} from './types';

export interface VisibleGraph {
  nodeInfo: Record<string, GraphModelNode>;
  nodes: Array<{ id: string }>;
  links: GraphModelLink[];
}

const ALWAYS_KEEP_TYPES = new Set(['tag', 'attachment', 'image', 'placeholder']);
const BUILTIN_TYPES = new Set([...ALWAYS_KEEP_TYPES, 'note']);

export function computeVisibleGraph(
  graphModel: GraphModel,
  showNodesOfType: Record<string, boolean>
): VisibleGraph {
  const nodeIds = new Set(
    Object.values(graphModel.nodeInfo)
      .filter(node => showNodesOfType[node.type])
      .map(node => node.id)
  );

  const nodeInfo: Record<string, GraphModelNode> = {};
  const nodes = [...nodeIds].map(id => {
    nodeInfo[id] = graphModel.nodeInfo[id];
    return { id };
  });
  const links = graphModel.links.filter(
    link =>
      nodeIds.has(GraphModelLink.getNodeId(link.source)) &&
      nodeIds.has(GraphModelLink.getNodeId(link.target))
  );

  return { nodeInfo, nodes, links };
}

export function deriveNodeTypeFilters(
  graphModel: GraphModel,
  style: ResolvedStyle,
  current: Record<string, boolean>
): Record<string, boolean> {
  const types = new Set([
    ...Object.values(graphModel.nodeInfo).map(node => node.type),
    ...Object.keys(style.node).filter(type => !BUILTIN_TYPES.has(type)),
  ]);
  const next = { ...current };

  for (const type of types) {
    if (next[type] == null) {
      next[type] = type !== 'image' && type !== 'attachment';
    }
  }

  for (const type of Object.keys(next)) {
    if (!types.has(type) && !ALWAYS_KEEP_TYPES.has(type)) {
      delete next[type];
    }
  }

  return next;
}
