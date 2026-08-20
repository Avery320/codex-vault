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

export function getNeighbors(
  nodeId: string,
  depth: number,
  nodeInfo: Record<string, GraphModelNode>
): Set<string> {
  const visited = new Set([nodeId]);
  const queue = [{ id: nodeId, distance: 0 }];
  const maxDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.distance >= maxDepth) continue;

    const node = nodeInfo[current.id];
    if (!node) continue;

    for (const neighborId of node.neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, distance: current.distance + 1 });
    }
  }

  return visited;
}

export function computeFocusSets(
  selectedNodes: Set<string>,
  hoverNode: string | null,
  neighborDepth: number,
  nodeInfo: Record<string, GraphModelNode>,
  links: GraphModelLink[]
): { focusNodes: Set<string>; focusLinks: Set<GraphModelLink> } {
  const focusNodes = new Set<string>();
  const focusLinks = new Set<GraphModelLink>();

  const originNodes = [...selectedNodes, hoverNode].filter(Boolean) as string[];

  for (const nodeId of originNodes) {
    const neighbors = getNeighbors(nodeId, neighborDepth, nodeInfo);
    for (const n of neighbors) focusNodes.add(n);
  }

  const originSet = new Set(originNodes);
  for (const link of links) {
    const src = GraphModelLink.getNodeId(link.source);
    const tgt = GraphModelLink.getNodeId(link.target);
    if (originSet.has(src) || originSet.has(tgt)) {
      focusLinks.add(link);
    }
  }

  return { focusNodes, focusLinks };
}

export function getNodeState(
  nodeId: string,
  selectedNodes: Set<string>,
  hoverNode: string | null,
  focusNodes: Set<string>
): 'regular' | 'highlighted' | 'lessened' {
  if (selectedNodes.has(nodeId) || hoverNode === nodeId) return 'highlighted';
  if (focusNodes.size === 0 || focusNodes.has(nodeId)) return 'regular';
  return 'lessened';
}

export function getLinkState(
  link: GraphModelLink,
  focusNodes: Set<string>,
  focusLinks: Set<GraphModelLink>
): 'regular' | 'highlighted' | 'lessened' {
  if (focusNodes.size === 0) return 'regular';
  const src = GraphModelLink.getNodeId(link.source);
  const tgt = GraphModelLink.getNodeId(link.target);
  for (const fl of focusLinks) {
    if (
      GraphModelLink.getNodeId(fl.source) === src &&
      GraphModelLink.getNodeId(fl.target) === tgt
    ) {
      return 'highlighted';
    }
  }
  return 'lessened';
}

export function getFocusSubset(
  graphModel: GraphModel,
  focusNodeId: string,
  focusDepth: number
): Set<string> {
  const nodeInfo = graphModel.nodeInfo;
  const visited = new Set([focusNodeId]);
  const queue = [{ id: focusNodeId, distance: 0 }];
  const maxDepth = Number.isFinite(focusDepth)
    ? Math.max(0, Math.floor(focusDepth))
    : 0;

  // Local depth follows note links only. Tags are displayed for the notes in
  // scope, but never become shortcuts between otherwise unrelated notes.
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.distance >= maxDepth) continue;

    for (const neighborId of nodeInfo[current.id]?.neighbors ?? []) {
      const neighbor = nodeInfo[neighborId];
      if (!neighbor || neighbor.type === 'tag' || visited.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      queue.push({ id: neighborId, distance: current.distance + 1 });
    }
  }

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
  const { focusNodes, focusLinks } = computeFocusSets(
    selectedNodes,
    hoverNode,
    neighborDepth,
    graphModel.nodeInfo,
    graphModel.links
  );

  const nodeStates = new Map<string, NodeState>();
  for (const id of Object.keys(graphModel.nodeInfo)) {
    nodeStates.set(id, getNodeState(id, selectedNodes, hoverNode, focusNodes));
  }

  const highlightedLinks = new Set(
    [...focusLinks].map(link => GraphModelLink.getKey(link))
  );
  const linkStates = new Map<string, LinkState>();
  for (const link of graphModel.links) {
    const key = GraphModelLink.getKey(link);
    if (focusNodes.size === 0) {
      linkStates.set(key, 'regular');
    } else {
      linkStates.set(
        key,
        highlightedLinks.has(key) ? 'highlighted' : 'lessened'
      );
    }
  }

  return { nodeStates, linkStates };
}
