import type { GraphData } from '../protocol';
import {
  GraphModelLink,
  type GraphModel,
  type GraphModelNode,
  type GraphStates,
  type NodeState,
  type LinkState,
} from './types';

export function createGraphModel(graph: GraphData): GraphModel {
  const model: GraphModel = { nodeInfo: {}, links: [] };

  // Copy nodes with initialized neighbors/links
  for (const node of Object.values(graph.nodeInfo)) {
    model.nodeInfo[node.id] = { ...node, neighbors: [], links: [] };
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
          neighbors: [],
          links: [],
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

  // Build neighbor relationships
  for (const link of model.links) {
    const a = model.nodeInfo[GraphModelLink.getNodeId(link.source)];
    const b = model.nodeInfo[GraphModelLink.getNodeId(link.target)];
    if (a && b) {
      a.neighbors.push(b.id);
      b.neighbors.push(a.id);
      a.links.push(link);
      b.links.push(link);
    }
  }

  return model;
}

function collectNeighbors(
  origins: Iterable<string>,
  depth: number,
  nodeInfo: Record<string, GraphModelNode>,
  skipTags = false
): Set<string> {
  const visited = new Set(origins);
  const queue = [...visited].map(id => ({ id, distance: 0 }));
  const maxDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.distance >= maxDepth) continue;

    const node = nodeInfo[current.id];
    if (!node) continue;

    for (const neighborId of node.neighbors) {
      const neighbor = nodeInfo[neighborId];
      if (
        !neighbor ||
        visited.has(neighborId) ||
        (skipTags && neighbor.type === 'tag')
      ) {
        continue;
      }
      visited.add(neighborId);
      queue.push({ id: neighborId, distance: current.distance + 1 });
    }
  }

  return visited;
}

export function getFocusSubset(
  graphModel: GraphModel,
  focusNodeId: string,
  focusDepth: number
): Set<string> {
  const nodeInfo = graphModel.nodeInfo;
  // Tags remain visible but do not become traversal shortcuts.
  const visited = collectNeighbors([focusNodeId], focusDepth, nodeInfo, true);

  for (const nodeId of visited) {
    for (const neighborId of nodeInfo[nodeId]?.neighbors ?? []) {
      if (nodeInfo[neighborId]?.type === 'tag') visited.add(neighborId);
    }
  }

  return visited;
}

export function computeGraphStates(
  graphModel: GraphModel,
  selectedNodes: Set<string>,
  hoverNode: string | null,
  neighborDepth: number
): GraphStates {
  const origins = new Set(selectedNodes);
  if (hoverNode) origins.add(hoverNode);
  const focusNodes = collectNeighbors(
    origins,
    neighborDepth,
    graphModel.nodeInfo
  );

  const nodeStates = new Map<string, NodeState>();
  for (const id of Object.keys(graphModel.nodeInfo)) {
    nodeStates.set(
      id,
      origins.has(id)
        ? 'highlighted'
        : focusNodes.size === 0 || focusNodes.has(id)
        ? 'regular'
        : 'lessened'
    );
  }

  const linkStates = new Map<string, LinkState>();
  for (const link of graphModel.links) {
    const key = GraphModelLink.getKey(link);
    const source = GraphModelLink.getNodeId(link.source);
    const target = GraphModelLink.getNodeId(link.target);
    linkStates.set(
      key,
      focusNodes.size === 0
        ? 'regular'
        : origins.has(source) || origins.has(target)
        ? 'highlighted'
        : 'lessened'
    );
  }

  return { nodeStates, linkStates };
}
