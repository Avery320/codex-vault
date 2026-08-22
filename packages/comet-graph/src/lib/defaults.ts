import type { ResolvedStyle } from './types';

export function getDefaultStyle(): ResolvedStyle {
  return {
    background: '#202020',
    fontSize: 10,
    fontFamily: 'Sans-Serif',
    lineColor: '#277da1',
    lineWidth: 0.4,
    highlightedForeground: '#f9c74f',
    node: {
      note: '#277da1',
      placeholder: '#545454',
      tag: '#f9c74f',
    },
  };
}
