import { describe, expect, it } from 'vitest';
import { makeGraph } from '../test-utils';
import { computeGraphStates, createGraphModel } from './graph-utils';
import { GraphModelLink } from './types';

describe('GraphModelLink', () => {
  it('uses node ids for string and object endpoints', () => {
    expect(GraphModelLink.getKey({ source: 'a', target: 'b' })).toBe('a->b');
    expect(
      GraphModelLink.getKey({
        source: {
          id: 'a',
          type: 'note',
          title: 'A',
          properties: {},
          tags: [],
        },
        target: {
          id: 'b',
          type: 'note',
          title: 'B',
          properties: {},
          tags: [],
        },
      })
    ).toBe('a->b');
  });
});

describe('createGraphModel', () => {
  it('copies note nodes without mutating the input', () => {
    const graph = makeGraph({
      nodeInfo: {
        note: {
          id: 'note',
          type: 'note',
          title: 'Note',
          properties: {},
          tags: [],
        },
      },
    });

    const model = createGraphModel(graph);

    expect(model.nodeInfo.note).toEqual(graph.nodeInfo.note);
    expect(model.nodeInfo.note).not.toBe(graph.nodeInfo.note);
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

  it('deduplicates identical links', () => {
    const model = createGraphModel(
      makeGraph({
        nodeInfo: {
          note: {
            id: 'note',
            type: 'note',
            title: 'Note',
            properties: {},
            tags: [],
          },
        },
        links: [
          { source: 'note', target: 'note' },
          { source: 'note', target: 'note' },
        ],
      })
    );

    expect(model.links).toEqual([{ source: 'note', target: 'note' }]);
  });
});

describe('computeGraphStates', () => {
  const graph = createGraphModel(
    makeGraph({
      nodeInfo: {
        a: { id: 'a', type: 'note', title: 'A', properties: {}, tags: [] },
        b: { id: 'b', type: 'note', title: 'B', properties: {}, tags: [] },
        c: { id: 'c', type: 'note', title: 'C', properties: {}, tags: [] },
      },
      links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    })
  );

  it('keeps the whole graph regular without interaction', () => {
    const states = computeGraphStates(graph, new Set(), null);

    expect([...states.nodeStates.values()]).toEqual([
      'regular',
      'regular',
      'regular',
    ]);
    expect([...states.linkStates.values()]).toEqual(['regular', 'regular']);
  });

  it('highlights selected and hovered nodes without fading the others', () => {
    const states = computeGraphStates(graph, new Set(['a']), 'c');

    expect(states.nodeStates.get('a')).toBe('highlighted');
    expect(states.nodeStates.get('b')).toBe('regular');
    expect(states.nodeStates.get('c')).toBe('highlighted');
  });

  it('highlights only links touching an emphasized node', () => {
    const states = computeGraphStates(graph, new Set(['a']), null);

    expect(states.linkStates.get('a->b')).toBe('highlighted');
    expect(states.linkStates.get('b->c')).toBe('regular');
  });
});
