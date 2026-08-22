import { describe, expect, it } from 'vitest';
import { rgb } from 'd3-color';
import { getNodeColor } from './colors';
import { makeNode, makeStyle } from '../test-utils';

describe('getNodeColor', () => {
  const style = makeStyle();

  it('uses the configured node type color', () => {
    expect(getNodeColor(makeNode({ type: 'tag' }), false, style).toString()).toBe(
      rgb(style.node.tag).toString()
    );
  });

  it('uses the note color for an unknown type', () => {
    expect(
      getNodeColor(makeNode({ type: 'custom' }), false, style).toString()
    ).toBe(rgb(style.node.note).toString());
  });

  it('preserves an explicit node color', () => {
    const node = makeNode({ properties: { color: 'red' } });
    expect(getNodeColor(node, false, style).toString()).toBe(
      rgb('red').toString()
    );
  });

  it('uses the highlighted foreground only for emphasized nodes', () => {
    const node = makeNode({ properties: { color: 'red' } });
    expect(getNodeColor(node, true, style).toString()).toBe(
      rgb(style.highlightedForeground).toString()
    );
  });
});
