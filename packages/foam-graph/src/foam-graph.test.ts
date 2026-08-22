import { describe, expect, it } from 'vitest';
import type { TemplateResult } from 'lit';

import { FoamGraph } from './foam-graph';
import { makeGraph } from './test-utils';

describe('foam-graph', () => {
  it('derives visible graph data from raw graph data', () => {
    const element = new FoamGraph();
    element.graphData = makeGraph({
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

    (element as any).updated(new Map([['graphData', null]]));

    const visibleGraph = (element as any).visibleGraph;
    expect(visibleGraph.nodeInfo.note).toBeDefined();
    expect(visibleGraph.nodeInfo.topic.type).toBe('tag');
  });

  it('keeps derived graph data cached for unrelated visual state changes', () => {
    const element = new FoamGraph();
    element.graphData = makeGraph({
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

    (element as any).updated(new Map([['graphData', null]]));
    const visibleGraph = (element as any).visibleGraph;

    element.labels = { fade: 1 };
    element.render();

    expect((element as any).visibleGraph).toBe(visibleGraph);
  });

  it('updates the single selected node from canvas events', () => {
    const element = new FoamGraph();

    (element as any)._onCanvasNodeClick('note-a');
    expect((element as any).selectedNodeId).toBe('note-a');

    (element as any)._onCanvasNodeClick('note-b');
    expect((element as any).selectedNodeId).toBe('note-b');
  });

  it('keeps public node-click event detail as the node id string', () => {
    const element = new FoamGraph();
    let detail: unknown;
    element.addEventListener('node-click', (event: Event) => {
      detail = (event as CustomEvent).detail;
    });

    (element as any)._onCanvasNodeClick('note-a');

    expect(detail).toBe('note-a');
  });

  it('clears a persistent graph selection', () => {
    const element = new FoamGraph();
    (element as any)._onCanvasNodeClick('note-a');

    element.clearSelection();

    expect((element as any).selectedNodeId).toBeNull();
  });

  it('passes labels setting to the canvas', () => {
    const element = new FoamGraph();
    element.labels = 'always';

    const t = element.render() as TemplateResult;

    expect(t.strings.join('')).toContain('.labels=');
    expect(t.values).toContain('always');
  });
});
