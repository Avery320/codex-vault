import type { GraphData } from './protocol';
import type { GraphModelNode, ResolvedStyle } from './lib/types';

export const makeStyle = (overrides: Partial<ResolvedStyle> = {}): ResolvedStyle => ({
  background: '#202020',
  fontSize: 10,
  fontFamily: 'Sans-Serif',
  lineColor: '#aaaaaa',
  lineWidth: 0.2,
  highlightedForeground: '#ffffff',
  node: {
    note: '#1111ff',
    placeholder: '#333333',
    tag: '#ffff00',
  },
  ...overrides,
});

export const makeNode = (overrides: Partial<GraphModelNode> = {}): GraphModelNode => ({
  id: '/path/to/note.md',
  type: 'note',
  title: 'Note',
  properties: {},
  tags: [],
  ...overrides,
});

export const makeGraph = (overrides: Partial<GraphData> = {}): GraphData => ({
  nodeInfo: {},
  links: [],
  ...overrides,
});
