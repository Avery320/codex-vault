import { describe, expect, it } from 'vitest';
import type { TemplateResult } from 'lit';

import { CometGraph } from './comet-graph';
import { makeGraph } from './test-utils';

describe('comet-graph', () => {
  it('derives note and tag nodes from graph data', () => {
    const element = new CometGraph();
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

    expect((element as any).visibleGraph.nodeInfo.note).toBeDefined();
    expect((element as any).visibleGraph.nodeInfo.topic.type).toBe('tag');
  });

  it('publishes and clears the selected graph node', () => {
    const element = new CometGraph();
    let selected: unknown;
    element.addEventListener('node-click', (event: Event) => {
      selected = (event as CustomEvent).detail;
    });

    (element as any)._onCanvasNodeClick('note-a');
    expect(selected).toBe('note-a');
    expect((element as any).selectedNodeId).toBe('note-a');

    element.clearSelection();
    expect((element as any).selectedNodeId).toBeNull();
  });

  it('passes label visibility settings to the graph canvas', () => {
    const element = new CometGraph();
    element.labels = 'always';
    const template = element.render() as TemplateResult;

    expect(template.strings.join('')).toContain('.labels=');
    expect(template.values).toContain('always');
  });
});
