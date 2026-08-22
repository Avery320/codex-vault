import { GraphModelLink } from './types';
import type {
  GraphModel,
  GraphModelNode,
} from './types';

export interface VisibleGraph {
  nodeInfo: Record<string, GraphModelNode>;
  nodes: Array<{ id: string }>;
  links: GraphModelLink[];
}

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
