import { describe, expect, it } from 'vitest';

import {
  computeFitZoom,
  computeIncomingReferenceCounts,
  computeNodeRadius,
  measureGraphViewport,
} from './graph-canvas';
import type { VisibleGraph } from '../lib/graph-view-model';

describe('graph canvas layout', () => {
  it('measures the graph container before the browser viewport', () => {
    const parent = document.createElement('comet-graph');
    const element = document.createElement('comet-graph-canvas');
    parent.append(element);
    element.getBoundingClientRect = () =>
      ({ width: 0, height: 0 } as DOMRect);
    parent.getBoundingClientRect = () =>
      ({ width: 240, height: 160 } as DOMRect);

    expect(measureGraphViewport(element, { width: 1200, height: 900 })).toEqual(
      { width: 240, height: 160 }
    );
  });

  it('fits graph bounds without exceeding the zoom cap', () => {
    expect(
      computeFitZoom(
        { x: [0, 100], y: [0, 50] },
        { width: 220, height: 120 },
        10
      )
    ).toBe(2);
    expect(
      computeFitZoom(
        { x: [0, 100], y: [0, 50] },
        { width: 220, height: 120 },
        10,
        1.4
      )
    ).toBe(1.4);
  });

  it('counts only incoming note references', () => {
    const graph = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'topic' }],
      nodeInfo: {
        a: { id: 'a', type: 'note', title: 'a', properties: {}, tags: [] },
        b: { id: 'b', type: 'note', title: 'b', properties: {}, tags: [] },
        topic: {
          id: 'topic',
          type: 'tag',
          title: 'topic',
          properties: {},
          tags: [],
        },
      },
      links: [
        { source: 'a', target: 'b' },
        { source: 'topic', target: 'b' },
        { source: 'b', target: 'b' },
      ],
    } satisfies VisibleGraph;

    expect(computeIncomingReferenceCounts(graph).get('b')).toBe(1);
  });

  it('uses bounded square-root node sizing', () => {
    expect(computeNodeRadius(0, 1)).toBeCloseTo(0.8);
    expect(computeNodeRadius(4, 1)).toBeCloseTo(1.9);
    expect(computeNodeRadius(100, 1)).toBeCloseTo(3.2);
  });
});
