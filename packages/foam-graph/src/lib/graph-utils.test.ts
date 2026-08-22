import { describe, expect, it } from 'vitest';
import { makeGraph } from '../test-utils';
import { createGraphModel } from './graph-utils';

describe('createGraphModel', () => {
  it('keeps generated tag nodes out of the input graph', () => {
    const graph = makeGraph({
      nodeInfo: {
        note: {
          id: 'note',
          type: 'note',
          title: 'Note',
          properties: {},
          tags: [{ label: 'topic' }],
        },
      },
    });

    const model = createGraphModel(graph);

    expect(model.nodeInfo.topic).toBeDefined();
    expect(graph.nodeInfo.topic).toBeUndefined();
  });

  it('creates one explicit node and link for each tag', () => {
    const model = createGraphModel(
      makeGraph({
        nodeInfo: {
          note: {
            id: 'note',
            type: 'note',
            title: 'Note',
            properties: {},
            tags: [{ label: 'parent/child' }],
          },
        },
      })
    );

    expect(model.nodeInfo['parent/child']).toMatchObject({
      title: '#parent/child',
      type: 'tag',
    });
    expect(model.nodeInfo.parent).toBeUndefined();
    expect(model.links).toContainEqual({
      source: 'parent/child',
      target: 'note',
    });
  });

  it('deduplicates repeated tag links', () => {
    const model = createGraphModel(
      makeGraph({
        nodeInfo: {
          note: {
            id: 'note',
            type: 'note',
            title: 'Note',
            properties: {},
            tags: [{ label: 'topic' }, { label: 'topic' }],
          },
        },
      })
    );

    expect(model.links).toEqual([{ source: 'topic', target: 'note' }]);
  });
});
