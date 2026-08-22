import { describe, expect, it } from 'vitest';
import { makeGraph } from '../test-utils';
import { createGraphModel } from './graph-utils';

describe('createGraphModel', () => {
  it('derives one tag node and link without mutating input graph data', () => {
    const graph = makeGraph({
      nodeInfo: {
        note: {
          id: 'note',
          type: 'note',
          title: 'Note',
          properties: {},
          tags: [{ label: 'topic' }, { label: 'topic' }],
        },
      },
    });

    const model = createGraphModel(graph);

    expect(model.nodeInfo.topic).toMatchObject({ title: '#topic', type: 'tag' });
    expect(model.links).toEqual([{ source: 'topic', target: 'note' }]);
    expect(graph.nodeInfo.topic).toBeUndefined();
  });
});
