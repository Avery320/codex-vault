import type { GraphData } from '../protocol';
import {
  GraphModelLink,
  type GraphModel,
  type GraphStates,
  type NodeState,
  type LinkState,
} from './types';

export function createGraphModel(graph: GraphData): GraphModel {
  const model: GraphModel = { nodeInfo: {}, links: [] };

  // Copy nodes so graph rendering never mutates the caller's data.
  for (const node of Object.values(graph.nodeInfo)) {
    model.nodeInfo[node.id] = { ...node };
  }

  // Copy links
  model.links = graph.links.map(l => ({ ...l }));

  // Process tags: each explicit tag is one node connected to its note.
  for (const node of Object.values(model.nodeInfo)) {
    if (!node.tags?.length) continue;
    for (const tag of node.tags) {
      if (!model.nodeInfo[tag.label]) {
        model.nodeInfo[tag.label] = {
          id: tag.label,
          title: '#' + tag.label,
          type: 'tag',
          properties: {},
          tags: [],
        };
      }
      model.links.push({ source: tag.label, target: node.id });
    }
  }

  // Deduplicate links
  const seen = new Set<string>();
  model.links = model.links.filter(link => {
    const key = GraphModelLink.getKey(link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return model;
}

export function computeGraphStates(
  graphModel: GraphModel,
  selectedNodes: Set<string>,
  hoverNode: string | null
): GraphStates {
  const highlighted = new Set(selectedNodes);
  if (hoverNode) highlighted.add(hoverNode);

  const nodeStates = new Map<string, NodeState>();
  for (const id of Object.keys(graphModel.nodeInfo)) {
    nodeStates.set(id, highlighted.has(id) ? 'highlighted' : 'regular');
  }

  const linkStates = new Map<string, LinkState>();
  for (const link of graphModel.links) {
    const key = GraphModelLink.getKey(link);
    const source = GraphModelLink.getNodeId(link.source);
    const target = GraphModelLink.getNodeId(link.target);
    linkStates.set(
      key,
      highlighted.has(source) || highlighted.has(target)
        ? 'highlighted'
        : 'regular'
    );
  }

  return { nodeStates, linkStates };
}
