import { rgb } from 'd3-color';
import type { RGBColor } from 'd3-color';
import type { GraphModelNode, ResolvedStyle } from './types';

export function getNodeColor(
  nodeInfo: GraphModelNode,
  highlighted: boolean,
  style: ResolvedStyle
): RGBColor {
  if (highlighted) return rgb(style.highlightedForeground);
  const customColor = nodeInfo.properties.color;
  const color =
    typeof customColor === 'string'
      ? customColor
      : style.node[nodeInfo.type] ?? style.node.note;
  return rgb(color);
}
