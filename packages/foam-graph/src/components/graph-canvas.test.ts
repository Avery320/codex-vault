import { describe, expect, it } from 'vitest';

import {
  computeFitZoom,
  computeIncomingReferenceCounts,
  computeLabelOpacity,
  computeNodeRadius,
  graphPointToViewport,
  measureGraphViewport,
} from './graph-canvas';
import type { VisibleGraph } from '../lib/graph-view-model';

describe('measureGraphViewport', () => {
  it('uses the graph element size instead of the browser viewport', () => {
    const element = document.createElement('foam-graph-canvas');
    element.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 180,
      } as DOMRect);

    expect(measureGraphViewport(element, { width: 1200, height: 900 })).toEqual(
      {
        width: 320,
        height: 180,
      }
    );
  });

  it('falls back to the parent element size before the browser viewport', () => {
    const parent = document.createElement('foam-graph');
    const element = document.createElement('foam-graph-canvas');
    parent.append(element);
    element.getBoundingClientRect = () =>
      ({
        width: 0,
        height: 0,
      } as DOMRect);
    parent.getBoundingClientRect = () =>
      ({
        width: 240,
        height: 160,
      } as DOMRect);

    expect(measureGraphViewport(element, { width: 1200, height: 900 })).toEqual(
      {
        width: 240,
        height: 160,
      }
    );
  });
});

describe('computeLabelOpacity', () => {
  it('keeps labels fully visible when always-show labels is enabled', () => {
    expect(computeLabelOpacity(false, 0.5, () => 0, 'always')).toBe(1);
  });

  it('preserves regular zoom-dependent label fading by default', () => {
    expect(
      computeLabelOpacity(false, 0.5, () => 0.25, { fade: 0 })
    ).toBe(0.25);
  });

  it('keeps highlighted labels fully visible by default', () => {
    expect(
      computeLabelOpacity(true, 0.5, () => 0, { fade: 0 })
    ).toBe(1);
  });
});

describe('graphPointToViewport', () => {
  it('converts graph coordinates through the current canvas transform', () => {
    const transform = {
      a: 2,
      b: 0,
      c: 0,
      d: 2,
      e: 20,
      f: 30,
    } as DOMMatrixReadOnly;

    expect(graphPointToViewport(transform, 10, 15, 1)).toEqual({
      x: 40,
      y: 60,
    });
  });

  it('returns CSS pixel coordinates when the canvas is scaled for device pixels', () => {
    const transform = {
      a: 4,
      b: 0,
      c: 0,
      d: 4,
      e: 40,
      f: 60,
    } as DOMMatrixReadOnly;

    expect(graphPointToViewport(transform, 10, 15, 2)).toEqual({
      x: 40,
      y: 60,
    });
  });
});

describe('computeFitZoom', () => {
  it('computes the zoom needed to fit bounds into the viewport', () => {
    expect(
      computeFitZoom(
        { x: [0, 100], y: [0, 50] },
        { width: 220, height: 120 },
        10
      )
    ).toBe(2);
  });

  it('caps the fit zoom when a max zoom is provided', () => {
    expect(
      computeFitZoom(
        { x: [0, 100], y: [0, 50] },
        { width: 220, height: 120 },
        10,
        1.4
      )
    ).toBe(1.4);
  });

  it('does not increase a smaller fit zoom to the cap', () => {
    expect(
      computeFitZoom(
        { x: [0, 200], y: [0, 100] },
        { width: 220, height: 120 },
        10,
        1.4
      )
    ).toBe(1);
  });
});

describe('node sizing', () => {
  it('counts only incoming note references', () => {
    const graph = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'topic' }],
      nodeInfo: {
        a: { id: 'a', type: 'note', title: 'a', properties: {}, tags: [] },
        b: { id: 'b', type: 'note', title: 'b', properties: {}, tags: [] },
        c: { id: 'c', type: 'note', title: 'c', properties: {}, tags: [] },
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
        { source: 'c', target: 'b' },
        { source: 'topic', target: 'b' },
        { source: 'b', target: 'b' },
      ],
    } satisfies VisibleGraph;

    expect(computeIncomingReferenceCounts(graph).get('b')).toBe(2);
  });

  it('uses square-root growth and caps large nodes', () => {
    expect(computeNodeRadius(0, 1)).toBeCloseTo(0.8);
    expect(computeNodeRadius(4, 1)).toBeCloseTo(1.9);
    expect(computeNodeRadius(100, 1)).toBeCloseTo(3.2);
    expect(computeNodeRadius(4, 1.5)).toBeCloseTo(2.85);
  });
});
