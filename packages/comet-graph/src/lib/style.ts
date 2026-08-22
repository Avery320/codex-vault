import type { GraphStyle } from '../protocol';
import type { ResolvedStyle } from './types';

/**
 * Resolves a GraphStyle into a fully-populated ResolvedStyle by merging
 * user-supplied values on top of the provided defaults.
 */
export function resolveStyle(
  payload: GraphStyle | null,
  defaults: ResolvedStyle
): ResolvedStyle {
  if (!payload) return defaults;
  return {
    ...defaults,
    ...payload.style,
    lineColor:
      payload.style?.lineColor ||
      payload.style?.node?.note ||
      defaults.lineColor,
    node: Object.fromEntries(
      Object.entries({
        ...defaults.node,
        ...payload.style?.node,
      }).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ) as ResolvedStyle['node'],
  };
}
