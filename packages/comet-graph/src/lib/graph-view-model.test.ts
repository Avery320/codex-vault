import { describe, expect, it } from 'vitest';
import { makeGraph } from '../test-utils';
import { createGraphModel } from './graph-utils';
import { computeVisibleGraph } from './graph-view-model';

describe('computeVisibleGraph', () => {
  it('returns only enabled node types and their links', () => {
    const graph = createGraphModel(
      makeGraph({
        nodeInfo: {
          a: { id: 'a', type: 'note', title: 'A', properties: {}, tags: [] },
          b: { id: 'b', type: 'image', title: 'B', properties: {}, tags: [] },
          c: { id: 'c', type: 'note', title: 'C', properties: {}, tags: [] },
        },
        links: [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'c' },
        ],
      })
    );

    const visible = computeVisibleGraph(graph, { note: true, image: false });

    expect(visible.nodes.map(node => node.id).sort()).toEqual(['a', 'c']);
    expect(visible.links).toEqual([{ source: 'a', target: 'c' }]);
  });
});
