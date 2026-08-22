import type { GraphData } from '../protocol';
import type { GraphModel } from './types';

export function createGraphModel(graph: GraphData): GraphModel {
  const model: GraphModel = {
    nodeInfo: { ...graph.nodeInfo },
    links: [...graph.links],
  };
  const linkKeys = new Set(
    model.links.map(link => `${link.source}->${link.target}`)
  );

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
      const key = `${tag.label}->${node.id}`;
      if (!linkKeys.has(key)) {
        model.links.push({ source: tag.label, target: node.id });
        linkKeys.add(key);
      }
    }
  }

  return model;
}
